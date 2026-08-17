import { ReportsService } from './reports.service';
import { getCurrentStockSummary } from '../shared/stock-summary';

jest.mock('../shared/stock-summary', () => ({
  getCurrentStockSummary: jest.fn(),
}));

describe('ReportsService dashboard summary', () => {
  it('bundles dashboard data into one response', async () => {
    const prisma = {
      customer: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { currentBalance: 100 },
            { currentBalance: '250' },
          ]),
      },
      vendor: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { currentBalance: 75 },
            { currentBalance: '125' },
          ]),
      },
      purchaseEntry: {
        findMany: jest.fn().mockResolvedValue([
          {
            date: new Date('2026-05-31T03:00:00.000Z'),
            weightKg: 5,
            purchaseAmount: 50,
          },
          {
            date: new Date('2026-06-02T03:00:00.000Z'),
            weightKg: 10,
            purchaseAmount: 100,
          },
        ]),
      },
      invoice: {
        findMany: jest.fn().mockResolvedValue([
          {
            date: new Date('2026-05-31T03:00:00.000Z'),
            totalAmount: 120,
            items: [{ netWeight: 4 }],
          },
          {
            date: new Date('2026-06-02T03:00:00.000Z'),
            totalAmount: 200,
            items: [{ netWeight: 8 }],
          },
        ]),
      },
      expenseEntry: {
        findMany: jest.fn().mockResolvedValue([
          { date: new Date('2026-05-31T03:00:00.000Z'), amount: 10 },
          { date: new Date('2026-06-02T03:00:00.000Z'), amount: 20 },
        ]),
      },
    };

    const service = new ReportsService(prisma as any);
    (getCurrentStockSummary as jest.Mock).mockResolvedValue({
      purchasedWeight: 1000,
      soldWeight: 700,
      availableWeight: 300,
    });
    const dailySpy = jest.spyOn(service, 'getDailyPnL');

    const result = await service.getDashboardSummary('2026-06-02');

    expect(getCurrentStockSummary).toHaveBeenCalledWith(prisma);
    expect(prisma.customer.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.vendor.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.purchaseEntry.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.invoice.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.expenseEntry.findMany).toHaveBeenCalledTimes(1);
    expect(dailySpy).not.toHaveBeenCalled();
    expect(result.weekPnl).toHaveLength(7);
    expect(result.todayPnl.date).toBe('2026-06-02');
    expect(result.stock.availableWeight).toBe(300);
    expect(result.customers).toEqual([
      { currentBalance: 100 },
      { currentBalance: 250 },
    ]);
    expect(result.vendors).toEqual([
      { currentBalance: 75 },
      { currentBalance: 125 },
    ]);
    expect(result.todayPnl).toEqual(
      expect.objectContaining({
        purchaseWt: 10,
        purchaseAmt: 100,
        soldWt: 8,
        salesAmt: 200,
        totalExpenses: 20,
        grossProfit: 100,
        dailyProfit: 80,
        remainShort: 2,
        purchaseCount: 1,
        invoiceCount: 1,
      }),
    );
    expect(result.weekPnl.find((day) => day.date === '2026-05-31')).toEqual(
      expect.objectContaining({
        purchaseWt: 5,
        purchaseAmt: 50,
        soldWt: 4,
        salesAmt: 120,
        totalExpenses: 10,
        grossProfit: 70,
        dailyProfit: 60,
        remainShort: 1,
        purchaseCount: 1,
        invoiceCount: 1,
      }),
    );
  });

  it('returns the full customer statement when no date range is provided', async () => {
    const prisma = {
      customer: {
        findUnique: jest.fn().mockResolvedValue({
          id: 4,
          shopName: 'A-1 Traders',
          openingBalance: 200,
        }),
      },
      customerLedger: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 1,
            date: new Date('2026-05-01T00:00:00.000Z'),
            amount: 100,
            type: 'CREDIT',
            runningBalance: 100,
            narration: 'Manual adj',
            referenceType: null,
            referenceId: null,
          },
        ]),
      },
    };

    const service = new ReportsService(prisma as any);

    const result = await service.getCustomerStatement(4, undefined, undefined);

    expect(prisma.customerLedger.findMany).toHaveBeenCalledWith({
      where: {
        customerId: 4,
      },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });
    expect(result.customer).toEqual({
      id: 4,
      shopName: 'A-1 Traders',
      openingBalance: 200,
    });
    expect(result.ledger.map((row) => row.narration)).toEqual([
      'Manual adj',
    ]);
    expect(result.closingBalance).toBe(100);
  });

  it('shows one cash invoice row instead of debit plus payment rows', async () => {
    const prisma = {
      customer: {
        findUnique: jest.fn().mockResolvedValue({
          id: 4,
          shopName: 'A-1 Traders',
          openingBalance: 0,
        }),
      },
      customerLedger: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 10,
            date: new Date('2026-05-02T00:00:00.000Z'),
            createdAt: new Date('2026-05-02T00:01:00.000Z'),
            amount: 100,
            type: 'DEBIT',
            narration: 'Invoice INVOICE-00001',
            referenceType: 'INVOICE',
            referenceId: 1,
          },
          {
            id: 11,
            date: new Date('2026-05-02T00:00:00.000Z'),
            createdAt: new Date('2026-05-02T00:02:00.000Z'),
            amount: 100,
            type: 'CREDIT',
            narration: 'Payment for invoice INVOICE-00001',
            referenceType: 'INVOICE_PAYMENT',
            referenceId: 1,
          },
        ]),
      },
      invoice: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            {
              id: 1,
              totalAmount: 100,
              settledAmount: 100,
              paymentMode: 'CASH',
              paymentStatus: 'COMPLETED',
            },
          ])
          .mockResolvedValueOnce([
            { id: 1, items: [{ netWeight: 1, ratePerKg: 100 }] },
          ]),
      },
    };

    const service = new ReportsService(prisma as any);
    const result = await service.getCustomerStatement(4);

    expect(result.ledger).toHaveLength(1);
    expect(result.ledger[0]).toEqual(
      expect.objectContaining({ type: 'CASH', amount: 100, runningBalance: 0 }),
    );
  });

  it('shows an udhaar row followed by a cleared udhaar settlement row', async () => {
    const prisma = {
      customer: {
        findUnique: jest.fn().mockResolvedValue({
          id: 4,
          shopName: 'A-1 Traders',
          openingBalance: 0,
        }),
      },
      customerLedger: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 20,
            date: new Date('2026-05-03T00:00:00.000Z'),
            createdAt: new Date('2026-05-03T00:01:00.000Z'),
            amount: 100,
            type: 'DEBIT',
            narration: 'Invoice INVOICE-00002',
            referenceType: 'INVOICE',
            referenceId: 2,
          },
          {
            id: 21,
            date: new Date('2026-05-04T00:00:00.000Z'),
            createdAt: new Date('2026-05-04T00:01:00.000Z'),
            amount: 100,
            type: 'CREDIT',
            narration: 'Credit settlement - customer',
            referenceType: 'VOUCHER',
            referenceId: 8,
          },
        ]),
      },
      invoice: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            {
              id: 2,
              totalAmount: 100,
              settledAmount: 100,
              paymentMode: 'UDHAR',
              paymentStatus: 'COMPLETED',
            },
          ])
          .mockResolvedValueOnce([
            { id: 2, items: [{ netWeight: 1, ratePerKg: 100 }] },
          ]),
      },
      voucher: {
        findMany: jest.fn().mockResolvedValue([
          { id: 8, type: 'RECOVERY', paymentMode: 'CASH' },
        ]),
      },
      chequeLog: { findMany: jest.fn().mockResolvedValue([]) },
      onlinePaymentLog: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const service = new ReportsService(prisma as any);
    const result = await service.getCustomerStatement(4);

    expect(result.ledger.map((row) => row.type)).toEqual([
      'UDHAAR',
      'CLEARED UDHAAR',
    ]);
    expect(result.closingBalance).toBe(0);
  });

  it('returns the vendor ledger as the statement source of truth', async () => {
    const prisma = {
      vendor: {
        findUnique: jest.fn().mockResolvedValue({
          id: 7,
          name: 'Farm Supplies',
          openingBalance: 50,
        }),
      },
      vendorLedger: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 3,
            date: new Date('2026-05-01T00:00:00.000Z'),
            amount: 20,
            type: 'DEBIT',
            runningBalance: 30,
            narration: 'Manual adjustment',
            referenceType: null,
            referenceId: null,
          },
        ]),
      },
      purchaseEntry: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const service = new ReportsService(prisma as any);

    const result = await service.getVendorStatement(7, undefined, undefined);

    expect(prisma.vendorLedger.findMany).toHaveBeenCalledWith({
      where: { vendorId: 7 },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });
    expect(prisma.purchaseEntry.findMany).toHaveBeenCalledWith({
      where: { vendorId: 7, isVoided: false },
      select: {
        id: true,
        date: true,
        createdAt: true,
        weightKg: true,
        ratePerKg: true,
        purchaseAmount: true,
        settledAmount: true,
        paymentMode: true,
        paymentStatus: true,
        notes: true,
      },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });
    expect(result.vendor).toEqual({
      id: 7,
      name: 'Farm Supplies',
      openingBalance: 50,
    });
    expect(result.ledger.map((row) => row.narration)).toEqual([
      'Manual adjustment',
    ]);
    expect(result.closingBalance).toBe(30);
  });

  it('includes a fully paid purchase that has no payable ledger row', async () => {
    const prisma = {
      vendor: {
        findUnique: jest.fn().mockResolvedValue({
          id: 7,
          name: 'Sukkhur Poultry',
          openingBalance: 0,
        }),
      },
      vendorLedger: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      purchaseEntry: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 18,
            date: new Date('2026-05-02T00:00:00.000Z'),
            createdAt: new Date('2026-05-02T01:00:00.000Z'),
            weightKg: 100,
            ratePerKg: 320,
            purchaseAmount: 32000,
            settledAmount: 32000,
            paymentMode: 'CASH',
            paymentStatus: 'COMPLETED',
            notes: null,
          },
        ]),
      },
    };

    const service = new ReportsService(prisma as any);

    const result = await service.getVendorStatement(7);

    expect(result.ledger).toEqual([
      expect.objectContaining({
        type: 'CASH',
        amount: 32000,
        runningBalance: 0,
        weightKg: 100,
        ratePerKg: 320,
        narration: 'Purchase from Sukkhur Poultry',
      }),
    ]);
    expect(result.closingBalance).toBe(0);
  });

  it('includes a legacy completed purchase with a missing settled amount', async () => {
    const prisma = {
      vendor: {
        findUnique: jest.fn().mockResolvedValue({
          id: 7,
          name: 'Sukkhur Poultry',
          openingBalance: 0,
        }),
      },
      vendorLedger: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      purchaseEntry: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 19,
            date: new Date('2026-05-03T00:00:00.000Z'),
            createdAt: new Date('2026-05-03T01:00:00.000Z'),
            weightKg: 50,
            ratePerKg: 300,
            purchaseAmount: 15000,
            settledAmount: 0,
            paymentMode: 'CASH',
            paymentStatus: 'COMPLETED',
            notes: null,
          },
        ]),
      },
    };

    const service = new ReportsService(prisma as any);

    const result = await service.getVendorStatement(7);

    expect(result.ledger[0]).toEqual(
      expect.objectContaining({
        type: 'CASH',
        amount: 15000,
        runningBalance: 0,
      }),
    );
  });
});
