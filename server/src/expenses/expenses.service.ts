import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExpenseAccountDto, CreateExpenseEntryDto } from './expenses.dto';
import {
  CashBookType,
  LedgerEntryType,
  OnlineProvider,
  PaymentMode,
} from '@prisma/client';
import {
  normalizeDate,
  postBankLedger,
  postCashBook,
  postEasypaisaLedger,
  toNumber,
} from '../shared/ledger-posting';

@Injectable()
export class ExpensesService {
  constructor(private prisma: PrismaService) {}

  async createAccount(dto: CreateExpenseAccountDto) {
    return this.prisma.expenseAccount.create({ data: dto });
  }

  async findAllAccounts() {
    return this.prisma.expenseAccount.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      include: { _count: { select: { entries: true } } },
    });
  }

  async createEntry(dto: CreateExpenseEntryDto) {
    const account = await this.prisma.expenseAccount.findUnique({
      where: { id: dto.expenseAccountId },
    });
    if (!account) {
      throw new NotFoundException(
        `Expense account #${dto.expenseAccountId} not found`,
      );
    }

    const expDate = normalizeDate(dto.date);
    const amount = toNumber(dto.amount);
    const payMode = dto.paymentMode ?? PaymentMode.CASH;
    const paymentProvider = dto.paymentProvider;
    const paymentReference = dto.paymentReference ?? dto.voucherRef;

    return this.prisma.$transaction(async (tx) => {
      const entry = await tx.expenseEntry.create({
        data: {
          date: expDate,
          expenseAccountId: dto.expenseAccountId,
          amount,
          paymentMode: payMode,
          narration: dto.narration,
          voucherRef: dto.voucherRef ?? paymentReference,
        },
        include: { expenseAccount: true },
      });

      if (payMode === PaymentMode.CASH) {
        await postCashBook(tx, {
          date: expDate,
          kind: CashBookType.PAYMENT,
          amount,
          narration: `Expense: ${account.name}`,
          voucherRef: dto.voucherRef,
          referenceId: entry.id,
          referenceType: 'EXPENSE',
        });
      } else if (payMode === PaymentMode.CHEQUE) {
        await postBankLedger(tx, {
          bankName: 'Main Bank',
          date: expDate,
          type: LedgerEntryType.DEBIT,
          amount,
          narration: `Expense: ${account.name}`,
          refNo: paymentReference,
        });
      } else if (payMode === PaymentMode.ONLINE) {
        if (paymentProvider === OnlineProvider.EASYPAISA) {
          await postEasypaisaLedger(tx, {
            date: expDate,
            type: LedgerEntryType.DEBIT,
            amount,
            narration: `Expense: ${account.name}`,
            mobileNo: paymentReference ?? 'EASYPAISA-ACCOUNT',
          });
        } else {
          await postBankLedger(tx, {
            bankName:
              paymentProvider === OnlineProvider.JAZZCASH
                ? 'JazzCash'
                : paymentProvider === OnlineProvider.OTHER
                  ? 'Online Wallet'
                  : 'Main Bank',
            date: expDate,
            type: LedgerEntryType.DEBIT,
            amount,
            narration: `Expense: ${account.name}`,
            refNo: paymentReference,
          });
        }
      }

      return entry;
    });
  }

  async findAllEntries(
    startDate?: string,
    endDate?: string,
    accountId?: number,
  ) {
    const where: any = {};
    if (accountId) where.expenseAccountId = accountId;
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }
    return this.prisma.expenseEntry.findMany({
      where,
      include: { expenseAccount: true },
      orderBy: { date: 'desc' },
    });
  }

  async getSummary(startDate?: string, endDate?: string) {
    const where: any = {};
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }

    const entries = await this.prisma.expenseEntry.findMany({
      where,
      include: { expenseAccount: true },
    });

    const summary: Record<string, { category: string; total: number }> = {};
    for (const e of entries) {
      const key = e.expenseAccount.name;
      if (!summary[key]) {
        summary[key] = {
          category: e.expenseAccount.category ?? 'General',
          total: 0,
        };
      }
      summary[key].total += Number(e.amount);
    }
    return summary;
  }
}
