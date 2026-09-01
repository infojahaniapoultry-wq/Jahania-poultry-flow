import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { LedgerEntryType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVendorDto, UpdateVendorDto } from './vendors.dto';
import { toNumber } from '../shared/ledger-posting';
import { ReportsService } from '../reports/reports.service';
import {
  detailsForLedgerRow,
  loadLedgerDetails,
} from '../shared/ledger-details';

@Injectable()
export class VendorsService {
  constructor(
    private prisma: PrismaService,
    @Optional() private readonly reportsService?: ReportsService,
  ) {}

  async create(dto: CreateVendorDto) {
    const opening = dto.openingBalance ?? 0;
    return this.prisma.vendor.create({
      data: {
        ...dto,
        openingBalance: opening,
        currentBalance: opening,
      },
    });
  }

  async findAll() {
    const vendors = await this.prisma.vendor.findMany({
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    });
    return vendors.map((vendor) => ({
      ...vendor,
      currentBalance: toNumber(vendor.currentBalance),
    }));
  }

  async findOne(id: number) {
    const vendor = await this.prisma.vendor.findUnique({ where: { id } });
    if (!vendor) throw new NotFoundException(`Vendor #${id} not found`);
    return vendor;
  }

  async update(id: number, dto: UpdateVendorDto) {
    const vendor = await this.findOne(id);
    const data = {
      ...dto,
      ...(dto.openingBalance === undefined
        ? {}
        : {
            // Keep the vendor's live balance in sync with a corrected opening
            // balance, without changing the historical transaction ledger.
            currentBalance:
              toNumber(vendor.currentBalance) +
              (dto.openingBalance - toNumber(vendor.openingBalance)),
          }),
    };

    return this.prisma.vendor.update({ where: { id }, data });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.vendor.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async getLedger(id: number, startDate?: string, endDate?: string) {
    if (this.reportsService) {
      const statement = await this.reportsService.getVendorStatement(
        id,
        startDate,
        endDate,
      );
      return {
        ...statement,
        entries: statement.ledger,
      };
    }

    const vendor = await this.findOne(id);
    const where: any = { vendorId: id };
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }
    const ledgerRows = await this.prisma.vendorLedger.findMany({
      where,
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });
    const ledgerDetails = await loadLedgerDetails(this.prisma, ledgerRows);

    const openingBalance = toNumber(vendor.openingBalance);
    let runningBalance = openingBalance;
    const entries = ledgerRows.map((row) => {
      const amount = toNumber(row.amount);
      runningBalance =
        row.type === LedgerEntryType.CREDIT
          ? runningBalance + amount
          : runningBalance - amount;

      return {
        id: row.id,
        date: row.date,
        type: row.type,
        amount: row.amount,
        runningBalance,
        narration: row.narration,
        referenceType: row.referenceType,
        referenceId: row.referenceId,
        ...detailsForLedgerRow(ledgerDetails, row),
      };
    });

    return {
      vendor,
      openingBalance,
      closingBalance: entries.at(-1)?.runningBalance ?? openingBalance,
      entries,
    };
  }
}
