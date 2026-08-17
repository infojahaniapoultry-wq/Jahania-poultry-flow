import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertMarketRateDto } from './market-rates.dto';

function normalizeMarketDate(input: string | Date) {
  const datePart = input instanceof Date
    ? input.toISOString().split('T')[0]
    : input.split('T')[0];
  return new Date(`${datePart}T00:00:00.000Z`);
}

function serializeMarketRate(rate: any) {
  return {
    id: rate.id,
    effectiveDate: rate.effectiveDate,
    farmRate: Number(rate.farmRate),
    finalRate: Number(rate.finalRate),
    createdAt: rate.createdAt,
    updatedAt: rate.updatedAt,
  };
}

@Injectable()
export class MarketRatesService {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(dto: UpsertMarketRateDto) {
    const effectiveDate = normalizeMarketDate(dto.effectiveDate);
    const rate = await this.prisma.marketRate.upsert({
      where: { effectiveDate },
      update: {
        farmRate: dto.farmRate,
        finalRate: dto.finalRate,
      },
      create: {
        effectiveDate,
        farmRate: dto.farmRate,
        finalRate: dto.finalRate,
      },
    });

    return serializeMarketRate(rate);
  }

  async getEffective(dateInput: string | Date = new Date()) {
    const date = normalizeMarketDate(dateInput);
    const rate = await this.prisma.marketRate.findFirst({
      where: { effectiveDate: { lte: date } },
      orderBy: { effectiveDate: 'desc' },
    });

    if (!rate) {
      throw new NotFoundException(
        'No market rates are available for this invoice date',
      );
    }

    return serializeMarketRate(rate);
  }
}
