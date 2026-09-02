import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateBankLedgerDto,
  CreateChequeLogDto,
  CreateEasypaisaLedgerDto,
  CreateOnlinePaymentLogDto,
  UpdateChequeStatusDto,
  UpdateOnlinePaymentStatusDto,
} from './payments.dto';
import {
  CashBookType,
  ChequeStatus,
  LedgerEntryType,
  OnlineProvider,
  PaymentMode,
  PaymentStatus,
  VoucherType,
} from '@prisma/client';
import {
  normalizeDate,
  postBankLedger,
  postCashBook,
  postCustomerLedger,
  postEasypaisaLedger,
  postVendorLedger,
  toNumber,
} from '../shared/ledger-posting';
import { formatDocumentNo } from '../shared/document-number';

type SettlementSourceType =
  | 'PURCHASE'
  | 'INVOICE'
  | 'EXPENSE'
  | 'VOUCHER'
  | 'TRANSPORT_ADVANCE';

@Injectable()
export class PaymentsService {
  constructor(private prisma: PrismaService) {}

  private isIncomingSource(sourceType?: string | null) {
    return sourceType === 'INVOICE' || sourceType === 'VOUCHER';
  }

  private async getVoucherContext(tx: any, voucherId?: number | null) {
    if (!voucherId) return null;
    return tx.voucher.findUnique({
      where: { id: voucherId },
      select: {
        id: true,
        voucherNo: true,
        type: true,
        customerId: true,
        vendorId: true,
      },
    });
  }

  private async finalizeVoucherSettlement(tx: any, voucherNo?: string | null) {
    if (!voucherNo) return;

    const [invoices, purchases] = await Promise.all([
      tx.invoice.findMany({
        where: { paymentReference: voucherNo, isVoided: false },
        select: { id: true, totalBalance: true, settledAmount: true },
      }),
      tx.purchaseEntry.findMany({
        where: { paymentReference: voucherNo, isVoided: false },
        select: { id: true, purchaseAmount: true, settledAmount: true },
      }),
    ]);

    for (const invoice of invoices) {
      const settledAmount = toNumber(invoice.settledAmount);
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          paymentStatus:
            settledAmount >= toNumber(invoice.totalBalance)
              ? PaymentStatus.COMPLETED
              : PaymentStatus.OUTSTANDING,
        },
      });
    }

    for (const purchase of purchases) {
      const settledAmount = toNumber(purchase.settledAmount);
      await tx.purchaseEntry.update({
        where: { id: purchase.id },
        data: {
          paymentStatus:
            settledAmount >= toNumber(purchase.purchaseAmount)
              ? PaymentStatus.COMPLETED
              : PaymentStatus.OUTSTANDING,
        },
      });
    }
  }

  private async postOutstandingAdjustment(
    tx: any,
    params: {
      sourceType?: string | null;
      sourceId?: number | null;
      amount: number;
      date: Date;
      reverse?: boolean;
      purchaseVendorId?: number | null;
      invoiceCustomerId?: number | null;
    },
  ) {
    if (!params.sourceType || !params.sourceId) return;

    if (params.sourceType === 'VOUCHER') {
      const voucher = await tx.voucher.findUnique({
        where: { id: params.sourceId },
        select: {
          type: true,
          customerId: true,
          vendorId: true,
          voucherNo: true,
        },
      });
      if (!voucher) return;

      const incoming =
        voucher.type === VoucherType.RECOVERY ||
        voucher.type === VoucherType.CREDIT;
      const ledgerType = incoming
        ? params.reverse
          ? LedgerEntryType.CREDIT
          : LedgerEntryType.DEBIT
        : params.reverse
          ? LedgerEntryType.DEBIT
          : LedgerEntryType.CREDIT;
      const narration = params.reverse
        ? 'Voucher payment reversal'
        : 'Voucher payment bounced';

      if (voucher.customerId) {
        await postCustomerLedger(tx, {
          customerId: voucher.customerId,
          date: params.date,
          type: ledgerType,
          amount: params.amount,
          narration,
          referenceId: params.sourceId,
          referenceType: 'VOUCHER_PAYMENT_ADJUSTMENT',
        });
      } else if (voucher.vendorId) {
        await postVendorLedger(tx, {
          vendorId: voucher.vendorId,
          date: params.date,
          type: ledgerType,
          amount: params.amount,
          narration,
          referenceId: params.sourceId,
          referenceType: 'VOUCHER_PAYMENT_ADJUSTMENT',
        });
      }

      let remaining = Math.max(0, params.amount);
      if (remaining > 0) {
        if (voucher.customerId && incoming) {
          const invoices = await tx.invoice.findMany({
            where: voucher.voucherNo
              ? { paymentReference: voucher.voucherNo, isVoided: false }
              : {
                  customerId: voucher.customerId,
                  isVoided: false,
                  settledAmount: { gt: 0 },
                },
            select: {
              id: true,
              totalBalance: true,
              settledAmount: true,
            },
            orderBy: [{ date: 'desc' }, { id: 'desc' }],
          });

          for (const invoice of invoices) {
            const currentSettled = toNumber(invoice.settledAmount);
            if (currentSettled <= 0) continue;

            const applied = Math.min(currentSettled, remaining);
            const nextSettled = currentSettled - applied;
            const totalBalance = toNumber(invoice.totalBalance);
            await tx.invoice.update({
              where: { id: invoice.id },
              data: {
                settledAmount: nextSettled,
                paymentStatus:
                  nextSettled >= totalBalance
                    ? PaymentStatus.COMPLETED
                    : PaymentStatus.OUTSTANDING,
                ...(voucher.voucherNo
                  ? { paymentReference: null, paymentProvider: null }
                  : {}),
              },
            });

            remaining -= applied;
            if (remaining <= 0) break;
          }
        } else if (voucher.vendorId && !incoming) {
          const purchases = await tx.purchaseEntry.findMany({
            where: voucher.voucherNo
              ? { paymentReference: voucher.voucherNo, isVoided: false }
              : {
                  vendorId: voucher.vendorId,
                  isVoided: false,
                  settledAmount: { gt: 0 },
                },
            select: {
              id: true,
              purchaseAmount: true,
              settledAmount: true,
            },
            orderBy: [{ date: 'desc' }, { id: 'desc' }],
          });

          for (const purchase of purchases) {
            const currentSettled = toNumber(purchase.settledAmount);
            if (currentSettled <= 0) continue;

            const applied = Math.min(currentSettled, remaining);
            const nextSettled = currentSettled - applied;
            const totalAmount = toNumber(purchase.purchaseAmount);
            await tx.purchaseEntry.update({
              where: { id: purchase.id },
              data: {
                settledAmount: nextSettled,
                paymentStatus:
                  nextSettled >= totalAmount
                    ? PaymentStatus.COMPLETED
                    : PaymentStatus.OUTSTANDING,
                ...(voucher.voucherNo
                  ? { paymentReference: null, paymentProvider: null }
                  : {}),
              },
            });

            remaining -= applied;
            if (remaining <= 0) break;
          }
        }
      }
      return;
    }

    const incoming = this.isIncomingSource(params.sourceType);
    const isInvoice = params.sourceType === 'INVOICE';
    const ledgerType = isInvoice
      ? params.reverse
        ? LedgerEntryType.CREDIT
        : LedgerEntryType.DEBIT
      : incoming
        ? params.reverse
          ? LedgerEntryType.CREDIT
          : LedgerEntryType.DEBIT
        : params.reverse
          ? LedgerEntryType.DEBIT
          : LedgerEntryType.CREDIT;
    const narration = params.reverse
      ? `${params.sourceType} payment reversal`
      : `${params.sourceType} payment bounced`;
    const referenceType = isInvoice
      ? 'PAYMENT_ADJUSTMENT_INVOICE'
      : params.sourceType === 'PURCHASE'
        ? 'PAYMENT_ADJUSTMENT_PURCHASE'
        : params.sourceType;

    if (params.sourceType === 'INVOICE') {
      const customerId =
        params.invoiceCustomerId ??
        (
          await tx.invoice.findUnique({
            where: { id: params.sourceId },
            select: { customerId: true },
          })
        )?.customerId;
      if (!customerId) return;

      await postCustomerLedger(tx, {
        customerId,
        date: params.date,
        type: ledgerType,
        amount: params.amount,
        narration,
        referenceId: params.sourceId,
        referenceType,
      });
    } else if (params.sourceType === 'PURCHASE') {
      const vendorId =
        params.purchaseVendorId ??
        (
          await tx.purchaseEntry.findUnique({
            where: { id: params.sourceId },
            select: { vendorId: true },
          })
        )?.vendorId;
      if (!vendorId) return;

      await postVendorLedger(tx, {
        vendorId,
        date: params.date,
        type: ledgerType,
        amount: params.amount,
        narration,
        referenceId: params.sourceId,
        referenceType,
      });
    }
  }

  private async updateSourceStatus(
    tx: any,
    sourceType?: string | null,
    sourceId?: number | null,
    paymentStatus?: PaymentStatus,
    paymentReference?: string | null,
    paymentProvider?: OnlineProvider | null,
    settledAmount?: number | null,
  ) {
    if (!sourceType || !sourceId || !paymentStatus) return;

    const data: any = { paymentStatus };
    if (paymentReference !== undefined)
      data.paymentReference = paymentReference;
    if (paymentProvider !== undefined) data.paymentProvider = paymentProvider;
    if (settledAmount !== undefined) data.settledAmount = settledAmount;

    if (sourceType === 'PURCHASE') {
      await tx.purchaseEntry.update({ where: { id: sourceId }, data });
    } else if (sourceType === 'INVOICE') {
      await tx.invoice.update({ where: { id: sourceId }, data });
    }
  }

  private async reopenSourceSettlement(
    tx: any,
    params: {
      sourceType?: string | null;
      sourceId?: number | null;
      amount: number;
      paymentStatus: PaymentStatus;
      paymentReference?: string | null;
      paymentProvider?: OnlineProvider | null;
    },
  ) {
    if (!params.sourceType || !params.sourceId) return;
    if (params.sourceType !== 'PURCHASE' && params.sourceType !== 'INVOICE')
      return;

    if (params.sourceType === 'PURCHASE') {
      const purchase = await tx.purchaseEntry.findUnique({
        where: { id: params.sourceId },
        select: { id: true, purchaseAmount: true, settledAmount: true },
      });
      if (!purchase) return;

      const nextSettled = Math.max(
        toNumber(purchase.settledAmount) - params.amount,
        0,
      );
      await this.updateSourceStatus(
        tx,
        'PURCHASE',
        purchase.id,
        params.paymentStatus,
        params.paymentReference,
        params.paymentProvider,
        nextSettled,
      );
      return;
    }

    const invoice = await tx.invoice.findUnique({
      where: { id: params.sourceId },
      select: { id: true, totalAmount: true, settledAmount: true },
    });
    if (!invoice) return;

    const nextSettled = Math.max(
      toNumber(invoice.settledAmount) - params.amount,
      0,
    );
    await this.updateSourceStatus(
      tx,
      'INVOICE',
      invoice.id,
      params.paymentStatus,
      params.paymentReference,
      params.paymentProvider,
      nextSettled,
    );
  }

  private async applySettlement(
    tx: any,
    params: {
      sourceType?: string | null;
      sourceId?: number | null;
      amount: number;
      date: Date;
      mode: PaymentMode;
      provider?: OnlineProvider | null;
      reference?: string | null;
      narration?: string | null;
      reverse?: boolean;
      incoming?: boolean;
    },
  ) {
    if (!params.sourceType || !params.sourceId) return;

    const incoming = params.incoming ?? this.isIncomingSource(params.sourceType);
    const reverse = params.reverse ?? false;
    const ledgerType = incoming
      ? reverse
        ? LedgerEntryType.DEBIT
        : LedgerEntryType.CREDIT
      : reverse
        ? LedgerEntryType.CREDIT
        : LedgerEntryType.DEBIT;
    const cashKind = incoming
      ? reverse
        ? CashBookType.PAYMENT
        : CashBookType.RECEIPT
      : reverse
        ? CashBookType.RECEIPT
        : CashBookType.PAYMENT;

    if (params.mode === PaymentMode.CASH) {
      await postCashBook(tx, {
        date: params.date,
        kind: cashKind,
        amount: params.amount,
        narration: params.narration ?? 'Cash settlement',
        voucherRef: params.reference ?? undefined,
        referenceId: params.sourceId,
        referenceType: params.sourceType,
      });
      return;
    }

    if (params.mode === PaymentMode.CHEQUE) {
      await postBankLedger(tx, {
        bankName: 'Main Bank',
        date: params.date,
        type: ledgerType,
        amount: params.amount,
        narration: params.narration ?? 'Cheque settlement',
        refNo: params.reference ?? undefined,
      });
      return;
    }

    if (params.mode === PaymentMode.ONLINE) {
      if (
        params.provider === OnlineProvider.BANK_TRANSFER ||
        params.provider === OnlineProvider.JAZZCASH ||
        String(params.provider) === 'NAYAPAY'
      ) {
        await postBankLedger(tx, {
          bankName:
            String(params.provider) === 'NAYAPAY'
              ? 'NayaPay'
              : params.provider === OnlineProvider.JAZZCASH
                ? 'JazzCash'
                : 'Main Bank',
          date: params.date,
          type: ledgerType,
          amount: params.amount,
          narration: params.narration ?? 'Online settlement',
          refNo: params.reference ?? undefined,
        });
      } else if (params.provider === OnlineProvider.EASYPAISA) {
        await postEasypaisaLedger(tx, {
          date: params.date,
          type: ledgerType,
          amount: params.amount,
          narration: params.narration ?? 'Online settlement',
          mobileNo: params.reference ?? 'EASYPAISA-ACCOUNT',
        });
      }
    }
  }

  // ─────────────────── Cash Book ───────────────────
  async getCashBook(startDate?: string, endDate?: string) {
    const where: any = {};
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }
    return this.prisma.cashBook.findMany({
      where,
      orderBy: { date: 'asc' },
    });
  }

  async getTransactions(startDate?: string, endDate?: string, type?: string) {
    const rangeFilter = (field: string) => {
      const where: any = {};
      if (startDate || endDate) {
        where[field] = {};
        if (startDate) where[field].gte = new Date(startDate);
        if (endDate) where[field].lte = new Date(endDate);
      }
      return where;
    };

    const [
      purchases,
      invoices,
      expenses,
      vouchers,
      transportAdvances,
      drivers,
      driverLedgers,
      cashBook,
      bankLedger,
      easypaisaLedger,
      cheques,
      onlinePayments,
    ] = await Promise.all([
      this.prisma.purchaseEntry.findMany({
        where: { ...rangeFilter('date'), isVoided: false },
        include: {
          vendor: { select: { id: true, name: true } },
          driver: { select: { id: true, name: true } },
          chequeLog: true,
          onlinePaymentLog: true,
        },
        orderBy: { date: 'desc' },
      }),
      this.prisma.invoice.findMany({
        where: { ...rangeFilter('date'), isVoided: false },
        include: {
          customer: { select: { id: true, shopName: true } },
          driver: { select: { id: true, name: true } },
          chequeLog: true,
          onlinePaymentLog: true,
        },
        orderBy: { date: 'desc' },
      }),
      this.prisma.expenseEntry.findMany({
        where: rangeFilter('date'),
        include: { expenseAccount: true },
        orderBy: { date: 'desc' },
      }),
      this.prisma.voucher.findMany({
        where: rangeFilter('date'),
        include: {
          customer: { select: { id: true, shopName: true } },
          vendor: { select: { id: true, name: true } },
        },
        orderBy: { date: 'desc' },
      }),
      this.prisma.transportAdvance.findMany({
        where: rangeFilter('date'),
        include: { driver: { select: { id: true, name: true } } },
        orderBy: { date: 'desc' },
      }),
      this.prisma.driver.findMany({
        select: { id: true, advanceBalance: true },
      }),
      this.prisma.driverLedger.findMany({
        where: rangeFilter('date'),
        include: { driver: { select: { id: true, name: true } } },
        orderBy: { date: 'desc' },
      }),
      this.prisma.cashBook.findMany({
        where: rangeFilter('date'),
        orderBy: { date: 'desc' },
      }),
      this.prisma.bankLedger.findMany({
        where: rangeFilter('date'),
        orderBy: { date: 'desc' },
      }),
      this.prisma.easypaisaLedger.findMany({
        where: rangeFilter('date'),
        orderBy: { date: 'desc' },
      }),
      this.prisma.chequeLog.findMany({
        where: type === 'CHEQUE_LOG' ? undefined : rangeFilter('createdAt'),
        include: {
          purchase: {
            include: { vendor: { select: { id: true, name: true } } },
          },
          invoice: {
            include: { customer: { select: { id: true, shopName: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.onlinePaymentLog.findMany({
        where:
          type === 'ONLINE_PAYMENT_LOG' ? undefined : rangeFilter('createdAt'),
        include: {
          purchase: {
            include: { vendor: { select: { id: true, name: true } } },
          },
          invoice: {
            include: { customer: { select: { id: true, shopName: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const rows = [
      ...purchases.map((row) => ({
        id: `purchase-${row.id}`,
        sourceType: 'PURCHASE',
        sourceId: row.id,
        date: row.date,
        createdAt: row.createdAt,
        totalAmount: row.purchaseAmount,
        settledAmount: row.settledAmount,
        partyName: row.vendor?.name ?? 'Unknown vendor',
        driverName: row.driver?.name ?? null,
        amount: row.purchaseAmount,
        paymentMode: row.paymentMode,
        paymentStatus: row.paymentStatus,
        reference: row.paymentReference ?? formatDocumentNo('PUR', row.id),
        narration: row.notes ?? `Purchase ${row.weightKg} kg`,
        generated: false,
        readOnly: true,
      })),
      ...invoices.map((row) => ({
        id: `invoice-${row.id}`,
        sourceType: 'INVOICE',
        sourceId: row.id,
        date: row.date,
        createdAt: row.createdAt,
        totalAmount: row.totalAmount,
        settledAmount: row.settledAmount,
        partyName: row.customer?.shopName ?? 'Unknown customer',
        driverName: row.driver?.name ?? null,
        amount: row.totalAmount,
        paymentMode: row.paymentMode,
        paymentStatus: row.paymentStatus,
        reference: row.paymentReference ?? row.invoiceNo,
        narration: row.notes ?? `Invoice ${row.invoiceNo}`,
        generated: false,
        readOnly: true,
      })),
      ...expenses.map((row) => ({
        id: `expense-${row.id}`,
        sourceType: 'EXPENSE',
        sourceId: row.id,
        date: row.date,
        createdAt: row.createdAt,
        partyName: row.expenseAccount?.name ?? 'Expense',
        amount: row.amount,
        paymentMode: row.paymentMode,
        paymentStatus: 'COMPLETED',
        reference: row.voucherRef ?? null,
        narration: row.narration ?? `Expense ${row.expenseAccount?.name ?? ''}`,
        generated: false,
        readOnly: true,
      })),
      ...vouchers
        .filter((row) => !(row.narration ?? '').startsWith('Credit settlement'))
        .map((row) => ({
          id: `voucher-${row.id}`,
          sourceType: 'VOUCHER',
          sourceId: row.id,
          date: row.date,
          createdAt: row.createdAt,
          partyName: row.customer?.shopName ?? row.vendor?.name ?? 'Voucher',
          amount: row.amount,
          paymentMode: row.paymentMode,
          reference: row.reference ?? row.voucherNo,
          narration: row.narration ?? `Voucher ${row.voucherNo}`,
          generated: false,
          readOnly: true,
        })),
      ...transportAdvances.map((row) => ({
        id: `transport-${row.id}`,
        sourceType: 'TRANSPORT_ADVANCE',
        sourceId: row.id,
        date: row.date,
        createdAt: row.createdAt,
        partyName: row.driver?.name ?? 'Driver',
        amount: row.amount,
        paymentMode: row.paymentMode,
        paymentStatus: 'COMPLETED',
        reference: row.voucherRef ?? formatDocumentNo('TA', row.id),
        narration: row.purpose ?? 'Transport Advance',
        generated: false,
        readOnly: true,
      })),
      ...driverLedgers
        .filter((row) => (row.referenceType ?? '') !== 'TRANSPORT_ADVANCE')
        .map((row) => {
          const refType = row.referenceType ?? '';
          const isSettlement = refType.startsWith('DRIVER_SETTLEMENT');
          const settlementMode = isSettlement
            ? refType.replace('DRIVER_SETTLEMENT_', '')
            : '';
          const sourceType = isSettlement
            ? 'DRIVER_SETTLEMENT'
            : 'DRIVER_CHARGE';
          const currentDriverBalance = toNumber(
            drivers.find((driver) => driver.id === row.driverId)
              ?.advanceBalance ?? 0,
          );
          const isSettledCharge = !isSettlement && currentDriverBalance <= 0;
          const referenceLabel =
            refType === 'PURCHASE_DRIVER_CHARGE'
              ? 'Purchase transport cost'
              : refType === 'INVOICE_DRIVER_CHARGE'
                ? 'Invoice transport cost'
                : isSettlement
                  ? 'Driver balance settlement'
                  : refType || 'Driver ledger';
          return {
            id: `driver-ledger-${row.id}`,
            sourceType,
            sourceId: row.id,
            date: row.date,
            createdAt: row.createdAt,
            partyName: row.driver?.name ?? 'Driver',
            driverName: row.driver?.name ?? null,
            amount: row.amount,
            paymentMode: isSettlement ? settlementMode || 'CASH' : 'TRANSPORT',
            paymentStatus: isSettlement
              ? 'COMPLETED'
              : isSettledCharge
                ? 'COMPLETED'
                : 'OUTSTANDING',
            reference: referenceLabel,
            narration:
              row.narration ??
              (isSettlement ? 'Driver balance settlement' : 'Driver charge'),
            generated: true,
            readOnly: true,
          };
        }),
      ...cashBook
        .filter(
          (row) =>
            ![
              'PURCHASE',
              'INVOICE',
              'VOUCHER',
              'EXPENSE',
              'TRANSPORT_ADVANCE',
              'DRIVER_SETTLEMENT',
            ].includes(row.referenceType ?? ''),
        )
        .map((row) => ({
          id: `cash-${row.id}`,
          sourceType: 'CASH_BOOK',
          sourceId: row.id,
          date: row.date,
          createdAt: row.createdAt,
          partyName: row.referenceType ?? 'Cash Book',
          amount: row.amount,
          paymentMode: 'CASH',
          reference: row.voucherRef ?? null,
          narration: row.narration ?? row.referenceType ?? 'Cash movement',
          generated: true,
          readOnly: true,
        })),
      ...bankLedger
        .filter(
          (row) =>
            !(row.narration ?? '').startsWith('Voucher ') &&
            !(row.narration ?? '').startsWith('Driver balance settlement') &&
            !(row.narration ?? '').startsWith('Credit settlement'),
        )
        .map((row) => ({
          id: `bank-${row.id}`,
          sourceType: 'BANK_LEDGER',
          sourceId: row.id,
          date: row.date,
          createdAt: row.createdAt,
          partyName: row.bankName,
          amount: row.amount,
          paymentMode: 'ONLINE',
          reference: row.refNo ?? null,
          narration: row.narration ?? 'Bank movement',
          generated: true,
          readOnly: true,
        })),
      ...easypaisaLedger
        .filter(
          (row) =>
            !(row.narration ?? '').startsWith('Voucher ') &&
            !(row.narration ?? '').startsWith('Driver balance settlement') &&
            !(row.narration ?? '').startsWith('Credit settlement'),
        )
        .map((row) => ({
          id: `easypaisa-${row.id}`,
          sourceType: 'EASYPAISA_LEDGER',
          sourceId: row.id,
          date: row.date,
          createdAt: row.createdAt,
          partyName: row.mobileNo ?? 'Easypaisa',
          amount: row.amount,
          paymentMode: 'ONLINE',
          reference: null,
          narration: row.narration ?? 'Easypaisa movement',
          generated: true,
          readOnly: true,
        })),
      ...cheques.map((row) => ({
        id: `cheque-${row.id}`,
        sourceType: 'CHEQUE_LOG',
        sourceId: row.id,
        date: row.createdAt,
        createdAt: row.createdAt,
        partyName:
          row.receivedFrom ??
          row.purchase?.vendor?.name ??
          row.invoice?.customer?.shopName ??
          'Cheque',
        amount: row.amount,
        paymentMode: 'CHEQUE',
        paymentStatus: row.status,
        reference: row.chequeNo,
        narration: row.notes ?? `Cheque ${row.chequeNo}`,
        generated: true,
        readOnly: true,
      })),
      ...onlinePayments.map((row) => ({
        id: `online-${row.id}`,
        sourceType: 'ONLINE_PAYMENT_LOG',
        sourceId: row.id,
        date: row.createdAt,
        createdAt: row.createdAt,
        partyName:
          row.receivedFrom ??
          row.purchase?.vendor?.name ??
          row.invoice?.customer?.shopName ??
          'Online',
        amount: row.amount,
        paymentMode: 'ONLINE',
        paymentStatus: row.status,
        reference: row.referenceNo,
        narration: row.notes ?? `Online ${row.provider}`,
        generated: true,
        readOnly: true,
      })),
    ];

    const filtered = type
      ? rows.filter((row) => row.sourceType === type)
      : rows;
    return filtered.sort(
      (a, b) =>
        new Date((b as any).createdAt ?? b.date).getTime() -
        new Date((a as any).createdAt ?? a.date).getTime(),
    );
  }

  // ─────────────────── Bank Ledger ───────────────────
  async addBankEntry(dto: CreateBankLedgerDto) {
    return postBankLedger(this.prisma, {
      bankName: dto.bankName,
      date: normalizeDate(dto.date),
      type: dto.type,
      refNo: dto.refNo,
      amount: Number(dto.amount),
      narration: dto.narration,
    });
  }

  async getBankLedger(bankName?: string, startDate?: string, endDate?: string) {
    const where: any = {};
    if (bankName) where.bankName = bankName;
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }
    return this.prisma.bankLedger.findMany({ where, orderBy: { date: 'asc' } });
  }

  // ─────────────────── Easypaisa Ledger ───────────────────
  async addEasypaisaEntry(dto: CreateEasypaisaLedgerDto) {
    return postEasypaisaLedger(this.prisma, {
      date: normalizeDate(dto.date),
      type: dto.type,
      amount: Number(dto.amount),
      narration: dto.narration,
      mobileNo: dto.mobileNo,
    });
  }

  async getEasypaisaLedger(startDate?: string, endDate?: string) {
    const where: any = {};
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }
    return this.prisma.easypaisaLedger.findMany({
      where,
      orderBy: { date: 'asc' },
    });
  }

  // ─────────────────── Cheques ───────────────────
  async createCheque(dto: CreateChequeLogDto) {
    return this.prisma.chequeLog.create({
      data: {
        chequeNo: dto.chequeNo,
        bankName: dto.bankName,
        chequeDate: new Date(dto.chequeDate),
        amount: Number(dto.amount),
        receivedFrom: dto.receivedFrom,
        status: dto.status,
        notes: dto.notes,
        sourceType: dto.sourceType,
        sourceId: dto.sourceId,
        paymentMode: PaymentMode.CHEQUE,
      },
    });
  }

  async getCheques(
    status?: string,
    sourceType?: string,
    startDate?: string,
    endDate?: string,
  ) {
    const where: any = {
      ...(status ? { status: status as any } : {}),
      ...(sourceType
        ? { sourceType: sourceType === 'MANUAL' ? null : sourceType }
        : {}),
    };
    if (startDate || endDate) {
      where.chequeDate = {};
      if (startDate) where.chequeDate.gte = new Date(startDate);
      if (endDate) where.chequeDate.lte = new Date(endDate);
    }
    return this.prisma.chequeLog.findMany({
      where,
      include: {
        purchase: { include: { vendor: { select: { id: true, name: true } } } },
        invoice: {
          include: { customer: { select: { id: true, shopName: true } } },
        },
      },
      orderBy: { chequeDate: 'desc' },
    });
  }

  async updateChequeStatus(id: number, dto: UpdateChequeStatusDto) {
    const cheque = await this.prisma.chequeLog.findUnique({
      where: { id },
      include: {
        purchase: true,
        invoice: true,
      },
    });
    if (!cheque) throw new NotFoundException(`Cheque #${id} not found`);

    const sourceType =
      cheque.sourceType ??
      (cheque.purchase ? 'PURCHASE' : cheque.invoice ? 'INVOICE' : null);
    const sourceId =
      cheque.sourceId ?? cheque.purchase?.id ?? cheque.invoice?.id ?? null;
    const previousStatus = cheque.status;
    const nextStatus = dto.status;
    const amount = Number(cheque.amount ?? 0);
    const date = new Date();
    const purchaseVendorId = cheque.purchase?.vendorId ?? null;
    const invoiceCustomerId = cheque.invoice?.customerId ?? null;

    if (
      previousStatus !== nextStatus &&
      previousStatus !== ChequeStatus.PENDING
    ) {
      throw new BadRequestException(
        'Only pending cheques can change status. Cleared and bounced cheques are final.',
      );
    }

    if (previousStatus === nextStatus) {
      return cheque;
    }

    return this.prisma.$transaction(async (tx) => {
      if (nextStatus === ChequeStatus.CLEARED) {
        const voucher =
          sourceType === 'VOUCHER'
            ? await this.getVoucherContext(tx, sourceId)
            : null;
        const purchaseSource =
          cheque.purchase ??
          (sourceType === 'PURCHASE' && sourceId
            ? await tx.purchaseEntry.findUnique({
                where: { id: sourceId },
                select: { id: true, purchaseAmount: true, settledAmount: true },
              })
            : null);
        const invoiceSource =
          cheque.invoice ??
          (sourceType === 'INVOICE' && sourceId
            ? await tx.invoice.findUnique({
                where: { id: sourceId },
                select: { id: true, totalAmount: true, settledAmount: true },
              })
            : null);

        await this.applySettlement(tx, {
          sourceType,
          sourceId,
          amount,
          date,
          mode: PaymentMode.CHEQUE,
          reference: cheque.chequeNo,
          narration: `Cheque cleared - ${cheque.chequeNo}`,
          incoming: voucher
            ? voucher.type === VoucherType.RECOVERY ||
              voucher.type === VoucherType.CREDIT
            : undefined,
        });
        if (purchaseSource) {
          const purchaseAmount = Number(purchaseSource.purchaseAmount ?? 0);
          const purchaseSettled =
            Number(purchaseSource.settledAmount ?? 0) + amount;
          const purchaseFinalSettled = Math.min(
            purchaseAmount,
            purchaseSettled,
          );
          const purchaseBalanceDelta = purchaseAmount - purchaseFinalSettled;
          await this.updateSourceStatus(
            tx,
            'PURCHASE',
            purchaseSource.id,
            purchaseBalanceDelta > 0
              ? PaymentStatus.OUTSTANDING
              : PaymentStatus.COMPLETED,
            cheque.chequeNo,
            null,
            purchaseFinalSettled,
          );
        } else if (sourceType === 'PURCHASE') {
          await this.updateSourceStatus(
            tx,
            'PURCHASE',
            sourceId,
            PaymentStatus.COMPLETED,
            cheque.chequeNo,
            null,
            amount,
          );
        }

        if (invoiceSource && !purchaseSource) {
          const invoiceAmount = Number(invoiceSource.totalAmount ?? 0);
          const invoiceSettled =
            Number(invoiceSource.settledAmount ?? 0) + amount;
          const invoiceFinalSettled = Math.min(invoiceAmount, invoiceSettled);
          const invoiceBalanceDelta = invoiceAmount - invoiceFinalSettled;
          await this.updateSourceStatus(
            tx,
            'INVOICE',
            invoiceSource.id,
            invoiceBalanceDelta > 0
              ? PaymentStatus.OUTSTANDING
              : PaymentStatus.COMPLETED,
            cheque.chequeNo,
            null,
            invoiceFinalSettled,
          );
        } else if (invoiceSource) {
          const invoiceAmount = Number(invoiceSource.totalAmount ?? 0);
          const invoiceFinalSettled = Math.min(
            invoiceAmount,
            Number(invoiceSource.settledAmount ?? 0) + amount,
          );
          await this.updateSourceStatus(
            tx,
            'INVOICE',
            invoiceSource.id,
            invoiceAmount - invoiceFinalSettled > 0
              ? PaymentStatus.OUTSTANDING
              : PaymentStatus.COMPLETED,
            cheque.chequeNo,
            null,
            invoiceFinalSettled,
          );
        } else if (sourceType === 'INVOICE') {
          await this.updateSourceStatus(
            tx,
            'INVOICE',
            sourceId,
            PaymentStatus.COMPLETED,
            cheque.chequeNo,
            null,
            amount,
          );
        }

        if (voucher) {
          await this.finalizeVoucherSettlement(tx, voucher.voucherNo);
        }
      } else if (nextStatus === ChequeStatus.BOUNCED) {
        if (sourceType === 'VOUCHER') {
          await this.postOutstandingAdjustment(tx, {
            sourceType,
            sourceId,
            amount,
            date,
          });
        } else if (cheque.purchase) {
          await this.postOutstandingAdjustment(tx, {
            sourceType: 'PURCHASE',
            sourceId: cheque.purchase.id,
            amount,
            date,
            purchaseVendorId,
          });
          await this.reopenSourceSettlement(tx, {
            sourceType: 'PURCHASE',
            sourceId: cheque.purchase.id,
            amount,
            paymentStatus: ChequeStatus.BOUNCED,
            paymentReference: cheque.chequeNo,
          });
        } else if (sourceType === 'PURCHASE') {
          await this.postOutstandingAdjustment(tx, {
            sourceType: 'PURCHASE',
            sourceId,
            amount,
            date,
            purchaseVendorId,
          });
          await this.reopenSourceSettlement(tx, {
            sourceType: 'PURCHASE',
            sourceId,
            amount,
            paymentStatus: ChequeStatus.BOUNCED,
            paymentReference: cheque.chequeNo,
          });
        }

        if (cheque.invoice) {
          await this.postOutstandingAdjustment(tx, {
            sourceType: 'INVOICE',
            sourceId: cheque.invoice.id,
            amount,
            date,
            invoiceCustomerId,
          });
          await this.reopenSourceSettlement(tx, {
            sourceType: 'INVOICE',
            sourceId: cheque.invoice.id,
            amount,
            paymentStatus: ChequeStatus.BOUNCED,
            paymentReference: cheque.chequeNo,
          });
        } else if (sourceType === 'INVOICE') {
          await this.postOutstandingAdjustment(tx, {
            sourceType: 'INVOICE',
            sourceId,
            amount,
            date,
            invoiceCustomerId,
          });
          await this.reopenSourceSettlement(tx, {
            sourceType: 'INVOICE',
            sourceId,
            amount,
            paymentStatus: ChequeStatus.BOUNCED,
            paymentReference: cheque.chequeNo,
          });
        }
      } else {
        throw new BadRequestException(
          `Unsupported cheque status: ${nextStatus}`,
        );
      }

      return tx.chequeLog.update({
        where: { id },
        data: { status: nextStatus },
      });
    });
  }

  // ─────────────────── Online ───────────────────
  async createOnlinePayment(dto: CreateOnlinePaymentLogDto) {
    return this.prisma.onlinePaymentLog.create({
      data: {
        provider: dto.provider,
        referenceNo: dto.referenceNo,
        amount: Number(dto.amount),
        status: dto.status ?? PaymentStatus.PENDING,
        receivedFrom: dto.receivedFrom,
        sourceType: dto.sourceType,
        sourceId: dto.sourceId,
        notes: dto.notes,
      },
    });
  }

  async getOnlinePayments(
    provider?: string,
    status?: string,
    sourceType?: string,
    startDate?: string,
    endDate?: string,
  ) {
    const where: any = {};
    if (provider) where.provider = provider as OnlineProvider;
    if (status) where.status = status as PaymentStatus;
    if (sourceType)
      where.sourceType = sourceType === 'MANUAL' ? null : sourceType;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    return this.prisma.onlinePaymentLog.findMany({
      where,
      include: {
        purchase: { include: { vendor: { select: { id: true, name: true } } } },
        invoice: {
          include: { customer: { select: { id: true, shopName: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateOnlineStatus(id: number, dto: UpdateOnlinePaymentStatusDto) {
    const online = await this.prisma.onlinePaymentLog.findUnique({
      where: { id },
      include: {
        purchase: true,
        invoice: true,
      },
    });
    if (!online) throw new NotFoundException(`Online payment #${id} not found`);

    const sourceType =
      online.sourceType ??
      (online.purchase ? 'PURCHASE' : online.invoice ? 'INVOICE' : null);
    const sourceId =
      online.sourceId ?? online.purchase?.id ?? online.invoice?.id ?? null;
    const previousStatus = online.status;
    const nextStatus = dto.status;
    const amount = Number(online.amount ?? 0);
    const date = new Date();
    const provider = online.provider;

    if (
      previousStatus !== nextStatus &&
      previousStatus !== PaymentStatus.PENDING
    ) {
      throw new BadRequestException(
        'Only pending online payments can change status. Final online states are locked.',
      );
    }

    if (previousStatus === nextStatus) {
      return online;
    }

    const allowedFinalStatuses = new Set<PaymentStatus>([
      PaymentStatus.COMPLETED,
      PaymentStatus.FAILED,
    ]);

    if (!allowedFinalStatuses.has(nextStatus)) {
      throw new BadRequestException(`Unsupported online status: ${nextStatus}`);
    }

    return this.prisma.$transaction(async (tx) => {
      if (nextStatus === PaymentStatus.COMPLETED) {
        const voucher =
          sourceType === 'VOUCHER'
            ? await this.getVoucherContext(tx, sourceId)
            : null;
        const purchaseSource =
          online.purchase ??
          (sourceType === 'PURCHASE' && sourceId
            ? await tx.purchaseEntry.findUnique({
                where: { id: sourceId },
                select: { id: true, purchaseAmount: true, settledAmount: true },
              })
            : null);
        const invoiceSource =
          online.invoice ??
          (sourceType === 'INVOICE' && sourceId
            ? await tx.invoice.findUnique({
                where: { id: sourceId },
                select: { id: true, totalAmount: true, settledAmount: true },
              })
            : null);

        const sourceTotal =
          purchaseSource?.purchaseAmount ??
          invoiceSource?.totalAmount ??
          amount;
        const sourceSettled =
          Number(
            purchaseSource?.settledAmount ?? invoiceSource?.settledAmount ?? 0,
          ) + amount;
        const sourceFinalSettled = Math.min(Number(sourceTotal), sourceSettled);
        const sourceBalanceDelta = Number(sourceTotal) - sourceFinalSettled;
        await this.applySettlement(tx, {
          sourceType,
          sourceId,
          amount,
          date,
          mode: PaymentMode.ONLINE,
          provider,
          reference: online.referenceNo,
          narration: `Online payment completed - ${provider}`,
          incoming: voucher
            ? voucher.type === VoucherType.RECOVERY ||
              voucher.type === VoucherType.CREDIT
            : undefined,
        });
        await this.updateSourceStatus(
          tx,
          sourceType,
          sourceId,
          sourceBalanceDelta > 0
            ? PaymentStatus.OUTSTANDING
            : PaymentStatus.COMPLETED,
          online.referenceNo,
          provider,
          sourceFinalSettled,
        );
        if (voucher) {
          await this.finalizeVoucherSettlement(tx, voucher.voucherNo);
        }
      } else if (nextStatus === PaymentStatus.FAILED) {
        await this.postOutstandingAdjustment(tx, {
          sourceType,
          sourceId,
          amount,
          date,
          purchaseVendorId: online.purchase?.vendorId ?? null,
          invoiceCustomerId: online.invoice?.customerId ?? null,
        });
        if (online.purchase) {
          await this.reopenSourceSettlement(tx, {
            sourceType: 'PURCHASE',
            sourceId: online.purchase.id,
            amount,
            paymentStatus: PaymentStatus.OUTSTANDING,
            paymentReference: online.referenceNo,
            paymentProvider: provider,
          });
        } else if (sourceType === 'PURCHASE') {
          await this.reopenSourceSettlement(tx, {
            sourceType: 'PURCHASE',
            sourceId,
            amount,
            paymentStatus: PaymentStatus.OUTSTANDING,
            paymentReference: online.referenceNo,
            paymentProvider: provider,
          });
        }

        if (online.invoice) {
          await this.reopenSourceSettlement(tx, {
            sourceType: 'INVOICE',
            sourceId: online.invoice.id,
            amount,
            paymentStatus: PaymentStatus.OUTSTANDING,
            paymentReference: online.referenceNo,
            paymentProvider: provider,
          });
        } else if (sourceType === 'INVOICE') {
          await this.reopenSourceSettlement(tx, {
            sourceType: 'INVOICE',
            sourceId,
            amount,
            paymentStatus: PaymentStatus.OUTSTANDING,
            paymentReference: online.referenceNo,
            paymentProvider: provider,
          });
        }
      } else {
        await this.updateSourceStatus(
          tx,
          sourceType,
          sourceId,
          nextStatus,
          online.referenceNo,
          provider,
        );
      }

      return tx.onlinePaymentLog.update({
        where: { id },
        data: { status: nextStatus },
      });
    });
  }
}
