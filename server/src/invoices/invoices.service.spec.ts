import { InvoicesService } from './invoices.service';

describe('InvoicesService void flow', () => {
  it('records a fully paid cash invoice in the customer ledger without changing the balance', async () => {
    const tx = {
      invoice: {
        create: jest.fn().mockResolvedValue({ id: 34 }),
        update: jest.fn().mockResolvedValue({ id: 34 }),
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
      customer: {
        findUnique: jest.fn().mockResolvedValue({ id: 8, currentBalance: 250 }),
        update: jest.fn().mockResolvedValue({ id: 8 }),
      },
      driver: {
        findUnique: jest.fn().mockResolvedValue({ id: 4, advanceBalance: 0, defaultCharge: 0 }),
        update: jest.fn(),
      },
      purchaseEntry: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { weightKg: 1000 } }),
      },
      invoiceItem: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { netWeight: 100 } }),
      },
      customerLedger: {
        create: jest.fn().mockResolvedValue({}),
      },
      driverLedger: {
        create: jest.fn(),
      },
      cashBook: {
        findFirst: jest.fn().mockResolvedValue({ runningBalance: 0 }),
        create: jest.fn().mockResolvedValue({}),
      },
      chequeLog: {
        create: jest.fn(),
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

    const service = new InvoicesService(tx as any);

    await service.create({
      customerId: 8,
      driverId: 4,
      paymentMode: 'CASH',
      settledAmount: 1000,
      items: [{ ratePerKg: 10, quantityKg: 100 }],
    });

    expect(tx.customerLedger.create).toHaveBeenCalledTimes(2);
    expect(tx.customerLedger.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'DEBIT',
          amount: 1000,
          referenceType: 'INVOICE',
        }),
      }),
    );
    expect(tx.customerLedger.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'CREDIT',
          amount: 1000,
          referenceType: 'INVOICE_PAYMENT',
        }),
      }),
    );
  });

  it('voids an udhar invoice without deleting the record', async () => {
    const tx = {
      invoice: {
        findUnique: jest.fn().mockResolvedValue({
          id: 22,
          customerId: 8,
          driverId: 4,
          driverCharge: 1200,
          totalAmount: 15000,
          paymentMode: 'UDHAR',
          chequeLogId: null,
          onlinePaymentLogId: null,
          isVoided: false,
        }),
        update: jest.fn().mockResolvedValue({ id: 22 }),
        delete: jest.fn(),
      },
      customer: {
        findUnique: jest.fn().mockResolvedValue({ id: 8, currentBalance: 0 }),
        update: jest.fn().mockResolvedValue({ id: 8 }),
      },
      driver: {
        findUnique: jest.fn().mockResolvedValue({ id: 4, advanceBalance: 0 }),
        update: jest.fn().mockResolvedValue({ id: 4 }),
      },
      customerLedger: {
        create: jest.fn().mockResolvedValue({}),
      },
      driverLedger: {
        create: jest.fn().mockResolvedValue({}),
      },
      cashBook: {
        findFirst: jest.fn().mockResolvedValue({ runningBalance: 0 }),
        create: jest.fn(),
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

    const service = new InvoicesService(tx);

    await service.voidInvoice(22, 'duplicate entry');

    expect(tx.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 22 },
        data: expect.objectContaining({
          isVoided: true,
          voidReason: 'duplicate entry',
          voidedAt: expect.any(Date),
        }),
      }),
    );
    expect(tx.customerLedger.create).toHaveBeenCalledTimes(1);
    expect(tx.customerLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'CREDIT',
          amount: 15000,
          referenceType: 'INVOICE_VOID',
        }),
      }),
    );
    expect(tx.invoice.delete).not.toHaveBeenCalled();
  });

  it('supports partial cash invoices by opening the remainder as credit', async () => {
    const tx = {
      invoice: {
        create: jest.fn().mockResolvedValue({ id: 22 }),
        update: jest.fn().mockResolvedValue({ id: 22 }),
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
      customer: {
        findUnique: jest.fn().mockResolvedValue({ id: 8, currentBalance: 0 }),
        update: jest.fn().mockResolvedValue({ id: 8 }),
      },
      driver: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 4, advanceBalance: 0, defaultCharge: 1200 }),
        update: jest.fn().mockResolvedValue({ id: 4 }),
      },
      purchaseEntry: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { weightKg: 1000 } }),
      },
      invoiceItem: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { quantityKg: 1000 } }),
        create: jest.fn(),
      },
      customerLedger: {
        create: jest.fn().mockResolvedValue({}),
      },
      driverLedger: {
        create: jest.fn().mockResolvedValue({}),
      },
      cashBook: {
        findFirst: jest.fn().mockResolvedValue({ runningBalance: 0 }),
        create: jest.fn().mockResolvedValue({}),
      },
      chequeLog: {
        create: jest.fn(),
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

    const service = new InvoicesService(tx);

    await service.create({
      customerId: 8,
      driverId: 4,
      paymentMode: 'CASH',
      settledAmount: 7000,
      items: [{ ratePerKg: 100, quantityKg: 100 }],
    });

    expect(tx.invoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          settledAmount: 7000,
          paymentStatus: 'OUTSTANDING',
        }),
      }),
    );
    expect(tx.cashBook.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: 7000,
        }),
      }),
    );
    expect(tx.cashBook.findFirst).toHaveBeenCalledWith({
      orderBy: { id: 'desc' },
      select: { runningBalance: true },
    });
    expect(tx.customerLedger.create).toHaveBeenCalledTimes(2);
    expect(tx.customerLedger.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          amount: 10000,
          type: 'DEBIT',
        }),
      }),
    );
    expect(tx.customerLedger.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          amount: 7000,
          type: 'CREDIT',
          referenceType: 'INVOICE_PAYMENT',
        }),
      }),
    );
  });

  it('rejects invoices where the paid amount exceeds the invoice total', async () => {
    const tx = {
      invoice: {
        create: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
      customer: {
        findUnique: jest.fn().mockResolvedValue({ id: 8, currentBalance: 0 }),
      },
      driver: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 4, advanceBalance: 0, defaultCharge: 1200 }),
      },
      customerLedger: {
        create: jest.fn(),
      },
      driverLedger: {
        create: jest.fn(),
      },
      cashBook: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      chequeLog: {
        create: jest.fn(),
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

    const service = new InvoicesService(tx);

    await expect(
      service.create({
        customerId: 8,
        driverId: 4,
        paymentMode: 'CASH' as any,
        settledAmount: 20000,
        items: [{ ratePerKg: 100, quantityKg: 100 }],
      } as any),
    ).rejects.toThrow('Paid amount cannot exceed invoice total');
  });

  it('rejects udhar invoices with a paid amount', async () => {
    const tx = {
      invoice: {
        create: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
      customer: {
        findUnique: jest.fn().mockResolvedValue({ id: 8, currentBalance: 0 }),
      },
      driver: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 4, advanceBalance: 0, defaultCharge: 1200 }),
      },
      customerLedger: {
        create: jest.fn(),
      },
      driverLedger: {
        create: jest.fn(),
      },
      cashBook: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      chequeLog: {
        create: jest.fn(),
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

    const service = new InvoicesService(tx);

    await expect(
      service.create({
        customerId: 8,
        driverId: 4,
        paymentMode: 'UDHAR' as any,
        settledAmount: 7000,
        items: [{ ratePerKg: 100, quantityKg: 100 }],
      } as any),
    ).rejects.toThrow('Udhar invoices cannot include a paid amount');
  });
});
