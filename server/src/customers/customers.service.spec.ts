import { CustomersService } from './customers.service';

describe('CustomersService ledger statement', () => {
  it('requires a complete pricing rule when creating a customer', async () => {
    const tx = { customer: { create: jest.fn() } };
    const service = new CustomersService(tx as any);

    await expect(service.create({
      shopName: 'Incomplete Rule',
      pricingBaseRateType: 'FARM' as any,
      pricingOffsetDirection: undefined as any,
      pricingOffsetValue: 6,
    })).rejects.toThrow('Base rate type, offset direction, and offset value are required together');
    expect(tx.customer.create).not.toHaveBeenCalled();
  });

  it('validates the complete pricing rule on customer updates', async () => {
    const tx = {
      customer: {
        findUnique: jest.fn().mockResolvedValue({
          id: 8,
          pricingBaseRateType: 'FARM',
          pricingOffsetDirection: 'MINUS',
          pricingOffsetValue: 6,
        }),
        update: jest.fn(),
      },
    };
    const service = new CustomersService(tx as any);

    await expect(service.update(8, { pricingOffsetValue: -1 })).rejects.toThrow('Pricing offset value cannot be negative');
    expect(tx.customer.update).not.toHaveBeenCalled();
  });

  it('replays the customer ledger as the source of truth', async () => {
    const tx = {
      customer: {
        findUnique: jest.fn().mockResolvedValue({
          id: 8,
          shopName: 'M/S Inshad',
          openingBalance: 0,
          currentBalance: 0,
        }),
      },
      customerLedger: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 1,
            date: new Date('2026-05-17T00:00:00.000Z'),
            createdAt: new Date('2026-05-17T00:00:00.000Z'),
            type: 'DEBIT',
            amount: 1464,
            runningBalance: 1464,
            narration: 'Invoice INVOICE-00022',
            referenceType: 'INVOICE',
            referenceId: 22,
          },
          {
            id: 2,
            date: new Date('2026-05-18T00:00:00.000Z'),
            createdAt: new Date('2026-05-18T00:00:00.000Z'),
            type: 'CREDIT',
            amount: 1464,
            runningBalance: 0,
            narration: 'Cash payment from M/S Inshad',
            referenceType: 'VOUCHER_PAYMENT_ADJUSTMENT',
            referenceId: 23,
          },
        ]),
      },
      invoice: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 22,
            items: [{ netWeight: 100, ratePerKg: 14 }],
          },
        ]),
      },
    };

    const service = new CustomersService(tx as any);

    const ledger = await service.getLedger(8);

    expect(tx.customerLedger.findMany).toHaveBeenCalledWith({
      where: { customerId: 8 },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });
    expect(ledger.closingBalance).toBe(0);
    expect(ledger.entries).toHaveLength(2);
    expect(ledger.entries[0]).toEqual(
      expect.objectContaining({
        type: 'DEBIT',
        amount: 1464,
        narration: 'Invoice INVOICE-00022',
        weightKg: 100,
        ratePerKg: 14,
      }),
    );
    expect(ledger.entries[1]).toEqual(
      expect.objectContaining({
        type: 'CREDIT',
        amount: 1464,
        narration: 'Cash payment from M/S Inshad',
        runningBalance: 0,
      }),
    );
  });

  it('returns stored current balance in findAll without rebuilding the statement', async () => {
    const tx = {
      customer: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 8,
            shopName: 'M/S Inshad',
            openingBalance: 0,
            currentBalance: '14884',
            isActive: true,
          },
        ]),
      },
      customerLedger: {
        findMany: jest.fn(),
      },
      invoice: {
        findMany: jest.fn(),
      },
    };

    const service = new CustomersService(tx as any);

    const customers = await service.findAll();

    expect(tx.customerLedger.findMany).not.toHaveBeenCalled();
    expect(tx.invoice.findMany).not.toHaveBeenCalled();
    expect(customers).toEqual([
      expect.objectContaining({
        id: 8,
        currentBalance: 14884,
      }),
    ]);
  });
});
