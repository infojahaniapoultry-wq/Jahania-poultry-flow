import {
  CashBookType,
  LedgerEntryType,
  PaymentMode,
  Prisma,
} from '@prisma/client';

type TxClient = Omit<
  Prisma.TransactionClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

export function toNumber(value: unknown): number {
  return Number(value ?? 0);
}

export function dayRange(dateInput: string) {
  // Use PKT (Asia/Karachi, UTC+5) so early-morning transactions are not missed.
  // A date like '2024-01-15' produces the full day in PKT: 00:00 to 23:59:59 PKT.
  const datePart = dateInput.split('T')[0]; // ensure we only use YYYY-MM-DD
  const start = new Date(`${datePart}T00:00:00.000+05:00`);
  const end = new Date(`${datePart}T23:59:59.999+05:00`);
  return { start, end };
}

export function normalizeDate(input?: string | Date) {
  return input ? new Date(input) : new Date();
}

export async function postCustomerLedger(
  tx: TxClient,
  params: {
    customerId: number;
    date: Date;
    amount: number;
    type: LedgerEntryType;
    narration?: string;
    referenceId?: number;
    referenceType?: string;
    currentBalance?: number;
  },
) {
  const currentBalance =
    params.currentBalance ??
    toNumber(
      (
        await tx.customer.findUnique({
          where: { id: params.customerId },
          select: { currentBalance: true },
        })
      )?.currentBalance,
    );
  const nextBalance =
    params.type === LedgerEntryType.DEBIT
      ? currentBalance + params.amount
      : currentBalance - params.amount;

  await tx.customerLedger.create({
    data: {
      customerId: params.customerId,
      date: params.date,
      type: params.type,
      amount: params.amount,
      runningBalance: nextBalance,
      narration: params.narration,
      referenceId: params.referenceId,
      referenceType: params.referenceType,
    },
  });

  await tx.customer.update({
    where: { id: params.customerId },
    data: { currentBalance: nextBalance },
  });

  return nextBalance;
}

export async function postVendorLedger(
  tx: TxClient,
  params: {
    vendorId: number;
    date: Date;
    amount: number;
    type: LedgerEntryType;
    narration?: string;
    referenceId?: number;
    referenceType?: string;
    currentBalance?: number;
  },
) {
  const currentBalance =
    params.currentBalance ??
    toNumber(
      (
        await tx.vendor.findUnique({
          where: { id: params.vendorId },
          select: { currentBalance: true },
        })
      )?.currentBalance,
    );
  const nextBalance =
    params.type === LedgerEntryType.CREDIT
      ? currentBalance + params.amount
      : currentBalance - params.amount;

  await tx.vendorLedger.create({
    data: {
      vendorId: params.vendorId,
      date: params.date,
      type: params.type,
      amount: params.amount,
      runningBalance: nextBalance,
      narration: params.narration,
      referenceId: params.referenceId,
      referenceType: params.referenceType,
    },
  });

  await tx.vendor.update({
    where: { id: params.vendorId },
    data: { currentBalance: nextBalance },
  });

  return nextBalance;
}

export async function postDriverLedger(
  tx: TxClient,
  params: {
    driverId: number;
    date: Date;
    amount: number;
    type: LedgerEntryType;
    narration?: string;
    referenceId?: number;
    referenceType?: string;
    currentBalance?: number;
  },
) {
  const currentBalance =
    params.currentBalance ??
    toNumber(
      (
        await tx.driver.findUnique({
          where: { id: params.driverId },
          select: { advanceBalance: true },
        })
      )?.advanceBalance,
    );
  const nextBalance =
    params.type === LedgerEntryType.DEBIT
      ? currentBalance + params.amount
      : currentBalance - params.amount;

  await tx.driverLedger.create({
    data: {
      driverId: params.driverId,
      date: params.date,
      type: params.type,
      amount: params.amount,
      runningBalance: nextBalance,
      narration: params.narration,
      referenceId: params.referenceId,
      referenceType: params.referenceType,
    },
  });

  await tx.driver.update({
    where: { id: params.driverId },
    data: { advanceBalance: nextBalance },
  });

  return nextBalance;
}

export async function postCashBook(
  tx: TxClient,
  params: {
    date: Date;
    amount: number;
    kind: CashBookType;
    narration?: string;
    voucherRef?: string;
    referenceId?: number;
    referenceType?: string;
  },
) {
  const lastCash = await tx.cashBook.findFirst({
    orderBy: { id: 'desc' },
    select: { runningBalance: true },
  });
  const currentBalance = toNumber(lastCash?.runningBalance);
  const nextBalance =
    params.kind === CashBookType.RECEIPT
      ? currentBalance + params.amount
      : currentBalance - params.amount;

  return tx.cashBook.create({
    data: {
      date: params.date,
      type: params.kind,
      amount: params.amount,
      narration: params.narration,
      voucherRef: params.voucherRef,
      runningBalance: nextBalance,
      referenceId: params.referenceId,
      referenceType: params.referenceType,
    },
  });
}

export async function postBankLedger(
  tx: TxClient,
  params: {
    bankName: string;
    date: Date;
    amount: number;
    type: LedgerEntryType;
    narration?: string;
    refNo?: string;
  },
) {
  const last = await tx.bankLedger.findFirst({
    where: { bankName: params.bankName },
    orderBy: { id: 'desc' },
    select: { runningBalance: true },
  });
  const currentBalance = toNumber(last?.runningBalance);
  const nextBalance =
    params.type === LedgerEntryType.CREDIT
      ? currentBalance + params.amount
      : currentBalance - params.amount;

  return tx.bankLedger.create({
    data: {
      date: params.date,
      bankName: params.bankName,
      type: params.type,
      refNo: params.refNo,
      amount: params.amount,
      narration: params.narration,
      runningBalance: nextBalance,
    },
  });
}

export async function postEasypaisaLedger(
  tx: TxClient,
  params: {
    date: Date;
    amount: number;
    type: LedgerEntryType;
    narration?: string;
    mobileNo?: string;
  },
) {
  const last = await tx.easypaisaLedger.findFirst({
    orderBy: { id: 'desc' },
    select: { runningBalance: true },
  });
  const currentBalance = toNumber(last?.runningBalance);
  const nextBalance =
    params.type === LedgerEntryType.CREDIT
      ? currentBalance + params.amount
      : currentBalance - params.amount;

  return tx.easypaisaLedger.create({
    data: {
      date: params.date,
      mobileNo: params.mobileNo,
      type: params.type,
      amount: params.amount,
      narration: params.narration,
      runningBalance: nextBalance,
    },
  });
}

export function paymentDirection(paymentMode: PaymentMode) {
  return paymentMode === PaymentMode.CASH
    ? 'CASH'
    : paymentMode === PaymentMode.UDHAR
      ? 'UDHAR'
      : paymentMode === PaymentMode.ONLINE
        ? 'ONLINE'
        : 'CHEQUE';
}
