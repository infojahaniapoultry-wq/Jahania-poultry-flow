import 'dotenv/config';
import {
  LedgerEntryType,
  PaymentMode,
  PrismaClient,
} from '@prisma/client';

const prisma = new PrismaClient();

function toNumber(value: unknown) {
  return Number(value ?? 0);
}

async function main() {
  const [invoices, existingRows, customers] = await Promise.all([
    prisma.invoice.findMany({
      where: { isVoided: false, paymentMode: PaymentMode.CASH },
      select: {
        id: true,
        customerId: true,
        date: true,
        invoiceNo: true,
        totalAmount: true,
        settledAmount: true,
      },
    }),
    prisma.customerLedger.findMany({
      select: { referenceId: true, referenceType: true },
    }),
    prisma.customer.findMany({
      select: { id: true, openingBalance: true },
    }),
  ]);

  const linkedInvoiceIds = new Set(
    existingRows
      .filter(
        (row) =>
          row.referenceType === 'INVOICE' ||
          row.referenceType === 'INVOICE_PAYMENT',
      )
      .map((row) => row.referenceId)
      .filter((id): id is number => typeof id === 'number'),
  );

  const missingInvoices = invoices.filter(
    (invoice) =>
      toNumber(invoice.totalAmount) > 0 &&
      toNumber(invoice.settledAmount) >= toNumber(invoice.totalAmount) &&
      !linkedInvoiceIds.has(invoice.id),
  );

  if (missingInvoices.length === 0) {
    console.log('No missing paid invoice ledger entries found.');
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const invoice of missingInvoices) {
      const totalAmount = toNumber(invoice.totalAmount);
      const settledAmount = toNumber(invoice.settledAmount);

      await tx.customerLedger.create({
        data: {
          customerId: invoice.customerId,
          date: invoice.date,
          createdAt: invoice.date,
          type: LedgerEntryType.DEBIT,
          amount: totalAmount,
          runningBalance: 0,
          narration: `Invoice ${invoice.invoiceNo}`,
          referenceId: invoice.id,
          referenceType: 'INVOICE',
        },
      });

      await tx.customerLedger.create({
        data: {
          customerId: invoice.customerId,
          date: invoice.date,
          createdAt: new Date(invoice.date.getTime() + 1),
          type: LedgerEntryType.CREDIT,
          amount: settledAmount,
          runningBalance: 0,
          narration: `Payment for invoice ${invoice.invoiceNo}`,
          referenceId: invoice.id,
          referenceType: 'INVOICE_PAYMENT',
        },
      });
    }

    const allRows = await tx.customerLedger.findMany({
      select: {
        id: true,
        customerId: true,
        date: true,
        createdAt: true,
        type: true,
        amount: true,
      },
      orderBy: [{ customerId: 'asc' }, { date: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });

    for (const customer of customers) {
      let runningBalance = toNumber(customer.openingBalance);
      for (const row of allRows.filter((entry) => entry.customerId === customer.id)) {
        runningBalance =
          row.type === LedgerEntryType.DEBIT
            ? runningBalance + toNumber(row.amount)
            : runningBalance - toNumber(row.amount);

        await tx.customerLedger.update({
          where: { id: row.id },
          data: { runningBalance },
        });
      }

      await tx.customer.update({
        where: { id: customer.id },
        data: { currentBalance: runningBalance },
      });
    }
  });

  console.log(
    JSON.stringify(
      {
        backfilledInvoices: missingInvoices.length,
        invoiceIds: missingInvoices.map((invoice) => invoice.id),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
