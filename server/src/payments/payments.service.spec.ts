import { BadRequestException } from '@nestjs/common';
import { PaymentStatus, VoucherType } from '@prisma/client';
import { ChequeStatus } from '@prisma/client';
import { PaymentsService } from './payments.service';

describe('PaymentsService cheque status flow', () => {
  const createTransactionMock = (overrides?: Partial<any>) => ({
    vendor: {
      findUnique: jest.fn().mockResolvedValue({ id: 7, currentBalance: 0 }),
      update: jest.fn().mockResolvedValue({ id: 7 }),
    },
    customer: {
      findUnique: jest.fn().mockResolvedValue({ id: 8, currentBalance: 0 }),
      update: jest.fn().mockResolvedValue({ id: 8 }),
    },
    voucher: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    vendorLedger: {
      create: jest.fn().mockResolvedValue({ id: 1 }),
    },
    customerLedger: {
      create: jest.fn().mockResolvedValue({ id: 9 }),
    },
    purchaseEntry: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: 55, purchaseAmount: 0, settledAmount: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ id: 55 }),
    },
    invoice: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: 44, totalAmount: 0, settledAmount: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ id: 44 }),
    },
    bankLedger: {
      findFirst: jest.fn().mockResolvedValue({ runningBalance: 0 }),
      create: jest.fn().mockResolvedValue({ id: 2 }),
    },
    onlinePaymentLog: {
      update: jest.fn().mockResolvedValue({ id: 3 }),
    },
    chequeLog: {
      update: jest.fn().mockResolvedValue({ id: 1 }),
    },
    ...overrides,
  });

  it('rejects unsupported cheque statuses', async () => {
    const prismaMock = {
      chequeLog: {
        findUnique: jest.fn().mockResolvedValue({
          id: 1,
          status: ChequeStatus.PENDING,
          amount: 1000,
          chequeNo: '1234',
          sourceType: 'PURCHASE',
          sourceId: 55,
          purchase: { id: 55 },
          invoice: null,
        }),
        update: jest.fn(),
      },
      $transaction: jest.fn(async (fn) =>
        fn({
          purchase: { update: jest.fn() },
          invoice: { update: jest.fn() },
          chequeLog: { update: jest.fn() },
        }),
      ),
    };

    const service = new PaymentsService(prismaMock as any);
    const unsupportedStatus = 'VOIDED' as any;

    await expect(
      service.updateChequeStatus(1, { status: unsupportedStatus }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('marks a transferred purchase outstanding when the cheque is smaller', async () => {
    const tx = createTransactionMock();
    const prismaMock = {
      chequeLog: {
        findUnique: jest.fn().mockResolvedValue({
          id: 1,
          status: ChequeStatus.PENDING,
          amount: 14884,
          chequeNo: '1212',
          sourceType: 'PURCHASE',
          sourceId: 55,
          purchase: {
            id: 55,
            vendorId: 7,
            purchaseAmount: 122200,
            settledAmount: 0,
          },
          invoice: null,
        }),
        update: jest.fn(),
      },
      $transaction: jest.fn(async (fn) => fn(tx as any)),
    };

    const service = new PaymentsService(prismaMock as any);

    await service.updateChequeStatus(1, { status: ChequeStatus.CLEARED });

    expect(tx.bankLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: 14884,
        }),
      }),
    );
    expect(tx.vendorLedger.create).not.toHaveBeenCalled();
    expect(tx.purchaseEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paymentStatus: 'OUTSTANDING',
          settledAmount: 14884,
        }),
      }),
    );
  });

  it('records vendor credit when the cheque is larger', async () => {
    const tx = createTransactionMock();
    const prismaMock = {
      chequeLog: {
        findUnique: jest.fn().mockResolvedValue({
          id: 1,
          status: ChequeStatus.PENDING,
          amount: 150000,
          chequeNo: '1213',
          sourceType: 'PURCHASE',
          sourceId: 55,
          purchase: {
            id: 55,
            vendorId: 7,
            purchaseAmount: 122200,
            settledAmount: 5000,
          },
          invoice: null,
        }),
        update: jest.fn(),
      },
      $transaction: jest.fn(async (fn) => fn(tx as any)),
    };

    const service = new PaymentsService(prismaMock as any);

    await service.updateChequeStatus(1, { status: ChequeStatus.CLEARED });

    expect(tx.vendorLedger.create).not.toHaveBeenCalled();
    expect(tx.purchaseEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paymentStatus: 'COMPLETED',
          settledAmount: 122200,
        }),
      }),
    );
  });

  it('completes a partially paid purchase when an online payment clears the remainder', async () => {
    const tx = createTransactionMock();
    const prismaMock = {
      onlinePaymentLog: {
        findUnique: jest.fn().mockResolvedValue({
          id: 1,
          status: PaymentStatus.PENDING,
          amount: 5000,
          referenceNo: 'ONL-3',
          provider: 'BANK_TRANSFER',
          sourceType: 'PURCHASE',
          sourceId: 77,
          purchase: {
            id: 77,
            vendorId: 7,
            purchaseAmount: 9000,
            settledAmount: 4000,
          },
          invoice: null,
        }),
        update: jest.fn(),
      },
      $transaction: jest.fn(async (fn) => fn(tx as any)),
    };

    const service = new PaymentsService(prismaMock as any);

    await service.updateOnlineStatus(1, { status: PaymentStatus.COMPLETED });

    expect(tx.bankLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: 5000,
          type: 'DEBIT',
        }),
      }),
    );
    expect(tx.purchaseEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paymentStatus: 'COMPLETED',
          settledAmount: 9000,
        }),
      }),
    );
  });

  it('treats a voucher-backed cheque like a real cheque and reverses the customer ledger on bounce', async () => {
    const tx = createTransactionMock({
      customer: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 8, currentBalance: 1200 }),
        update: jest.fn().mockResolvedValue({ id: 8 }),
      },
      invoice: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 101, totalBalance: 2500, settledAmount: 2500 },
          ]),
        update: jest.fn().mockResolvedValue({ id: 101 }),
      },
      customerLedger: {
        create: jest.fn().mockResolvedValue({ id: 91 }),
      },
      voucher: {
        findUnique: jest.fn().mockResolvedValue({
          type: VoucherType.RECOVERY,
          customerId: 8,
          vendorId: null,
        }),
      },
    });
    const prismaMock = {
      chequeLog: {
        findUnique: jest.fn().mockResolvedValue({
          id: 1,
          status: ChequeStatus.PENDING,
          amount: 2500,
          chequeNo: 'V-100',
          sourceType: 'VOUCHER',
          sourceId: 99,
          purchase: null,
          invoice: null,
        }),
        update: jest.fn(),
      },
      $transaction: jest.fn(async (fn) => fn(tx as any)),
    };

    const service = new PaymentsService(prismaMock as any);

    await service.updateChequeStatus(1, { status: ChequeStatus.BOUNCED });

    expect(tx.customerLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customerId: 8,
          amount: 2500,
          type: 'DEBIT',
          referenceType: 'VOUCHER_PAYMENT_ADJUSTMENT',
        }),
      }),
    );
    expect(tx.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          settledAmount: 0,
          paymentStatus: 'OUTSTANDING',
        }),
      }),
    );
    expect(tx.chequeLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ChequeStatus.BOUNCED,
        }),
      }),
    );
  });

  it('treats a voucher-backed online payment like a real payment and reverses the customer ledger on failure', async () => {
    const tx = createTransactionMock({
      customer: {
        findUnique: jest.fn().mockResolvedValue({ id: 8, currentBalance: 900 }),
        update: jest.fn().mockResolvedValue({ id: 8 }),
      },
      invoice: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 202, totalBalance: 1800, settledAmount: 1800 },
          ]),
        update: jest.fn().mockResolvedValue({ id: 202 }),
      },
      customerLedger: {
        create: jest.fn().mockResolvedValue({ id: 92 }),
      },
      voucher: {
        findUnique: jest.fn().mockResolvedValue({
          type: VoucherType.RECOVERY,
          customerId: 8,
          vendorId: null,
        }),
      },
    });
    const prismaMock = {
      onlinePaymentLog: {
        findUnique: jest.fn().mockResolvedValue({
          id: 1,
          status: PaymentStatus.PENDING,
          amount: 1800,
          referenceNo: 'ONL-V-1',
          provider: 'BANK_TRANSFER',
          sourceType: 'VOUCHER',
          sourceId: 99,
          purchase: null,
          invoice: null,
        }),
        update: jest.fn(),
      },
      $transaction: jest.fn(async (fn) => fn(tx as any)),
    };

    const service = new PaymentsService(prismaMock as any);

    await service.updateOnlineStatus(1, { status: PaymentStatus.FAILED });

    expect(tx.customerLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customerId: 8,
          amount: 1800,
          type: 'DEBIT',
          referenceType: 'VOUCHER_PAYMENT_ADJUSTMENT',
        }),
      }),
    );
    expect(tx.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          settledAmount: 0,
          paymentStatus: 'OUTSTANDING',
        }),
      }),
    );
    expect(tx.onlinePaymentLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: PaymentStatus.FAILED,
        }),
      }),
    );
  });

  it('bounces a transferred purchase cheque against the owning vendor', async () => {
    const tx = createTransactionMock();
    const prismaMock = {
      chequeLog: {
        findUnique: jest.fn().mockResolvedValue({
          id: 1,
          status: ChequeStatus.PENDING,
          amount: 14884,
          chequeNo: '1212',
          sourceType: 'PURCHASE',
          sourceId: 55,
          purchase: {
            id: 55,
            vendorId: 7,
            purchaseAmount: 122200,
          },
          invoice: {
            id: 44,
            customerId: 8,
          },
        }),
        update: jest.fn(),
      },
      $transaction: jest.fn(async (fn) => fn(tx as any)),
    };

    const service = new PaymentsService(prismaMock as any);

    await service.updateChequeStatus(1, { status: ChequeStatus.BOUNCED });

    expect(tx.vendorLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          vendorId: 7,
          amount: 14884,
          type: 'CREDIT',
        }),
      }),
    );
    expect(tx.customerLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customerId: 8,
          amount: 14884,
          type: 'DEBIT',
          referenceType: 'PAYMENT_ADJUSTMENT_INVOICE',
        }),
      }),
    );
    expect(tx.purchaseEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paymentStatus: 'BOUNCED',
          settledAmount: 0,
        }),
      }),
    );
    expect(tx.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paymentStatus: 'BOUNCED',
          settledAmount: 0,
        }),
      }),
    );
  });

  it('moves a failed online purchase into vendor credit', async () => {
    const tx = createTransactionMock();
    const prismaMock = {
      onlinePaymentLog: {
        findUnique: jest.fn().mockResolvedValue({
          id: 1,
          status: PaymentStatus.PENDING,
          amount: 5126,
          referenceNo: 'ONL-1',
          provider: 'BANK_TRANSFER',
          sourceType: 'PURCHASE',
          sourceId: 77,
          purchase: {
            id: 77,
            vendorId: 7,
          },
          invoice: null,
        }),
        update: jest.fn(),
      },
      $transaction: jest.fn(async (fn) => fn(tx as any)),
    };

    const service = new PaymentsService(prismaMock as any);

    await service.updateOnlineStatus(1, { status: PaymentStatus.FAILED });

    expect(tx.vendorLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          vendorId: 7,
          amount: 5126,
          type: 'CREDIT',
        }),
      }),
    );
    expect(tx.purchaseEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paymentStatus: 'OUTSTANDING',
          settledAmount: 0,
        }),
      }),
    );
    expect(tx.chequeLog.update).not.toHaveBeenCalled();
    expect(tx.bankLedger.create).not.toHaveBeenCalled();
  });

  it('reopens invoice credit when an online payment fails', async () => {
    const tx = createTransactionMock({
      vendor: {
        findUnique: jest.fn().mockResolvedValue({ id: 7, currentBalance: 0 }),
        update: jest.fn().mockResolvedValue({ id: 7 }),
      },
      purchaseEntry: {
        update: jest.fn().mockResolvedValue({ id: 55 }),
      },
      customer: {
        findUnique: jest.fn().mockResolvedValue({ id: 8, currentBalance: 0 }),
        update: jest.fn().mockResolvedValue({ id: 8 }),
      },
      customerLedger: {
        create: jest.fn().mockResolvedValue({ id: 9 }),
      },
      invoice: {
        findUnique: jest.fn().mockResolvedValue({ id: 44, customerId: 8 }),
        update: jest.fn().mockResolvedValue({ id: 44 }),
      },
    }) as any;
    const prismaMock = {
      onlinePaymentLog: {
        findUnique: jest.fn().mockResolvedValue({
          id: 1,
          status: PaymentStatus.PENDING,
          amount: 5126,
          referenceNo: 'ONL-2',
          provider: 'BANK_TRANSFER',
          sourceType: 'INVOICE',
          sourceId: 44,
          purchase: null,
          invoice: {
            id: 44,
            customerId: 8,
          },
        }),
        update: jest.fn(),
      },
      $transaction: jest.fn(async (fn) => fn(tx)),
    };

    const service = new PaymentsService(prismaMock as any);

    await service.updateOnlineStatus(1, { status: PaymentStatus.FAILED });

    expect(tx.customerLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customerId: 8,
          amount: 5126,
          type: 'DEBIT',
          referenceType: 'PAYMENT_ADJUSTMENT_INVOICE',
        }),
      }),
    );
    expect(tx.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paymentStatus: 'OUTSTANDING',
          settledAmount: 0,
        }),
      }),
    );
    expect(tx.vendorLedger.create).not.toHaveBeenCalled();
  });

  it('rejects bounced online payment statuses', async () => {
    const prismaMock = {
      onlinePaymentLog: {
        findUnique: jest.fn().mockResolvedValue({
          id: 1,
          status: PaymentStatus.PENDING,
          amount: 5126,
          referenceNo: 'ONL-1',
          provider: 'BANK_TRANSFER',
          sourceType: 'PURCHASE',
          sourceId: 77,
          purchase: {
            id: 77,
            vendorId: 7,
          },
          invoice: null,
        }),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const service = new PaymentsService(prismaMock as any);

    await expect(
      service.updateOnlineStatus(1, { status: PaymentStatus.BOUNCED }),
    ).rejects.toThrow('Unsupported online status: BOUNCED');
  });
});
