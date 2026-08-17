import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVoucherDto } from './vouchers.dto';
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
  postCashBook,
  postCustomerLedger,
  postVendorLedger,
  toNumber,
} from '../shared/ledger-posting';

@Injectable()
export class VouchersService {
  constructor(private prisma: PrismaService) {}

  private formatVoucherNo(type: VoucherType, id: number): string {
    const prefix = type.slice(0, 3).toUpperCase();
    return `${prefix}-${String(id).padStart(5, '0')}`;
  }

  private async settleLinkedSourceStatuses(
    tx: any,
    params: {
      customerId?: number;
      vendorId?: number;
      amount: number;
      paymentMode: PaymentMode;
      paymentReference?: string;
      paymentProvider?: OnlineProvider;
    },
  ) {
    let remaining = Math.max(0, params.amount);

    const nextPaymentStatus =
      params.paymentMode === PaymentMode.CASH
        ? PaymentStatus.COMPLETED
        : PaymentStatus.PENDING;

    const applyToInvoices = async () => {
      if (!params.customerId || remaining <= 0) return;

      const invoices = await tx.invoice.findMany({
        where: {
          customerId: params.customerId,
          isVoided: false,
        },
        select: {
          id: true,
          totalBalance: true,
          settledAmount: true,
        },
        orderBy: [{ date: 'asc' }, { id: 'asc' }],
      });

      for (const invoice of invoices) {
        const currentSettled = toNumber(invoice.settledAmount);
        const invoiceBalance = Math.max(
          toNumber(invoice.totalBalance) - currentSettled,
          0,
        );
        if (invoiceBalance <= 0) continue;

        const applied = Math.min(invoiceBalance, remaining);
        const nextSettled = currentSettled + applied;
        const nextStatus =
          params.paymentMode === PaymentMode.CASH
            ? nextSettled >= toNumber(invoice.totalBalance)
              ? PaymentStatus.COMPLETED
              : PaymentStatus.OUTSTANDING
            : nextPaymentStatus;
        const paymentData =
          params.paymentMode === PaymentMode.CASH || !params.paymentReference
            ? {}
            : {
                paymentReference: params.paymentReference,
                ...(params.paymentProvider
                  ? { paymentProvider: params.paymentProvider }
                  : {}),
              };

        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            settledAmount: nextSettled,
            paymentStatus: nextStatus,
            ...paymentData,
          },
        });

        remaining -= applied;
        if (remaining <= 0) break;
      }
    };

    const applyToPurchases = async () => {
      if (!params.vendorId || remaining <= 0) return;

      const purchases = await tx.purchaseEntry.findMany({
        where: {
          vendorId: params.vendorId,
          isVoided: false,
        },
        select: {
          id: true,
          purchaseAmount: true,
          settledAmount: true,
        },
        orderBy: [{ date: 'asc' }, { id: 'asc' }],
      });

      for (const purchase of purchases) {
        const currentSettled = toNumber(purchase.settledAmount);
        const purchaseBalance = Math.max(
          toNumber(purchase.purchaseAmount) - currentSettled,
          0,
        );
        if (purchaseBalance <= 0) continue;

        const applied = Math.min(purchaseBalance, remaining);
        const nextSettled = currentSettled + applied;
        const nextStatus =
          params.paymentMode === PaymentMode.CASH
            ? nextSettled >= toNumber(purchase.purchaseAmount)
              ? PaymentStatus.COMPLETED
              : PaymentStatus.OUTSTANDING
            : nextPaymentStatus;
        const paymentData =
          params.paymentMode === PaymentMode.CASH || !params.paymentReference
            ? {}
            : {
                paymentReference: params.paymentReference,
                ...(params.paymentProvider
                  ? { paymentProvider: params.paymentProvider }
                  : {}),
              };

        await tx.purchaseEntry.update({
          where: { id: purchase.id },
          data: {
            settledAmount: nextSettled,
            paymentStatus: nextStatus,
            ...paymentData,
          },
        });

        remaining -= applied;
        if (remaining <= 0) break;
      }
    };

    await applyToInvoices();
    await applyToPurchases();
    return remaining;
  }

  async create(dto: CreateVoucherDto) {
    const voucherDate = normalizeDate(dto.date);
    const amount = toNumber(dto.amount);
    const paymentMode = dto.paymentMode ?? PaymentMode.CASH;
    const paymentProvider = dto.paymentProvider;
    const paymentReference = dto.paymentReference ?? dto.reference;
    const chequeNo = dto.chequeNo ?? dto.reference ?? paymentReference;
    const bankName = dto.bankName?.trim();
    const chequeDate = dto.chequeDate
      ? normalizeDate(dto.chequeDate)
      : voucherDate;
    const isIncoming =
      dto.type === VoucherType.RECOVERY || dto.type === VoucherType.CREDIT;
    const isSettlement = (dto.narration ?? '').startsWith('Credit settlement');

    return this.prisma.$transaction(async (tx) => {
      // Create with a TEMP placeholder — we update with the real ID-based number below.
      const voucher = await tx.voucher.create({
        data: {
          voucherNo: 'TEMP',
          type: dto.type,
          date: voucherDate,
          customerId: dto.customerId,
          vendorId: dto.vendorId,
          amount,
          paymentMode,
          narration: dto.narration,
          reference: dto.reference ?? paymentReference,
        },
      });

      // Generate race-condition-free number using the auto-increment ID
      const voucherNo = this.formatVoucherNo(dto.type, voucher.id);
      await tx.voucher.update({
        where: { id: voucher.id },
        data: { voucherNo },
      });

      let customerName: string | null = null;
      if (dto.customerId) {
        const customer = await tx.customer.findUnique({
          where: { id: dto.customerId },
        });
        if (!customer)
          throw new NotFoundException(`Customer #${dto.customerId} not found`);

        if (isSettlement && amount > toNumber(customer.currentBalance)) {
          throw new BadRequestException(
            'Settlement amount cannot exceed the customer udhar balance',
          );
        }

        customerName = customer.shopName;

        await postCustomerLedger(tx, {
          customerId: dto.customerId,
          date: voucherDate,
          type: isIncoming ? LedgerEntryType.CREDIT : LedgerEntryType.DEBIT,
          amount,
          narration: dto.narration ?? `Voucher ${voucherNo}`,
          referenceId: voucher.id,
          referenceType: 'VOUCHER',
        });
      }

      let vendorName: string | null = null;
      if (dto.vendorId) {
        const vendor = await tx.vendor.findUnique({
          where: { id: dto.vendorId },
        });
        if (!vendor)
          throw new NotFoundException(`Vendor #${dto.vendorId} not found`);

        if (isSettlement && amount > toNumber(vendor.currentBalance)) {
          throw new BadRequestException(
            'Settlement amount cannot exceed the vendor udhar balance',
          );
        }

        vendorName = vendor.name;

        await postVendorLedger(tx, {
          vendorId: dto.vendorId,
          date: voucherDate,
          type: isIncoming ? LedgerEntryType.CREDIT : LedgerEntryType.DEBIT,
          amount,
          narration: dto.narration ?? `Voucher ${voucherNo}`,
          referenceId: voucher.id,
          referenceType: 'VOUCHER',
        });
      }

      if (isSettlement) {
        await this.settleLinkedSourceStatuses(tx, {
          customerId: dto.customerId,
          vendorId: dto.vendorId,
          amount,
          paymentMode,
          paymentReference:
            paymentMode === PaymentMode.CASH ? undefined : voucherNo,
          paymentProvider:
            paymentMode === PaymentMode.ONLINE ? paymentProvider : undefined,
        });
      }

      const voucherNarration = dto.narration ?? `Voucher ${voucherNo}`;
      if (paymentMode === PaymentMode.CASH) {
        await postCashBook(tx, {
          date: voucherDate,
          kind: isIncoming ? CashBookType.RECEIPT : CashBookType.PAYMENT,
          amount,
          narration: voucherNarration,
          voucherRef: voucherNo,
          referenceId: voucher.id,
          referenceType: 'VOUCHER',
        });
      } else if (paymentMode === PaymentMode.CHEQUE) {
        if (!chequeNo || !bankName) {
          throw new BadRequestException(
            'Cheque number and bank name are required for cheque vouchers',
          );
        }
        if (!dto.chequeDate) {
          throw new BadRequestException(
            'Cheque date is required for cheque vouchers',
          );
        }
        await tx.chequeLog.create({
          data: {
            chequeNo,
            bankName,
            chequeDate,
            amount,
            receivedFrom: customerName ?? vendorName,
            sourceType: 'VOUCHER',
            sourceId: voucher.id,
            paymentMode: PaymentMode.CHEQUE,
            status: ChequeStatus.PENDING,
            notes: voucherNarration,
          },
        });
      } else if (paymentMode === PaymentMode.ONLINE) {
        if (!paymentProvider || !paymentReference) {
          throw new BadRequestException(
            'Online provider and payment reference are required for online vouchers',
          );
        }
        await tx.onlinePaymentLog.create({
          data: {
            provider: paymentProvider,
            referenceNo: paymentReference,
            amount,
            status: PaymentStatus.PENDING,
            receivedFrom: customerName ?? vendorName,
            sourceType: 'VOUCHER',
            sourceId: voucher.id,
            notes: voucherNarration,
          },
        });
      }

      return voucher;
    });
  }

  async findAll(type?: VoucherType, startDate?: string, endDate?: string) {
    const where: any = {};
    if (type) where.type = type;
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }
    return this.prisma.voucher.findMany({
      where,
      include: {
        customer: { select: { id: true, shopName: true } },
        vendor: { select: { id: true, name: true } },
      },
      orderBy: { date: 'desc' },
    });
  }

  async findOne(id: number) {
    return this.prisma.voucher.findUnique({
      where: { id },
      include: { customer: true, vendor: true },
    });
  }
}
