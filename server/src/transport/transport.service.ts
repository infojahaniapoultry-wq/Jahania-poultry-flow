import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransportAdvanceDto } from './transport.dto';
import {
  CashBookType,
  LedgerEntryType,
  OnlineProvider,
  PaymentMode,
} from '@prisma/client';
import {
  normalizeDate,
  postBankLedger,
  postCashBook,
  postDriverLedger,
  postEasypaisaLedger,
  toNumber,
} from '../shared/ledger-posting';
import { formatDocumentNo } from '../shared/document-number';

@Injectable()
export class TransportService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateTransportAdvanceDto) {
    const driver = await this.prisma.driver.findUnique({
      where: { id: dto.driverId },
    });
    if (!driver)
      throw new NotFoundException(`Driver #${dto.driverId} not found`);

    const advDate = normalizeDate(dto.date);
    const amount = toNumber(dto.amount);
    const paymentMode = dto.paymentMode ?? PaymentMode.CASH;
    const purpose = dto.purpose ?? 'Transport Advance';
    const paymentProvider = dto.paymentProvider;
    const paymentReference = dto.paymentReference;

    return this.prisma.$transaction(async (tx) => {
      const advance = await tx.transportAdvance.create({
        data: {
          date: advDate,
          driverId: dto.driverId,
          amount,
          paymentMode,
          purpose,
          voucherRef: dto.voucherRef ?? null,
        },
        include: { driver: true },
      });

      const voucherRef =
        advance.voucherRef ?? formatDocumentNo('TA', advance.id);
      if (!advance.voucherRef) {
        await tx.transportAdvance.update({
          where: { id: advance.id },
          data: { voucherRef },
        });
      }

      await postDriverLedger(tx, {
        driverId: dto.driverId,
        date: advDate,
        type: LedgerEntryType.DEBIT,
        amount,
        narration: purpose,
        referenceId: advance.id,
        referenceType: 'TRANSPORT_ADVANCE',
      });

      if (paymentMode === PaymentMode.CASH) {
        await postCashBook(tx, {
          date: advDate,
          kind: CashBookType.PAYMENT,
          amount,
          narration: purpose,
          voucherRef,
          referenceId: advance.id,
          referenceType: 'TRANSPORT_ADVANCE',
        });
      } else if (paymentMode === PaymentMode.CHEQUE) {
        await postBankLedger(tx, {
          bankName: 'Main Bank',
          date: advDate,
          type: LedgerEntryType.DEBIT,
          amount,
          narration: purpose,
          refNo: paymentReference ?? undefined,
        });
      } else if (paymentMode === PaymentMode.ONLINE) {
        if (paymentProvider === OnlineProvider.EASYPAISA) {
          await postEasypaisaLedger(tx, {
            date: advDate,
            type: LedgerEntryType.DEBIT,
            amount,
            narration: purpose,
            mobileNo: paymentReference ?? 'EASYPAISA-ACCOUNT',
          });
        } else {
          await postBankLedger(tx, {
            bankName:
              paymentProvider === OnlineProvider.JAZZCASH
                ? 'JazzCash'
                : String(paymentProvider) === 'NAYAPAY'
                  ? 'NayaPay'
                  : paymentProvider === OnlineProvider.OTHER
                    ? 'Online Wallet'
                    : 'Main Bank',
            date: advDate,
            type: LedgerEntryType.DEBIT,
            amount,
            narration: purpose,
            refNo: paymentReference ?? undefined,
          });
        }
      }

      return {
        ...advance,
        voucherRef,
      };
    });
  }

  async findAll(driverId?: number, startDate?: string, endDate?: string) {
    const where: any = {};
    if (driverId) where.driverId = driverId;
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }
    return this.prisma.transportAdvance.findMany({
      where,
      include: { driver: { select: { id: true, name: true } } },
      orderBy: { date: 'desc' },
    });
  }
}
