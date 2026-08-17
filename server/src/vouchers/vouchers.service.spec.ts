import {
  ChequeStatus,
  OnlineProvider,
  PaymentMode,
  PaymentStatus,
  VoucherType,
} from '@prisma/client';
import { VouchersService } from './vouchers.service';

describe('VouchersService credit settlement', () => {
  const createPrismaMock = (overrides: Record<string, any> = {}) => ({
    voucher: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({ id: 1 }),
      update: jest.fn().mockResolvedValue({ id: 1 }),
    },
    customer: {
      findUnique: jest.fn().mockResolvedValue({
        id: 8,
        shopName: 'M/S Inshad',
        currentBalance: 1000,
      }),
      update: jest.fn().mockResolvedValue({ id: 8 }),
    },
    vendor: {
      findUnique: jest.fn().mockResolvedValue({
        id: 7,
        name: 'Sindh Public Kanta Thatta',
        currentBalance: 1000,
      }),
      update: jest.fn().mockResolvedValue({ id: 7 }),
    },
    customerLedger: {
      create: jest.fn().mockResolvedValue({ id: 11 }),
    },
    vendorLedger: {
      create: jest.fn().mockResolvedValue({ id: 12 }),
    },
    invoice: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ id: 101 }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    purchaseEntry: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ id: 201 }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    cashBook: {
      findFirst: jest.fn().mockResolvedValue({ runningBalance: 0 }),
      create: jest.fn().mockResolvedValue({ id: 21 }),
    },
    bankLedger: {
      findFirst: jest.fn().mockResolvedValue({ runningBalance: 0 }),
      create: jest.fn().mockResolvedValue({ id: 22 }),
    },
    easypaisaLedger: {
      findFirst: jest.fn().mockResolvedValue({ runningBalance: 0 }),
      create: jest.fn().mockResolvedValue({ id: 23 }),
    },
    chequeLog: {
      create: jest.fn().mockResolvedValue({ id: 31 }),
    },
    onlinePaymentLog: {
      create: jest.fn().mockResolvedValue({ id: 32 }),
    },
    ...overrides,
  });

  it('allocates customer settlement across invoices and creates a cheque log', async () => {
    const tx = createPrismaMock({
      invoice: {
        findMany: jest.fn().mockResolvedValue([
          { id: 101, totalBalance: 1500, settledAmount: 500 },
          { id: 102, totalBalance: 1000, settledAmount: 0 },
        ]),
        update: jest.fn().mockResolvedValue({ id: 101 }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    });
    const prismaMock = {
      ...tx,
      $transaction: jest.fn(async (fn) => fn(tx as any)),
    };

    const service = new VouchersService(prismaMock as any);

    await service.create({
      type: VoucherType.RECOVERY,
      customerId: 8,
      amount: 1000,
      paymentMode: PaymentMode.CHEQUE,
      date: '2026-05-21T00:00:00.000Z',
      narration: 'Credit settlement - customer',
      reference: 'RCPT-1',
      chequeNo: 'CH-1001',
      bankName: 'Main Bank',
      chequeDate: '2026-05-23T00:00:00.000Z',
    });

    expect(tx.invoice.findMany).toHaveBeenCalled();
    expect(tx.invoice.update).toHaveBeenCalledWith({
      where: { id: 101 },
      data: {
        settledAmount: 1500,
        paymentStatus: PaymentStatus.PENDING,
        paymentReference: 'REC-00001',
      },
    });
    expect(tx.chequeLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        chequeNo: 'CH-1001',
        bankName: 'Main Bank',
        sourceType: 'VOUCHER',
        sourceId: 1,
        paymentMode: PaymentMode.CHEQUE,
        status: ChequeStatus.PENDING,
        receivedFrom: 'M/S Inshad',
      }),
    });
  });

  it('allocates vendor settlement across purchases and creates an online payment log', async () => {
    const tx = createPrismaMock({
      vendor: {
        findUnique: jest.fn().mockResolvedValue({
          id: 7,
          name: 'Sindh Public Kanta Thatta',
          currentBalance: 2000,
        }),
        update: jest.fn().mockResolvedValue({ id: 7 }),
      },
      customer: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      customerLedger: {
        create: jest.fn(),
      },
      purchaseEntry: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 201, purchaseAmount: 1200, settledAmount: 200 },
          ]),
        update: jest.fn().mockResolvedValue({ id: 201 }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    });
    const prismaMock = {
      ...tx,
      $transaction: jest.fn(async (fn) => fn(tx as any)),
    };

    const service = new VouchersService(prismaMock as any);

    await service.create({
      type: VoucherType.DEBIT,
      vendorId: 7,
      amount: 1000,
      paymentMode: PaymentMode.ONLINE,
      paymentProvider: OnlineProvider.EASYPAISA,
      paymentReference: 'TXN-5001',
      date: '2026-05-21T00:00:00.000Z',
      narration: 'Credit settlement - vendor',
      reference: 'PV-1',
    });

    expect(tx.purchaseEntry.findMany).toHaveBeenCalled();
    expect(tx.purchaseEntry.update).toHaveBeenCalledWith({
      where: { id: 201 },
      data: {
        settledAmount: 1200,
        paymentStatus: PaymentStatus.PENDING,
        paymentReference: 'DEB-00001',
        paymentProvider: OnlineProvider.EASYPAISA,
      },
    });
    expect(tx.onlinePaymentLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        provider: OnlineProvider.EASYPAISA,
        referenceNo: 'TXN-5001',
        sourceType: 'VOUCHER',
        sourceId: 1,
        status: PaymentStatus.PENDING,
        receivedFrom: 'Sindh Public Kanta Thatta',
      }),
    });
  });

  it('includes partial purchase balances when settling vendor credit', async () => {
    const tx = createPrismaMock({
      vendor: {
        findUnique: jest.fn().mockResolvedValue({
          id: 7,
          name: 'Sindh Public Kanta Thatta',
          currentBalance: 2000,
        }),
        update: jest.fn().mockResolvedValue({ id: 7 }),
      },
      customer: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      customerLedger: {
        create: jest.fn(),
      },
        purchaseEntry: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 301,
              purchaseAmount: 36000,
              settledAmount: 34000,
              paymentStatus: 'COMPLETED',
            },
          ]),
        update: jest.fn().mockResolvedValue({ id: 301 }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    });
    const prismaMock = {
      ...tx,
      $transaction: jest.fn(async (fn) => fn(tx as any)),
    };

    const service = new VouchersService(prismaMock as any);

    await service.create({
      type: VoucherType.DEBIT,
      vendorId: 7,
      amount: 2000,
      paymentMode: PaymentMode.CASH,
      date: '2026-05-21T00:00:00.000Z',
      narration: 'Credit settlement - vendor',
      reference: 'PV-2',
    });

    expect(tx.purchaseEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          vendorId: 7,
          isVoided: false,
        }),
      }),
    );
    expect(tx.purchaseEntry.update).toHaveBeenCalledWith({
      where: { id: 301 },
      data: {
        settledAmount: 36000,
        paymentStatus: PaymentStatus.COMPLETED,
      },
    });
  });
});
