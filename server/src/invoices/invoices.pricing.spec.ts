import { Role } from '@prisma/client';
import { InvoicesService } from './invoices.service';

function makeTransaction(customer: Record<string, unknown>) {
  const tx = {
    invoice: {
      create: jest.fn().mockResolvedValue({ id: 10 }),
      update: jest.fn().mockResolvedValue({ id: 10 }),
    },
    customer: {
      findUnique: jest.fn().mockResolvedValue(customer),
      update: jest.fn().mockResolvedValue({ id: 8 }),
    },
    driver: {
      findUnique: jest.fn().mockResolvedValue({
        id: 4,
        name: 'Driver One',
        defaultCharge: 0,
        advanceBalance: 0,
      }),
      update: jest.fn(),
    },
    purchaseEntry: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { weightKg: 1000 } }),
    },
    invoiceItem: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { netWeight: 0 } }),
    },
    customerLedger: { create: jest.fn().mockResolvedValue({}) },
    driverLedger: { create: jest.fn() },
    cashBook: { findFirst: jest.fn(), create: jest.fn() },
    chequeLog: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() },
    onlinePaymentLog: { create: jest.fn(), delete: jest.fn() },
  };
  return {
    ...tx,
    $transaction: jest.fn(async (callback) => callback(tx)),
  };
}

const configuredCustomer = {
  id: 8,
  shopName: 'Customer One',
  currentBalance: 0,
  pricingBaseRateType: 'FARM',
  pricingOffsetDirection: 'MINUS',
  pricingOffsetValue: 6,
};

describe('InvoicesService rule-based pricing', () => {
  it('calculates and persists the customer rate on every invoice item', async () => {
    const tx = makeTransaction(configuredCustomer);
    const marketRates = {
      getEffective: jest.fn().mockResolvedValue({ farmRate: 320, finalRate: 322 }),
    };
    const service = new InvoicesService(tx as any, marketRates as any);

    await service.create({
      customerId: 8,
      driverId: 4,
      paymentMode: 'UDHAR',
      items: [
        { quantityKg: 100 },
        { quantityKg: 50 },
      ],
    }, Role.DATA_ENTRY);

    expect(marketRates.getEffective).toHaveBeenCalled();
    expect(tx.invoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totalAmount: 47100,
          items: {
            create: [
              expect.objectContaining({ netWeight: 100, ratePerKg: 314, amount: 31400 }),
              expect.objectContaining({ netWeight: 50, ratePerKg: 314, amount: 15700 }),
            ],
          },
        }),
      }),
    );
  });

  it('allows only an administrator to override item rates', async () => {
    const tx = makeTransaction(configuredCustomer);
    const marketRates = {
      getEffective: jest.fn().mockResolvedValue({ farmRate: 320, finalRate: 322 }),
    };
    const service = new InvoicesService(tx as any, marketRates as any);

    await service.create({
      customerId: 8,
      driverId: 4,
      paymentMode: 'UDHAR',
      manualRateOverride: true,
      items: [{ quantityKg: 100, ratePerKg: 300 }],
    }, Role.ADMIN);

    expect(tx.invoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totalAmount: 30000,
          items: { create: [expect.objectContaining({ ratePerKg: 300 })] },
        }),
      }),
    );

    const entryTx = makeTransaction(configuredCustomer);
    const entryService = new InvoicesService(entryTx as any, marketRates as any);
    await expect(entryService.create({
      customerId: 8,
      driverId: 4,
      paymentMode: 'UDHAR',
      manualRateOverride: true,
      items: [{ quantityKg: 100, ratePerKg: 300 }],
    }, Role.DATA_ENTRY)).rejects.toThrow(
      'Only administrators can override calculated invoice rates',
    );
  });

  it('rejects invoices when the customer rule is not configured', async () => {
    const tx = makeTransaction({ id: 8, shopName: 'Unconfigured', currentBalance: 0 });
    const service = new InvoicesService(tx as any, {
      getEffective: jest.fn(),
    } as any);

    await expect(service.create({
      customerId: 8,
      driverId: 4,
      paymentMode: 'UDHAR',
      items: [{ quantityKg: 100 }],
    }, Role.DATA_ENTRY)).rejects.toThrow('Customer pricing rule is not configured');
  });

  it('allows an administrator rate override when a customer has no pricing rule', async () => {
    const tx = makeTransaction({
      id: 8,
      shopName: 'Unconfigured',
      currentBalance: 0,
      pricingBaseRateType: null,
      pricingOffsetDirection: null,
      pricingOffsetValue: null,
    });
    const marketRates = { getEffective: jest.fn() };
    const service = new InvoicesService(tx as any, marketRates as any);

    await service.create({
      customerId: 8,
      driverId: 4,
      paymentMode: 'UDHAR',
      manualRateOverride: true,
      items: [{ quantityKg: 10, ratePerKg: 300 }],
    }, Role.ADMIN);

    expect(marketRates.getEffective).not.toHaveBeenCalled();
    expect(tx.invoice.create).toHaveBeenCalled();
  });

  it('rejects zero or negative invoice weight before posting accounts', async () => {
    const tx = makeTransaction(configuredCustomer);
    const service = new InvoicesService(tx as any, {
      getEffective: jest.fn().mockResolvedValue({ farmRate: 320, finalRate: 322 }),
    } as any);

    await expect(service.create({
      customerId: 8,
      driverId: 4,
      paymentMode: 'UDHAR',
      items: [{ quantityKg: 0 }],
    }, Role.DATA_ENTRY)).rejects.toThrow('A valid invoice weight and rate are required');
    expect(tx.invoice.create).not.toHaveBeenCalled();
  });

  it('propagates the missing effective market-rate error', async () => {
    const tx = makeTransaction(configuredCustomer);
    const service = new InvoicesService(tx as any, {
      getEffective: jest.fn().mockRejectedValue(
        new Error('No market rates are available for this invoice date'),
      ),
    } as any);

    await expect(service.create({
      customerId: 8,
      driverId: 4,
      paymentMode: 'UDHAR',
      items: [{ quantityKg: 100 }],
    }, Role.DATA_ENTRY)).rejects.toThrow(
      'No market rates are available for this invoice date',
    );
  });
});
