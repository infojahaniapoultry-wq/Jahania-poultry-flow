import { MarketRatesService } from './market-rates.service';

describe('MarketRatesService', () => {
  it('upserts one market-rate record for a date', async () => {
    const prisma = {
      marketRate: {
        upsert: jest.fn().mockResolvedValue({
          id: 1,
          effectiveDate: new Date('2026-07-29T00:00:00.000Z'),
          farmRate: 320,
          finalRate: 322,
        }),
      },
    };
    const service = new MarketRatesService(prisma as any);

    await service.upsert({
      effectiveDate: '2026-07-29',
      farmRate: 320,
      finalRate: 322,
    });

    expect(prisma.marketRate.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { effectiveDate: new Date('2026-07-29T00:00:00.000Z') },
        update: { farmRate: 320, finalRate: 322 },
        create: {
          effectiveDate: new Date('2026-07-29T00:00:00.000Z'),
          farmRate: 320,
          finalRate: 322,
        },
      }),
    );
  });

  it('returns the latest rate on or before the requested date', async () => {
    const prisma = {
      marketRate: {
        findFirst: jest.fn().mockResolvedValue({
          id: 1,
          effectiveDate: new Date('2026-07-28T00:00:00.000Z'),
          farmRate: 318,
          finalRate: 320,
        }),
      },
    };
    const service = new MarketRatesService(prisma as any);

    await expect(service.getEffective('2026-07-29')).resolves.toEqual(
      expect.objectContaining({ farmRate: 318, finalRate: 320 }),
    );
    expect(prisma.marketRate.findFirst).toHaveBeenCalledWith({
      where: { effectiveDate: { lte: new Date('2026-07-29T00:00:00.000Z') } },
      orderBy: { effectiveDate: 'desc' },
    });
  });

  it('rejects an invoice date before the first market-rate record', async () => {
    const prisma = { marketRate: { findFirst: jest.fn().mockResolvedValue(null) } };
    const service = new MarketRatesService(prisma as any);

    await expect(service.getEffective('2026-07-29')).rejects.toThrow(
      'No market rates are available for this invoice date',
    );
  });
});
