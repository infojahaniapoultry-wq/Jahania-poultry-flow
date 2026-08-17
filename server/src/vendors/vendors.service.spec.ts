import { VendorsService } from './vendors.service';

describe('VendorsService ledger statement', () => {
  it('replays the vendor ledger as the source of truth', async () => {
    const tx = {
      vendor: {
        findUnique: jest.fn().mockResolvedValue({
          id: 7,
          name: 'Sindh Public Kanta Thatta',
          openingBalance: 500,
          currentBalance: 500,
        }),
      },
      vendorLedger: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 1,
            date: new Date('2026-05-17T00:00:00.000Z'),
            createdAt: new Date('2026-05-17T00:00:00.000Z'),
            type: 'CREDIT',
            amount: 1500,
            runningBalance: 2000,
            narration: 'Purchase from Sindh Public Kanta Thatta',
            referenceType: 'PURCHASE',
            referenceId: 11,
          },
          {
            id: 2,
            date: new Date('2026-05-18T00:00:00.000Z'),
            createdAt: new Date('2026-05-18T00:00:00.000Z'),
            type: 'DEBIT',
            amount: 200,
            runningBalance: 1800,
            narration: 'Cheque payment from Sindh Public Kanta Thatta',
            referenceType: 'VOUCHER_PAYMENT_ADJUSTMENT',
            referenceId: 91,
          },
        ]),
      },
      purchaseEntry: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 11,
            weightKg: 250,
            ratePerKg: 8,
          },
        ]),
      },
    };

    const service = new VendorsService(tx as any);

    const ledger = await service.getLedger(7);

    expect(tx.vendorLedger.findMany).toHaveBeenCalledWith({
      where: { vendorId: 7 },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });
    expect(ledger.openingBalance).toBe(500);
    expect(ledger.closingBalance).toBe(1800);
    expect(ledger.entries).toHaveLength(2);
    expect(ledger.entries[0]).toEqual(
      expect.objectContaining({
        type: 'CREDIT',
        amount: 1500,
        runningBalance: 2000,
        narration: 'Purchase from Sindh Public Kanta Thatta',
        weightKg: 250,
        ratePerKg: 8,
      }),
    );
    expect(ledger.entries[1]).toEqual(
      expect.objectContaining({
        type: 'DEBIT',
        amount: 200,
        runningBalance: 1800,
        narration: 'Cheque payment from Sindh Public Kanta Thatta',
      }),
    );
  });

  it('returns stored current balance in findAll without rebuilding the statement', async () => {
    const tx = {
      vendor: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 7,
            name: 'Sindh Public Kanta Thatta',
            openingBalance: 500,
            currentBalance: '1800',
            isActive: true,
          },
        ]),
      },
      vendorLedger: {
        findMany: jest.fn(),
      },
    };

    const service = new VendorsService(tx as any);

    const vendors = await service.findAll();

    expect(tx.vendorLedger.findMany).not.toHaveBeenCalled();
    expect(vendors).toEqual([
      expect.objectContaining({
        id: 7,
        currentBalance: 1800,
      }),
    ]);
  });
});
