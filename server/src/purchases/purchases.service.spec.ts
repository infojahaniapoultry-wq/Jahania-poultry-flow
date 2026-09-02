import { PurchasesService } from './purchases.service';

describe('PurchasesService cheque reuse', () => {
  it('reuses an existing invoice cheque for a purchase', async () => {
    const tx = {
      vendor: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 7, name: 'Sindh Public Kanta Thatta' }),
      },
      driver: {
        findUnique: jest.fn(),
      },
      purchaseEntry: {
        create: jest.fn().mockResolvedValue({ id: 11 }),
        update: jest.fn().mockResolvedValue({ id: 11 }),
        findUnique: jest.fn().mockResolvedValue({ id: 11 }),
      },
      chequeLog: {
        findUnique: jest.fn().mockResolvedValue({
          id: 99,
          chequeNo: 'CH-123',
          bankName: 'Main Bank',
          chequeDate: new Date('2026-05-17T00:00:00.000Z'),
          amount: 150000,
          status: 'PENDING',
          sourceType: 'INVOICE',
          sourceId: 44,
          invoice: { id: 44 },
        }),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: 99 }),
        delete: jest.fn(),
      },
      onlinePaymentLog: {
        create: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn(async (fn) => fn(tx)),
    };

    const service = new PurchasesService(tx);

    await service.create({
      vendorId: 7,
      weightKg: 1000,
      ratePerKg: 150,
      paymentMode: 'CHEQUE',
      chequeNo: 'CH-123',
      bankName: 'Main Bank',
      chequeDate: '2026-05-17T00:00:00.000Z',
      existingChequeId: 99,
    });

    expect(tx.chequeLog.create).not.toHaveBeenCalled();
    expect(tx.chequeLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 99 },
        data: expect.objectContaining({
          sourceType: 'PURCHASE',
          sourceId: 11,
        }),
      }),
    );
    expect(tx.purchaseEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 11 },
        data: expect.objectContaining({
          chequeLogId: 99,
          paymentReference: 'CH-123',
        }),
      }),
    );
  });

  it('rejects udhar purchases with a paid amount', async () => {
    const tx = {
      vendor: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 7, name: 'Sindh Public Kanta Thatta' }),
      },
      driver: {
        findUnique: jest.fn(),
      },
      purchaseEntry: {
        create: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
      },
      chequeLog: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      onlinePaymentLog: {
        create: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn(async (fn) => fn(tx)),
    };

    const service = new PurchasesService(tx);

    await expect(
      service.create({
        vendorId: 7,
        weightKg: 100,
        ratePerKg: 100,
        paymentMode: 'UDHAR' as any,
        settledAmount: 500,
      } as any),
    ).rejects.toThrow('Udhar purchases cannot include a paid amount');
  });

  it('rejects purchases where the paid amount exceeds the purchase total', async () => {
    const tx = {
      vendor: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 7, name: 'Sindh Public Kanta Thatta' }),
      },
      driver: {
        findUnique: jest.fn(),
      },
      purchaseEntry: {
        create: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
      },
      chequeLog: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      onlinePaymentLog: {
        create: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn(async (fn) => fn(tx)),
    };

    const service = new PurchasesService(tx);

    await expect(
      service.create({
        vendorId: 7,
        weightKg: 100,
        ratePerKg: 100,
        paymentMode: 'CASH' as any,
        settledAmount: 20000,
      } as any),
    ).rejects.toThrow('Paid amount cannot exceed purchase total');
  });

  it('voids a cash purchase without deleting the record', async () => {
    const tx = {
      vendor: {
        findUnique: jest.fn().mockResolvedValue({
          id: 7,
          name: 'Sindh Public Kanta Thatta',
          currentBalance: 0,
        }),
        update: jest.fn().mockResolvedValue({ id: 7 }),
      },
      driver: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 4, defaultCharge: 1500, advanceBalance: 0 }),
        update: jest.fn().mockResolvedValue({ id: 4 }),
      },
      purchaseEntry: {
        findUnique: jest.fn().mockResolvedValue({
          id: 11,
          vendorId: 7,
          driverId: 4,
          driverCharge: 1500,
          purchaseAmount: 150000,
          paymentMode: 'CASH',
          chequeLogId: null,
          onlinePaymentLogId: null,
          isVoided: false,
        }),
        update: jest.fn().mockResolvedValue({ id: 11 }),
        delete: jest.fn(),
      },
      customer: {
        findUnique: jest.fn(),
      },
      vendorLedger: {
        create: jest.fn().mockResolvedValue({}),
      },
      customerLedger: {
        create: jest.fn(),
      },
      driverLedger: {
        create: jest.fn().mockResolvedValue({}),
      },
      cashBook: {
        findFirst: jest.fn().mockResolvedValue({ runningBalance: 1000 }),
        create: jest.fn().mockResolvedValue({}),
      },
      chequeLog: {
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      onlinePaymentLog: {
        delete: jest.fn(),
      },
      $transaction: jest.fn(async (fn) => fn(tx)),
    };

    const service = new PurchasesService(tx);

    await service.voidPurchase(11, 'duplicate entry');

    expect(tx.purchaseEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 11 },
        data: expect.objectContaining({
          isVoided: true,
          voidReason: 'duplicate entry',
          voidedAt: expect.any(Date),
        }),
      }),
    );
    expect(tx.vendorLedger.create).not.toHaveBeenCalled();
    expect(tx.purchaseEntry.delete).not.toHaveBeenCalled();
  });

  it('supports partial cash purchases by opening the unpaid balance as credit', async () => {
    const tx = {
      vendor: {
        findUnique: jest.fn().mockResolvedValue({
          id: 7,
          name: 'Sindh Public Kanta Thatta',
          currentBalance: 0,
        }),
        update: jest.fn().mockResolvedValue({ id: 7 }),
      },
      driver: {
        findUnique: jest.fn(),
      },
      purchaseEntry: {
        create: jest.fn().mockResolvedValue({ id: 11 }),
        update: jest.fn().mockResolvedValue({ id: 11 }),
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 11, settledAmount: 5000 }),
      },
      vendorLedger: {
        create: jest.fn().mockResolvedValue({}),
      },
      customerLedger: {
        create: jest.fn(),
      },
      driverLedger: {
        create: jest.fn(),
      },
      cashBook: {
        findFirst: jest.fn().mockResolvedValue({ runningBalance: 1000 }),
        create: jest.fn().mockResolvedValue({}),
      },
      chequeLog: {
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      onlinePaymentLog: {
        create: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn(async (fn) => fn(tx)),
    };

    const service = new PurchasesService(tx);

    await service.create({
      vendorId: 7,
      weightKg: 100,
      ratePerKg: 100,
      paymentMode: 'CASH',
      settledAmount: 5000,
    });

    expect(tx.purchaseEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          settledAmount: 5000,
          paymentStatus: 'OUTSTANDING',
        }),
      }),
    );
    expect(tx.cashBook.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: 5000,
        }),
      }),
    );
    expect(tx.cashBook.findFirst).toHaveBeenCalledWith({
      orderBy: { id: 'desc' },
      select: { runningBalance: true },
    });
    expect(tx.vendorLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: 5000,
          type: 'CREDIT',
        }),
      }),
    );
  });

  it('posts a backdated purchase to the vendor ledger on the purchase date', async () => {
    const tx = {
      vendor: {
        findUnique: jest.fn().mockResolvedValue({
          id: 7,
          name: 'Sindh Public Kanta Thatta',
          currentBalance: 0,
        }),
        update: jest.fn().mockResolvedValue({ id: 7 }),
      },
      driver: { findUnique: jest.fn() },
      purchaseEntry: {
        create: jest.fn().mockResolvedValue({ id: 11 }),
        update: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({ id: 11 }),
      },
      vendorLedger: { create: jest.fn().mockResolvedValue({}) },
      driverLedger: { create: jest.fn() },
      customerLedger: { create: jest.fn() },
      cashBook: {
        findFirst: jest.fn().mockResolvedValue({ runningBalance: 1000 }),
        create: jest.fn(),
      },
      chequeLog: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
      onlinePaymentLog: { create: jest.fn(), delete: jest.fn() },
      $transaction: jest.fn(async (fn) => fn(tx)),
    };

    const service = new PurchasesService(tx);
    const backdated = '2026-07-27T00:00:00.000Z';

    await service.create({
      vendorId: 7,
      weightKg: 100,
      ratePerKg: 100,
      paymentMode: 'UDHAR',
      date: backdated,
    });

    expect(tx.purchaseEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ date: new Date(backdated) }),
      }),
    );
    expect(tx.vendorLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ date: new Date(backdated) }),
      }),
    );
  });
});
