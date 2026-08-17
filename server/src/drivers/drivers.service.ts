import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CashBookType,
  LedgerEntryType,
  OnlineProvider,
  PaymentMode,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateDriverDto,
  CreateDriverSettlementDto,
  UpdateDriverDto,
} from './drivers.dto';
import {
  normalizeDate,
  postBankLedger,
  postCashBook,
  postDriverLedger,
  postEasypaisaLedger,
} from '../shared/ledger-posting';
import {
  detailsForLedgerRow,
  loadLedgerDetails,
} from '../shared/ledger-details';

@Injectable()
export class DriversService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateDriverDto) {
    const advance = dto.advanceBalance ?? 0;
    const defaultCharge = dto.defaultCharge ?? 0;
    return this.prisma.driver.create({
      data: {
        name: dto.name,
        contact: dto.contact,
        vehicleType: dto.vehicleType,
        defaultCharge,
        advanceBalance: advance,
      },
    });
  }

  async findAll() {
    return this.prisma.driver.findMany({
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(id: number) {
    const driver = await this.prisma.driver.findUnique({ where: { id } });
    if (!driver) throw new NotFoundException(`Driver #${id} not found`);
    return driver;
  }

  async update(id: number, dto: UpdateDriverDto) {
    await this.findOne(id);
    return this.prisma.driver.update({
      where: { id },
      data: {
        name: dto.name,
        contact: dto.contact,
        vehicleType: dto.vehicleType,
        defaultCharge: dto.defaultCharge,
        isActive: dto.isActive,
      },
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.driver.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async getLedger(id: number, startDate?: string, endDate?: string) {
    await this.findOne(id);
    const where: any = { driverId: id };
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }
    const ledgerRows = await this.prisma.driverLedger.findMany({
      where,
      orderBy: { date: 'asc' },
    });
    const ledgerDetails = await loadLedgerDetails(this.prisma, ledgerRows);
    return ledgerRows.map((row) => ({
      ...row,
      ...detailsForLedgerRow(ledgerDetails, row),
    }));
  }

  async settleBalance(id: number, dto: CreateDriverSettlementDto) {
    const driver = await this.findOne(id);
    const amount = Number(dto.amount ?? driver.advanceBalance ?? 0);
    if (amount <= 0) {
      throw new BadRequestException('Amount must be greater than zero');
    }

    const paymentMode = dto.paymentMode ?? PaymentMode.CASH;
    const date = normalizeDate();
    const narration = dto.narration ?? 'Driver balance settlement';
    const paymentReference = dto.paymentReference?.trim() || undefined;

    return this.prisma.$transaction(async (tx) => {
      const settlement = await postDriverLedger(tx, {
        driverId: id,
        date,
        type: LedgerEntryType.CREDIT,
        amount,
        narration,
        referenceId: id,
        referenceType: `DRIVER_SETTLEMENT_${paymentMode}`,
      });

      if (paymentMode === PaymentMode.CASH) {
        await postCashBook(tx, {
          date,
          kind: CashBookType.PAYMENT,
          amount,
          narration,
          voucherRef: paymentReference,
          referenceId: id,
          referenceType: 'DRIVER_SETTLEMENT',
        });
      } else if (paymentMode === PaymentMode.CHEQUE) {
        await postBankLedger(tx, {
          bankName: 'Main Bank',
          date,
          type: LedgerEntryType.DEBIT,
          amount,
          narration,
          refNo: paymentReference,
        });
      } else if (paymentMode === PaymentMode.ONLINE) {
        if (dto.paymentProvider === OnlineProvider.EASYPAISA) {
          await postEasypaisaLedger(tx, {
            date,
            type: LedgerEntryType.DEBIT,
            amount,
            narration,
            mobileNo: paymentReference ?? 'EASYPAISA-ACCOUNT',
          });
        } else {
          await postBankLedger(tx, {
            bankName:
              dto.paymentProvider === OnlineProvider.JAZZCASH
                ? 'JazzCash'
                : dto.paymentProvider === OnlineProvider.OTHER
                  ? 'Online Wallet'
                  : 'Main Bank',
            date,
            type: LedgerEntryType.DEBIT,
            amount,
            narration,
            refNo: paymentReference,
          });
        }
      }

      return {
        settlement,
        driver: await tx.driver.findUnique({ where: { id } }),
      };
    });
  }
}
