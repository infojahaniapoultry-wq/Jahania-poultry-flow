import { DriversService } from './drivers.service';

describe('DriversService ledger detail enrichment', () => {
  it('adds linked invoice weight and rate to driver ledger entries', async () => {
    const prisma = {
      driver: {
        findUnique: jest.fn().mockResolvedValue({ id: 4, advanceBalance: 0 }),
      },
      driverLedger: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 1,
            driverId: 4,
            date: new Date('2026-05-17T00:00:00.000Z'),
            type: 'DEBIT',
            amount: 1200,
            runningBalance: 1200,
            referenceType: 'INVOICE_DRIVER_CHARGE',
            referenceId: 22,
          },
        ]),
      },
      invoice: {
        findMany: jest.fn().mockResolvedValue([
          { id: 22, items: [{ netWeight: 100, ratePerKg: 12.5 }] },
        ]),
      },
      purchaseEntry: {
        findMany: jest.fn(),
      },
    };

    const service = new DriversService(prisma as any);

    const ledger = await service.getLedger(4);

    expect(ledger[0]).toEqual(
      expect.objectContaining({ weightKg: 100, ratePerKg: 12.5, rateCount: 1 }),
    );
  });
});
