import { CashBookType } from '@prisma/client';
import {
  postCashBook,
  postBankLedger,
  postEasypaisaLedger,
} from './ledger-posting';

describe('ledger-posting balance lookups', () => {
  it('uses the latest cash-book row by id', async () => {
    const tx = {
      cashBook: {
        findFirst: jest.fn().mockResolvedValue({ runningBalance: 1250 }),
        create: jest.fn().mockResolvedValue({ id: 1 }),
      },
    };

    await postCashBook(tx as any, {
      date: new Date('2026-06-02T00:00:00.000Z'),
      amount: 500,
      kind: CashBookType.RECEIPT,
      narration: 'Invoice INVOICE-00001',
    });

    expect(tx.cashBook.findFirst).toHaveBeenCalledWith({
      orderBy: { id: 'desc' },
      select: { runningBalance: true },
    });
    expect(tx.cashBook.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          runningBalance: 1750,
        }),
      }),
    );
  });

  it('uses id-based lookup for bank and easypaisa ledgers too', async () => {
    const tx = {
      bankLedger: {
        findFirst: jest.fn().mockResolvedValue({ runningBalance: 2500 }),
        create: jest.fn().mockResolvedValue({ id: 2 }),
      },
      easypaisaLedger: {
        findFirst: jest.fn().mockResolvedValue({ runningBalance: 3000 }),
        create: jest.fn().mockResolvedValue({ id: 3 }),
      },
    };

    await postBankLedger(tx as any, {
      bankName: 'Main Bank',
      date: new Date('2026-06-02T00:00:00.000Z'),
      amount: 500,
      type: 'CREDIT',
      narration: 'Bank transfer',
    });
    await postEasypaisaLedger(tx as any, {
      date: new Date('2026-06-02T00:00:00.000Z'),
      amount: 250,
      type: 'DEBIT',
      narration: 'Mobile wallet',
    });

    expect(tx.bankLedger.findFirst).toHaveBeenCalledWith({
      where: { bankName: 'Main Bank' },
      orderBy: { id: 'desc' },
      select: { runningBalance: true },
    });
    expect(tx.easypaisaLedger.findFirst).toHaveBeenCalledWith({
      orderBy: { id: 'desc' },
      select: { runningBalance: true },
    });
  });
});
