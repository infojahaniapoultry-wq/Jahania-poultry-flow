import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { dayRange, toNumber } from '../shared/ledger-posting';
import { formatDocumentNo } from '../shared/document-number';
import { getCurrentStockSummary } from '../shared/stock-summary';
import {
  detailsForLedgerRow,
  loadLedgerDetails,
} from '../shared/ledger-details';

const PKT_TIME_ZONE = 'Asia/Karachi';

type DailyPnL = {
  date: string;
  purchaseWt: number;
  purchaseAmt: number;
  soldWt: number;
  salesAmt: number;
  grossProfit: number;
  totalExpenses: number;
  dailyProfit: number;
  remainShort: number;
  purchaseCount: number;
  invoiceCount: number;
};

type DashboardSummary = {
  stock: {
    purchasedWeight: number;
    soldWeight: number;
    availableWeight: number;
  };
  customers: { currentBalance: number }[];
  vendors: { currentBalance: number }[];
  todayPnl: DailyPnL;
  weekPnl: DailyPnL[];
};

type DailyPnLSource = {
  purchases: Array<{
    date: Date;
    weightKg: unknown;
    purchaseAmount: unknown;
    driverCharge?: unknown;
  }>;
  invoices: Array<{
    date: Date;
    totalAmount: unknown;
    driverCharge?: unknown;
    items: Array<{ netWeight: unknown }>;
  }>;
  expenses: Array<{ date: Date; amount: unknown }>;
};

const emptyDailyPnL: DailyPnL = {
  date: '',
  purchaseWt: 0,
  purchaseAmt: 0,
  soldWt: 0,
  salesAmt: 0,
  grossProfit: 0,
  totalExpenses: 0,
  dailyProfit: 0,
  remainShort: 0,
  purchaseCount: 0,
  invoiceCount: 0,
};

function statementPaymentLabel(
  paymentMode?: string | null,
  paymentStatus?: string | null,
) {
  const mode = (paymentMode ?? '').toUpperCase();
  const status = (paymentStatus ?? '').toUpperCase();
  // Keep the original invoice row as UDHAAR. A later settlement is rendered
  // as its own CLEARED UDHAAR row so the customer can see both events.
  if (mode === 'UDHAR') return 'UDHAAR';
  if (mode === 'CHEQUE') return status === 'PENDING' ? 'CHEQUE PENDING' : status === 'BOUNCED' ? 'CHEQUE BOUNCED' : 'CHEQUE';
  if (mode === 'ONLINE') return status === 'PENDING' ? 'ONLINE PENDING' : status === 'FAILED' ? 'ONLINE FAILED' : 'ONLINE';
  if (mode === 'CASH') return status === 'OUTSTANDING' ? 'CASH PARTIAL' : 'CASH';
  return mode || 'ADJUSTMENT';
}

function clearedUdhaarLabel(paymentMode?: string | null, status?: string | null) {
  const mode = (paymentMode ?? '').toUpperCase();
  const normalizedStatus = (status ?? '').toUpperCase();
  if (mode === 'CASH' || normalizedStatus === 'COMPLETED') return 'CLEARED UDHAAR';
  if (mode === 'CHEQUE') return normalizedStatus === 'CLEARED' ? 'CLEARED UDHAAR' : normalizedStatus === 'BOUNCED' ? 'UDHAAR REOPENED' : 'UDHAAR CHEQUE PENDING';
  if (mode === 'ONLINE') return normalizedStatus === 'COMPLETED' ? 'CLEARED UDHAAR' : normalizedStatus === 'FAILED' ? 'UDHAAR REOPENED' : 'UDHAAR ONLINE PENDING';
  return 'UDHAAR SETTLEMENT';
}

type StatementBusinessRow = {
  id: number;
  date: Date;
  type: string;
  amount: unknown;
  runningBalance: number;
  narration?: string | null;
  paymentMode?: string | null;
  paymentStatus?: string | null;
  balanceEffect?: 'CREDIT' | 'DEBIT' | 'SETTLED';
  balanceAmount?: number;
  referenceType?: string | null;
  referenceId?: number | null;
  weightKg: number | null;
  ratePerKg: number | null;
  rateCount: number;
};

function toPktDateKey(date: Date) {
  return date.toLocaleDateString('en-CA', { timeZone: PKT_TIME_ZONE });
}

function buildDailyPnL(date: string, source: DailyPnLSource): DailyPnL {
  const purchaseWt = source.purchases.reduce(
    (sum, purchase) => sum + toNumber(purchase.weightKg),
    0,
  );
  const purchaseAmt = source.purchases.reduce(
    (sum, purchase) => sum + toNumber(purchase.purchaseAmount),
    0,
  );
  const soldWt = source.invoices.reduce(
    (sum, invoice) =>
      sum +
      invoice.items.reduce(
        (itemSum, item) => itemSum + toNumber(item.netWeight),
        0,
      ),
    0,
  );
  const salesAmt = source.invoices.reduce(
    (sum, invoice) => sum + toNumber(invoice.totalAmount),
    0,
  );
  const totalExpenses = source.expenses.reduce(
    (sum, expense) => sum + toNumber(expense.amount),
    0,
  );
  const driverCharges =
    source.purchases.reduce(
      (sum, purchase) => sum + toNumber(purchase.driverCharge),
      0,
    ) +
    source.invoices.reduce(
      (sum, invoice) => sum + toNumber(invoice.driverCharge),
      0,
    );
  const grossProfit = salesAmt - purchaseAmt;
  const allExpenses = totalExpenses + driverCharges;
  const dailyProfit = grossProfit - allExpenses;
  const remainShort = purchaseWt - soldWt;

  return {
    date,
    purchaseWt,
    purchaseAmt,
    soldWt,
    salesAmt,
    grossProfit,
    totalExpenses: allExpenses,
    dailyProfit,
    remainShort,
    purchaseCount: source.purchases.length,
    invoiceCount: source.invoices.length,
  };
}

function buildOptionalDateFilter(startDate?: string, endDate?: string) {
  if (!startDate && !endDate) return {};

  const date: { gte?: Date; lte?: Date } = {};
  if (startDate) date.gte = dayRange(startDate).start;
  if (endDate) date.lte = dayRange(endDate).end;

  return { date };
}

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async getDailyPnL(date: string) {
    const { start, end } = dayRange(date);

    const [purchases, invoices, expenses] = await Promise.all([
      this.prisma.purchaseEntry.findMany({
        where: { date: { gte: start, lte: end }, isVoided: false },
      }),
      this.prisma.invoice.findMany({
        where: { date: { gte: start, lte: end }, isVoided: false },
        include: { items: true },
      }),
      this.prisma.expenseEntry.findMany({
        where: { date: { gte: start, lte: end } },
      }),
    ]);

    return buildDailyPnL(date, { purchases, invoices, expenses });
  }

  async getDashboardSummary(date?: string): Promise<DashboardSummary> {
    const effectiveDate = date ?? new Date().toISOString().split('T')[0];
    const weekDates = Array.from({ length: 7 }, (_, index) => {
      const d = new Date(effectiveDate);
      d.setDate(d.getDate() - (6 - index));
      return d.toISOString().split('T')[0];
    });
    const weekStart = dayRange(weekDates[0]).start;
    const weekEnd = dayRange(weekDates[weekDates.length - 1]).end;

    const [
      stockResult,
      customersResult,
      vendorsResult,
      purchasesResult,
      invoicesResult,
      expensesResult,
    ] = await Promise.allSettled([
      this.getStockSummary(),
      this.prisma.customer.findMany({
        select: { currentBalance: true },
      }),
      this.prisma.vendor.findMany({
        select: { currentBalance: true },
      }),
      this.prisma.purchaseEntry.findMany({
        where: {
          date: { gte: weekStart, lte: weekEnd },
          isVoided: false,
        },
        select: {
          date: true,
          weightKg: true,
          purchaseAmount: true,
          driverCharge: true,
        },
      }),
      this.prisma.invoice.findMany({
        where: {
          date: { gte: weekStart, lte: weekEnd },
          isVoided: false,
        },
        include: { items: { select: { netWeight: true } } },
      }),
      this.prisma.expenseEntry.findMany({
        where: { date: { gte: weekStart, lte: weekEnd } },
        select: {
          date: true,
          amount: true,
        },
      }),
    ]);

    const stock =
      stockResult.status === 'fulfilled'
        ? stockResult.value
        : {
            purchasedWeight: 0,
            soldWeight: 0,
            availableWeight: 0,
          };
    const customers =
      customersResult.status === 'fulfilled' ? customersResult.value : [];
    const vendors =
      vendorsResult.status === 'fulfilled' ? vendorsResult.value : [];
    const purchases =
      purchasesResult.status === 'fulfilled' ? purchasesResult.value : [];
    const invoices =
      invoicesResult.status === 'fulfilled' ? invoicesResult.value : [];
    const expenses =
      expensesResult.status === 'fulfilled' ? expensesResult.value : [];

    const weekBuckets = new Map<string, DailyPnL>(
      weekDates.map((day) => [day, { ...emptyDailyPnL, date: day }]),
    );

    for (const purchase of purchases) {
      const bucket = weekBuckets.get(toPktDateKey(purchase.date));
      if (!bucket) continue;
      bucket.purchaseWt += toNumber(purchase.weightKg);
      bucket.purchaseAmt += toNumber(purchase.purchaseAmount);
      bucket.totalExpenses += toNumber(purchase.driverCharge);
      bucket.purchaseCount += 1;
    }

    for (const invoice of invoices) {
      const bucket = weekBuckets.get(toPktDateKey(invoice.date));
      if (!bucket) continue;
      bucket.soldWt += invoice.items.reduce(
        (sum, item) => sum + toNumber(item.netWeight),
        0,
      );
      bucket.salesAmt += toNumber(invoice.totalAmount);
      bucket.totalExpenses += toNumber(invoice.driverCharge);
      bucket.invoiceCount += 1;
    }

    for (const expense of expenses) {
      const bucket = weekBuckets.get(toPktDateKey(expense.date));
      if (!bucket) continue;
      bucket.totalExpenses += toNumber(expense.amount);
    }

    const weekPnl = weekDates.map((day) => {
      const bucket = weekBuckets.get(day) ?? { ...emptyDailyPnL, date: day };
      bucket.grossProfit = bucket.salesAmt - bucket.purchaseAmt;
      bucket.dailyProfit = bucket.grossProfit - bucket.totalExpenses;
      bucket.remainShort = bucket.purchaseWt - bucket.soldWt;
      return bucket;
    });

    return {
      stock,
      customers: customers.map((customer) => ({
        currentBalance: toNumber(customer.currentBalance),
      })),
      vendors: vendors.map((vendor) => ({
        currentBalance: toNumber(vendor.currentBalance),
      })),
      todayPnl: weekPnl.at(-1) ?? { ...emptyDailyPnL, date: effectiveDate },
      weekPnl,
    };
  }

  async getStockSummary() {
    return getCurrentStockSummary(this.prisma);
  }

  async getDailyPerformance(date: string) {
    const { start, end } = dayRange(date);
    const previousDay = new Date(start);
    previousDay.setDate(previousDay.getDate() - 1);
    const previousRange = dayRange(previousDay.toISOString());

    const [
      invoices,
      vouchers,
      purchases,
      customers,
      transports,
      previousInvoices,
    ] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { date: { gte: start, lte: end }, isVoided: false },
        include: {
          customer: { select: { shopName: true } },
          items: true,
        },
      }),
      this.prisma.voucher.findMany({
        where: { date: { gte: start, lte: end }, type: 'RECOVERY' },
        include: { customer: { select: { shopName: true } } },
      }),
      this.prisma.purchaseEntry.findMany({
        where: { date: { gte: start, lte: end }, isVoided: false },
        include: { vendor: { select: { name: true } } },
      }),
      this.prisma.customer.findMany({
        where: { isActive: true },
        select: { id: true, shopName: true, currentBalance: true },
      }),
      this.prisma.transportAdvance.findMany({
        where: { date: { gte: start, lte: end } },
      }),
      this.prisma.invoice.findMany({
        where: {
          date: { gte: previousRange.start, lte: previousRange.end },
          isVoided: false,
        },
        include: { customer: { select: { shopName: true } } },
        orderBy: { date: 'desc' },
        take: 1,
      }),
    ]);

    const currentSupplyAmount = invoices.reduce(
      (s, inv) => s + toNumber(inv.totalAmount),
      0,
    );
    const currentRecoveryAmount = vouchers.reduce(
      (s, v) => s + toNumber(v.amount),
      0,
    );
    const totalCreditBalance = customers.reduce(
      (s, c) => s + toNumber(c.currentBalance),
      0,
    );
    const transportCost = transports.reduce(
      (s, t) => s + toNumber(t.amount),
      0,
    );
    const purchaseAmount = purchases.reduce(
      (s, p) => s + toNumber(p.purchaseAmount),
      0,
    );
    const grossProfit = currentSupplyAmount - purchaseAmount;
    const totalExpenses = await this.prisma.expenseEntry.aggregate({
      where: { date: { gte: start, lte: end } },
      _sum: { amount: true },
    });
    const dailyProfit =
      grossProfit - toNumber(totalExpenses._sum.amount) - transportCost;
    const lastSupply = previousInvoices[0] ?? null;

    return {
      date,
      lastSupplyDate: lastSupply?.date ?? null,
      lastSupplyCustomer: lastSupply?.customer?.shopName ?? null,
      lastSupplyAmount: lastSupply ? toNumber(lastSupply.totalAmount) : 0,
      currentSupplyDate: date,
      currentSupplyAmount,
      currentRecoveryAmount,
      creditBalance: totalCreditBalance,
      perShopBalance: customers.map((c) => ({
        shopName: c.shopName,
        balance: toNumber(c.currentBalance),
      })),
      suppliesCount: invoices.length,
      recoveriesCount: vouchers.length,
      totalPurchaseAmount: purchaseAmount,
      purchaseSummary: purchases.map((p) => ({
        vendor: p.vendor?.name ?? null,
        amount: toNumber(p.purchaseAmount),
        ratePerKg: toNumber(p.ratePerKg),
        weightKg: toNumber(p.weightKg),
      })),
      transportCost,
      grossProfit,
      totalExpenses: toNumber(totalExpenses._sum.amount),
      dailyProfit,
      recoveries: vouchers.map((v) => ({
        customer: v.customer?.shopName,
        amount: toNumber(v.amount),
        paymentMode: v.paymentMode,
      })),
    };
  }

  async getCustomerStatement(
    customerId: number,
    startDate?: string,
    endDate?: string,
  ) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });
    const ledgerRows = await this.prisma.customerLedger.findMany({
      where: {
        customerId,
        ...buildOptionalDateFilter(startDate, endDate),
      },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });
    const invoiceIds = Array.from(
      new Set(
        ledgerRows
          .filter((row) => row.referenceType === 'INVOICE')
          .map((row) => row.referenceId)
          .filter((id): id is number => typeof id === 'number'),
      ),
    );
    const voucherIds = Array.from(
      new Set(
        ledgerRows
          .filter((row) => row.referenceType === 'VOUCHER')
          .map((row) => row.referenceId)
          .filter((id): id is number => typeof id === 'number'),
      ),
    );
    const [invoices, vouchers] = await Promise.all([
      invoiceIds.length
        ? this.prisma.invoice.findMany({
            where: { id: { in: invoiceIds } },
            select: {
              id: true,
              totalAmount: true,
              settledAmount: true,
              paymentMode: true,
              paymentStatus: true,
            },
          })
        : ([] as any[]),
      voucherIds.length
        ? this.prisma.voucher.findMany({
            where: { id: { in: voucherIds } },
            select: { id: true, type: true, paymentMode: true },
          })
        : ([] as any[]),
    ]);
    const [chequeLogs, onlineLogs] = await Promise.all([
      voucherIds.length
        ? this.prisma.chequeLog.findMany({
            where: { sourceType: 'VOUCHER', sourceId: { in: voucherIds } },
            select: { sourceId: true, status: true },
          })
        : ([] as any[]),
      voucherIds.length
        ? this.prisma.onlinePaymentLog.findMany({
            where: { sourceType: 'VOUCHER', sourceId: { in: voucherIds } },
            select: { sourceId: true, status: true },
          })
        : ([] as any[]),
    ]);
    const invoiceById = new Map<number, any>(
      (invoices as any[]).map((invoice: any) => [invoice.id, invoice] as [number, any]),
    );
    const voucherById = new Map<number, any>(
      (vouchers as any[]).map((voucher: any) => [voucher.id, voucher] as [number, any]),
    );
    const chequeByVoucherId = new Map<number | null, any>(
      (chequeLogs as any[]).map((log: any) => [log.sourceId, log.status] as [number | null, any]),
    );
    const onlineByVoucherId = new Map<number | null, any>(
      (onlineLogs as any[]).map((log: any) => [log.sourceId, log.status] as [number | null, any]),
    );
    const initialInvoicePayments = new Map<number, number>();
    for (const row of ledgerRows) {
      if (row.referenceType === 'INVOICE_PAYMENT' && typeof row.referenceId === 'number') {
        initialInvoicePayments.set(
          row.referenceId,
          (initialInvoicePayments.get(row.referenceId) ?? 0) + toNumber(row.amount),
        );
      }
    }
    const ledgerDetails = await loadLedgerDetails(this.prisma, ledgerRows);

    const openingBalance = toNumber(customer?.openingBalance);
    let runningBalance = openingBalance;
    const ledger: StatementBusinessRow[] = ledgerRows.flatMap(
      (row): StatementBusinessRow[] => {
      if (row.referenceType === 'INVOICE_PAYMENT') return [];

      const invoice = row.referenceType === 'INVOICE' && typeof row.referenceId === 'number'
        ? invoiceById.get(row.referenceId)
        : undefined;
      if (invoice) {
        const initialPaid = initialInvoicePayments.get(invoice.id) ?? (
          invoice.paymentMode === 'UDHAR' ? 0 : toNumber(invoice.settledAmount)
        );
        runningBalance += Math.max(toNumber(invoice.totalAmount) - initialPaid, 0);
        return [{
          id: row.id,
          date: row.date,
          type: statementPaymentLabel(invoice.paymentMode, invoice.paymentStatus),
          amount: invoice.totalAmount,
          runningBalance,
          narration: row.narration,
          paymentMode: invoice.paymentMode,
          paymentStatus: invoice.paymentStatus,
          referenceType: row.referenceType,
          referenceId: row.referenceId,
          ...detailsForLedgerRow(ledgerDetails, row),
        }];
      }

      if (row.referenceType === 'VOUCHER' && typeof row.referenceId === 'number' && (row.narration ?? '').startsWith('Credit settlement')) {
        const voucher = voucherById.get(row.referenceId);
        const paymentStatus = voucher?.paymentMode === 'CHEQUE'
          ? chequeByVoucherId.get(row.referenceId)
          : voucher?.paymentMode === 'ONLINE'
            ? onlineByVoucherId.get(row.referenceId)
            : 'COMPLETED';
        runningBalance -= toNumber(row.amount);
        return [{
          id: row.id,
          date: row.date,
          type: clearedUdhaarLabel(voucher?.paymentMode, paymentStatus),
          amount: row.amount,
          runningBalance,
          narration: 'Udhaar settlement',
          paymentMode: voucher?.paymentMode,
          paymentStatus,
          referenceType: row.referenceType,
          referenceId: row.referenceId,
          weightKg: null,
          ratePerKg: null,
          rateCount: 0,
        }];
      }

      const amount = toNumber(row.amount);
      runningBalance =
        row.type === 'DEBIT'
          ? runningBalance + amount
          : runningBalance - amount;
      return [{
        id: row.id,
        date: row.date,
        type: row.type,
        amount: row.amount,
        runningBalance,
        narration: row.narration,
        referenceType: row.referenceType,
        referenceId: row.referenceId,
        ...detailsForLedgerRow(ledgerDetails, row),
      }];
      },
    );

    return {
      customer,
      openingBalance,
      closingBalance: ledger.at(-1)?.runningBalance ?? openingBalance,
      ledger,
    };
  }

  async getVendorStatement(
    vendorId: number,
    startDate?: string,
    endDate?: string,
  ) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
    });
    const statementEndFilter = endDate
      ? buildOptionalDateFilter(undefined, endDate)
      : {};
    const ledgerRows = await this.prisma.vendorLedger.findMany({
      where: {
        vendorId,
        ...statementEndFilter,
      },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });
    // Fully settled purchases do not create a VendorLedger row because they
    // do not change the amount payable to the vendor. They are still valid
    // business transactions and must be visible in the vendor statement.
    const purchaseRows = await this.prisma.purchaseEntry.findMany({
      where: {
        vendorId,
        isVoided: false,
        ...statementEndFilter,
      },
      select: {
        id: true,
        date: true,
        createdAt: true,
        weightKg: true,
        ratePerKg: true,
        purchaseAmount: true,
        settledAmount: true,
        paymentMode: true,
        paymentStatus: true,
        notes: true,
      },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });

    const voucherIds = Array.from(
      new Set(
        ledgerRows
          .filter((row) => row.referenceType?.includes('VOUCHER'))
          .map((row) => row.referenceId)
          .filter((id): id is number => typeof id === 'number'),
      ),
    );
    const [vouchers, chequeLogs, onlineLogs] = await Promise.all([
      voucherIds.length
        ? this.prisma.voucher.findMany({
            where: { id: { in: voucherIds } },
            select: { id: true, paymentMode: true },
          })
        : ([] as any[]),
      voucherIds.length
        ? this.prisma.chequeLog.findMany({
            where: { sourceType: 'VOUCHER', sourceId: { in: voucherIds } },
            select: { sourceId: true, status: true },
          })
        : ([] as any[]),
      voucherIds.length
        ? this.prisma.onlinePaymentLog.findMany({
            where: { sourceType: 'VOUCHER', sourceId: { in: voucherIds } },
            select: { sourceId: true, status: true },
          })
        : ([] as any[]),
    ]);
    const voucherById = new Map<number, any>(
      (vouchers as any[]).map((voucher: any) => [voucher.id, voucher] as [number, any]),
    );
    const chequeByVoucherId = new Map<number | null, any>(
      (chequeLogs as any[]).map((log: any) => [log.sourceId, log.status] as [number | null, any]),
    );
    const onlineByVoucherId = new Map<number | null, any>(
      (onlineLogs as any[]).map((log: any) => [log.sourceId, log.status] as [number | null, any]),
    );
    const initialPurchaseOutstanding = new Map<number, number>();
    for (const row of ledgerRows) {
      if (row.referenceType === 'PURCHASE' && typeof row.referenceId === 'number') {
        initialPurchaseOutstanding.set(
          row.referenceId,
          (initialPurchaseOutstanding.get(row.referenceId) ?? 0) + toNumber(row.amount),
        );
      }
    }
    const ledgerDetails = await loadLedgerDetails(this.prisma, ledgerRows);

    const baseOpeningBalance = toNumber(vendor?.openingBalance);
    let runningBalance = baseOpeningBalance;
    const statementEvents = [
      ...ledgerRows
        .filter((row) => row.referenceType !== 'PURCHASE')
        .map((row) => ({
        kind: 'ledger' as const,
        date: row.date,
        createdAt: row.createdAt,
        id: row.id,
        row,
      })),
      ...purchaseRows.map((purchase) => ({
        kind: 'purchase' as const,
        date: purchase.date,
        createdAt: purchase.createdAt,
        id: -purchase.id,
        purchase,
      })),
    ].sort((left, right) => {
      const dateDifference = left.date.getTime() - right.date.getTime();
      if (dateDifference !== 0) return dateDifference;

      const leftCreatedAt = left.createdAt?.getTime?.() ?? 0;
      const rightCreatedAt = right.createdAt?.getTime?.() ?? 0;
      return leftCreatedAt - rightCreatedAt || left.id - right.id;
    });

    const ledger: StatementBusinessRow[] = statementEvents.map(
      (event): StatementBusinessRow => {
      if (event.kind === 'purchase') {
        const purchaseAmount = toNumber(event.purchase.purchaseAmount);
        const initialOutstanding = initialPurchaseOutstanding.has(event.purchase.id)
          ? Math.min(initialPurchaseOutstanding.get(event.purchase.id) ?? 0, purchaseAmount)
          : event.purchase.paymentMode === 'UDHAR'
            ? purchaseAmount
            : 0;

          runningBalance += initialOutstanding;

        return {
          id: event.id,
          date: event.purchase.date,
          type: statementPaymentLabel(event.purchase.paymentMode, event.purchase.paymentStatus),
          amount: purchaseAmount,
          runningBalance,
          narration:
            event.purchase.notes ?? `Purchase from ${vendor?.name ?? 'Vendor'}`,
          paymentMode: event.purchase.paymentMode,
          paymentStatus: event.purchase.paymentStatus,
          balanceEffect: initialOutstanding > 0 ? 'CREDIT' : 'SETTLED',
          balanceAmount: initialOutstanding,
          referenceType: 'PURCHASE',
          referenceId: event.purchase.id,
          weightKg: toNumber(event.purchase.weightKg),
          ratePerKg: toNumber(event.purchase.ratePerKg),
          rateCount: 1,
        };
      }

      if (event.row.referenceType?.includes('VOUCHER') && typeof event.row.referenceId === 'number' && (event.row.narration ?? '').startsWith('Credit settlement')) {
        const voucher = voucherById.get(event.row.referenceId);
        const paymentStatus = voucher?.paymentMode === 'CHEQUE'
          ? chequeByVoucherId.get(event.row.referenceId)
          : voucher?.paymentMode === 'ONLINE'
            ? onlineByVoucherId.get(event.row.referenceId)
            : 'COMPLETED';
        runningBalance -= toNumber(event.row.amount);
        return {
          id: event.row.id,
          date: event.row.date,
          type: clearedUdhaarLabel(voucher?.paymentMode, paymentStatus),
          amount: event.row.amount,
          runningBalance,
          narration: 'Udhaar settlement',
          paymentMode: voucher?.paymentMode,
          paymentStatus,
          balanceEffect: 'DEBIT',
          balanceAmount: toNumber(event.row.amount),
          referenceType: event.row.referenceType,
          referenceId: event.row.referenceId,
          weightKg: null,
          ratePerKg: null,
          rateCount: 0,
        };
      }

      const amount = toNumber(event.row.amount);
      runningBalance =
        event.row.type === 'DEBIT'
          ? runningBalance - amount
          : runningBalance + amount;
      const voucher =
        event.row.referenceType?.includes('VOUCHER') &&
        typeof event.row.referenceId === 'number'
          ? voucherById.get(event.row.referenceId)
          : undefined;
      const paymentStatus =
        voucher?.paymentMode === 'CHEQUE'
          ? chequeByVoucherId.get(event.row.referenceId)
          : voucher?.paymentMode === 'ONLINE'
            ? onlineByVoucherId.get(event.row.referenceId)
            : voucher
              ? 'COMPLETED'
              : undefined;
      return {
        id: event.row.id,
        date: event.row.date,
        type: event.row.type,
        amount: event.row.amount,
        runningBalance,
        narration: event.row.narration,
        paymentMode: voucher?.paymentMode,
        paymentStatus,
        balanceEffect: event.row.type === 'DEBIT' ? 'DEBIT' : 'CREDIT',
        balanceAmount: amount,
        referenceType: event.row.referenceType,
        referenceId: event.row.referenceId,
        ...detailsForLedgerRow(ledgerDetails, event.row),
      };
      },
    );

    const statementStart = startDate ? dayRange(startDate).start : null;
    const visibleLedger = statementStart
      ? ledger.filter((row) => row.date >= statementStart)
      : ledger;
    const periodOpeningBalance = statementStart
      ? [...ledger].reverse().find((row) => row.date < statementStart)?.runningBalance ?? baseOpeningBalance
      : baseOpeningBalance;

    return {
      vendor,
      openingBalance: periodOpeningBalance,
      closingBalance: visibleLedger.at(-1)?.runningBalance ?? periodOpeningBalance,
      ledger: visibleLedger,
    };
  }

  async getCashBookReport(startDate?: string, endDate?: string) {
    return this.prisma.cashBook.findMany({
      where: buildOptionalDateFilter(startDate, endDate),
      orderBy: { date: 'asc' },
    });
  }

  async getRecoveryReport(startDate?: string, endDate?: string) {
    const entries = await this.prisma.voucher.findMany({
      where: {
        type: 'RECOVERY',
        ...buildOptionalDateFilter(startDate, endDate),
      },
      include: {
        customer: { select: { shopName: true } },
      },
      orderBy: { date: 'asc' },
    });

    return entries.map((entry) => ({
      date: entry.date,
      customer: entry.customer?.shopName ?? null,
      amount: toNumber(entry.amount),
      paymentMode: entry.paymentMode,
      narration: entry.narration,
      reference: entry.reference,
    }));
  }

  async getExpenseSummary(startDate?: string, endDate?: string) {
    const dateFilter = buildOptionalDateFilter(startDate, endDate);
    const [entries, invoices, purchases] = await Promise.all([
      this.prisma.expenseEntry.findMany({
        where: dateFilter,
        include: { expenseAccount: true },
      }),
      this.prisma.invoice.findMany({
        where: {
          ...dateFilter,
          isVoided: false,
          driverId: { not: null },
          driverCharge: { gt: 0 },
        },
        select: {
          date: true,
          invoiceNo: true,
          driverCharge: true,
          driver: { select: { name: true } },
        },
        orderBy: { date: 'desc' },
      }),
      this.prisma.purchaseEntry.findMany({
        where: {
          ...dateFilter,
          isVoided: false,
          driverId: { not: null },
          driverCharge: { gt: 0 },
        },
        select: {
          id: true,
          date: true,
          driverCharge: true,
          driver: { select: { name: true } },
        },
        orderBy: { date: 'desc' },
      }),
    ]);

    const summary: Record<
      string,
      { expenseAccount: string; category: string; total: number; count: number }
    > = {};
    for (const e of entries) {
      const key = e.expenseAccount.name;
      if (!summary[key]) {
        summary[key] = {
          expenseAccount: key,
          category: e.expenseAccount.category ?? 'General',
          total: 0,
          count: 0,
        };
      }
      summary[key].total += toNumber(e.amount);
      summary[key].count += 1;
    }

    const driverRecords = [
      ...invoices.map((invoice) => ({
        date: invoice.date,
        driver: invoice.driver?.name ?? 'Driver',
        source: 'INVOICE',
        reference: invoice.invoiceNo,
        amount: toNumber(invoice.driverCharge),
        narration: `Driver transport charge for ${invoice.invoiceNo}`,
      })),
      ...purchases.map((purchase) => ({
        date: purchase.date,
        driver: purchase.driver?.name ?? 'Driver',
        source: 'PURCHASE',
        reference: formatDocumentNo('PUR', purchase.id),
        amount: toNumber(purchase.driverCharge),
        narration: `Driver transport charge for ${formatDocumentNo('PUR', purchase.id)}`,
      })),
    ];

    if (driverRecords.length > 0) {
      summary['Driver Transport Charges'] = {
        expenseAccount: 'Driver Transport Charges',
        category: 'Transport',
        total: driverRecords.reduce((sum, row) => sum + row.amount, 0),
        count: driverRecords.length,
      };
    }

    const rows = Object.values(summary).sort((a, b) => b.total - a.total);

    return {
      period: { startDate, endDate },
      summary: rows,
      grandTotal: rows.reduce((s, v) => s + v.total, 0),
      driverRecords,
    };
  }
}
