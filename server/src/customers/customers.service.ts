import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto, UpdateCustomerDto } from './customers.dto';
import { toNumber } from '../shared/ledger-posting';
import {
  detailsForLedgerRow,
  loadLedgerDetails,
} from '../shared/ledger-details';

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  private validatePricingRule(
    values: {
      pricingBaseRateType?: string | null;
      pricingOffsetDirection?: string | null;
      pricingOffsetValue?: unknown;
    },
  ) {
    const configured = [
      values.pricingBaseRateType,
      values.pricingOffsetDirection,
      values.pricingOffsetValue,
    ].every((value) => value !== undefined && value !== null && value !== '');
    const partiallyConfigured = [
      values.pricingBaseRateType,
      values.pricingOffsetDirection,
      values.pricingOffsetValue,
    ].some((value) => value !== undefined && value !== null && value !== '');

    if (!configured && partiallyConfigured) {
      throw new BadRequestException('Base rate type, offset direction, and offset value are required together');
    }
    if (configured && Number(values.pricingOffsetValue) < 0) {
      throw new BadRequestException('Pricing offset value cannot be negative');
    }
  }

  async create(dto: CreateCustomerDto) {
    this.validatePricingRule(dto);
    const opening = dto.openingBalance ?? 0;
    return this.prisma.customer.create({
      data: {
        ...dto,
        openingBalance: opening,
        currentBalance: opening,
      },
    });
  }

  async findAll() {
    const customers = await this.prisma.customer.findMany({
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    });
    return customers.map((customer) => ({
      ...customer,
      currentBalance: toNumber(customer.currentBalance),
    }));
  }

  async findOne(id: number) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException(`Customer #${id} not found`);
    return customer;
  }

  async update(id: number, dto: UpdateCustomerDto) {
    const existing = await this.findOne(id);
    this.validatePricingRule({
      pricingBaseRateType: dto.pricingBaseRateType ?? existing.pricingBaseRateType,
      pricingOffsetDirection: dto.pricingOffsetDirection ?? existing.pricingOffsetDirection,
      pricingOffsetValue: dto.pricingOffsetValue ?? existing.pricingOffsetValue,
    });
    return this.prisma.customer.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.openingBalance === undefined
          ? {}
          : {
              // Correcting an opening balance must also correct the live
              // amount receivable, without rewriting historical ledger rows.
              currentBalance:
                toNumber(existing.currentBalance) +
                (dto.openingBalance - toNumber(existing.openingBalance)),
            }),
      },
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.customer.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async getLedger(id: number, startDate?: string, endDate?: string) {
    const customer = await this.findOne(id);
    const where: any = { customerId: id };
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }

    const ledgerRows = await this.prisma.customerLedger.findMany({
      where,
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });
    const ledgerDetails = await loadLedgerDetails(this.prisma, ledgerRows);

    const openingBalance = toNumber(customer.openingBalance);
    let runningBalance = openingBalance;
    const entries = ledgerRows.map((row) => {
      const amount = toNumber(row.amount);
      runningBalance =
        row.type === 'DEBIT'
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
      customer,
      openingBalance,
      closingBalance: entries.at(-1)?.runningBalance ?? openingBalance,
      entries,
    };
  }
}
