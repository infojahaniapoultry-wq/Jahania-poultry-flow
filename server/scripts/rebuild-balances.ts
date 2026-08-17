import 'dotenv/config';
import { PrismaClient, PaymentMode, PaymentStatus, LedgerEntryType } from '@prisma/client';

const prisma = new PrismaClient();

const unpaidStatuses = [
  PaymentStatus.BOUNCED,
  PaymentStatus.FAILED,
  PaymentStatus.OUTSTANDING,
] as const;

function toNumber(value: unknown) {
  return Number(value ?? 0);
}

function isUnpaidStatus(status?: PaymentStatus | null) {
  return !!status && unpaidStatuses.includes(status as (typeof unpaidStatuses)[number]);
}

async function main() {
  const [customers, vendors, drivers, invoices, purchases, customerLedgers, vendorLedgers, driverLedgers] = await Promise.all([
    prisma.customer.findMany({ select: { id: true, openingBalance: true } }),
    prisma.vendor.findMany({ select: { id: true, openingBalance: true } }),
    prisma.driver.findMany({ select: { id: true } }),
    prisma.invoice.findMany({ select: { id: true, driverId: true, driverCharge: true, date: true, paymentMode: true, paymentStatus: true } }),
    prisma.purchaseEntry.findMany({ select: { id: true, driverId: true, driverCharge: true, date: true, paymentMode: true, paymentStatus: true } }),
    prisma.customerLedger.findMany({ select: { customerId: true, type: true, amount: true, referenceId: true, referenceType: true } }),
    prisma.vendorLedger.findMany({ select: { vendorId: true, type: true, amount: true, referenceId: true, referenceType: true } }),
    prisma.driverLedger.findMany({ select: { driverId: true, type: true, amount: true, referenceId: true, referenceType: true } }),
  ]);

  const invoiceMap = new Map(invoices.map((row) => [row.id, row]));
  const purchaseMap = new Map(purchases.map((row) => [row.id, row]));
  const invoicePaymentKeys = new Set(
    customerLedgers
      .filter((entry) => entry.referenceType === 'INVOICE_PAYMENT')
      .map((entry) => entry.referenceId ?? 0),
  );

  const customerTotals = new Map<number, number>();
  for (const customer of customers) {
    customerTotals.set(customer.id, toNumber(customer.openingBalance));
  }

  for (const entry of customerLedgers) {
    if (entry.referenceType === 'INVOICE') {
      const invoice = entry.referenceId ? invoiceMap.get(entry.referenceId) : null;
      const hasDetailedPaymentPair = invoicePaymentKeys.has(entry.referenceId ?? 0);
      const shouldCount = hasDetailedPaymentPair ||
        invoice?.paymentMode === PaymentMode.UDHAR ||
        isUnpaidStatus(invoice?.paymentStatus);
      if (!shouldCount) continue;
    }

    const delta = entry.type === LedgerEntryType.DEBIT ? toNumber(entry.amount) : -toNumber(entry.amount);
    customerTotals.set(entry.customerId, toNumber(customerTotals.get(entry.customerId)) + delta);
  }

  const vendorTotals = new Map<number, number>();
  for (const vendor of vendors) {
    vendorTotals.set(vendor.id, toNumber(vendor.openingBalance));
  }

  for (const entry of vendorLedgers) {
    if (entry.referenceType === 'PURCHASE') {
      const purchase = entry.referenceId ? purchaseMap.get(entry.referenceId) : null;
      const shouldCount =
        purchase?.paymentMode === PaymentMode.UDHAR ||
        isUnpaidStatus(purchase?.paymentStatus);
      if (!shouldCount) continue;
    }

    const delta = entry.type === LedgerEntryType.CREDIT ? toNumber(entry.amount) : -toNumber(entry.amount);
    vendorTotals.set(entry.vendorId, toNumber(vendorTotals.get(entry.vendorId)) + delta);
  }

  const existingDriverChargeKeys = new Set(
    driverLedgers
      .filter((entry) => entry.referenceType === 'PURCHASE_DRIVER_CHARGE' || entry.referenceType === 'INVOICE_DRIVER_CHARGE')
      .map((entry) => `${entry.referenceType}:${entry.referenceId ?? ''}`),
  );

  const missingDriverCharges = [
    ...purchases
      .filter((row) => row.driverId && toNumber(row.driverCharge) > 0)
      .filter((row) => !existingDriverChargeKeys.has(`PURCHASE_DRIVER_CHARGE:${row.id}`))
      .map((row) => ({
        driverId: row.driverId as number,
        date: row.date,
        amount: toNumber(row.driverCharge),
        type: LedgerEntryType.DEBIT,
        narration: 'Purchase driver charge',
        referenceId: row.id,
        referenceType: 'PURCHASE_DRIVER_CHARGE',
      })),
    ...invoices
      .filter((row) => row.driverId && toNumber(row.driverCharge) > 0)
      .filter((row) => !existingDriverChargeKeys.has(`INVOICE_DRIVER_CHARGE:${row.id}`))
      .map((row) => ({
        driverId: row.driverId as number,
        date: row.date,
        amount: toNumber(row.driverCharge),
        type: LedgerEntryType.DEBIT,
        narration: 'Invoice driver charge',
        referenceId: row.id,
        referenceType: 'INVOICE_DRIVER_CHARGE',
      })),
  ];

  await prisma.$transaction(async (tx) => {
    for (const row of missingDriverCharges) {
      await tx.driverLedger.create({
        data: {
          driverId: row.driverId,
          date: row.date,
          type: row.type,
          amount: row.amount,
          runningBalance: 0,
          narration: row.narration,
          referenceId: row.referenceId,
          referenceType: row.referenceType,
        },
      });
    }

    const allDriverLedgers = await tx.driverLedger.findMany({
      select: { id: true, driverId: true, date: true, type: true, amount: true, createdAt: true },
      orderBy: [{ driverId: 'asc' }, { date: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });

    for (const driver of drivers) {
      const rows = allDriverLedgers.filter((row) => row.driverId === driver.id);
      let current = 0;

      for (const row of rows) {
        current =
          row.type === LedgerEntryType.DEBIT
            ? current + toNumber(row.amount)
            : current - toNumber(row.amount);

        await tx.driverLedger.update({
          where: { id: row.id },
          data: { runningBalance: current },
        });
      }

      await tx.driver.update({
        where: { id: driver.id },
        data: { advanceBalance: current },
      });
    }

    for (const customer of customers) {
      await tx.customer.update({
        where: { id: customer.id },
        data: { currentBalance: customerTotals.get(customer.id) ?? 0 },
      });
    }

    for (const vendor of vendors) {
      await tx.vendor.update({
        where: { id: vendor.id },
        data: { currentBalance: vendorTotals.get(vendor.id) ?? 0 },
      });
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
