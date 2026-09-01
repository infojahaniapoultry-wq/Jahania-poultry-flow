import { Injectable } from '@nestjs/common';
import { ChequeStatus, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toNumber } from '../shared/ledger-posting';

export type PendingNotificationCategory =
  | 'CHEQUE'
  | 'CUSTOMER_UDHAAR'
  | 'VENDOR_UDHAAR'
  | 'DRIVER_EXPENSE'
  | 'ONLINE_PAYMENT';

export interface PendingNotificationItem {
  id: string;
  category: PendingNotificationCategory;
  title: string;
  description: string;
  amount: number;
  date: Date;
  href: string;
}

function item(
  id: string,
  category: PendingNotificationCategory,
  title: string,
  description: string,
  amount: unknown,
  date: Date,
  href: string,
): PendingNotificationItem {
  return { id, category, title, description, amount: toNumber(amount), date, href };
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The application header only needs totals for its bell badge.  Avoid
   * loading every open record and its related party on every route change;
   * the full list remains available on the Notifications page.
   */
  async getNotificationSummary() {
    const [cheques, customers, vendors, drivers, onlinePayments] =
      await Promise.all([
        this.prisma.chequeLog.aggregate({
          where: { status: ChequeStatus.PENDING },
          _count: { _all: true },
          _sum: { amount: true },
        }),
        this.prisma.customer.aggregate({
          where: { currentBalance: { gt: 0 }, isActive: true },
          _count: { _all: true },
          _sum: { currentBalance: true },
        }),
        this.prisma.vendor.aggregate({
          where: { currentBalance: { gt: 0 }, isActive: true },
          _count: { _all: true },
          _sum: { currentBalance: true },
        }),
        this.prisma.driver.aggregate({
          where: { advanceBalance: { gt: 0 }, isActive: true },
          _count: { _all: true },
          _sum: { advanceBalance: true },
        }),
        this.prisma.onlinePaymentLog.aggregate({
          where: { status: PaymentStatus.PENDING },
          _count: { _all: true },
          _sum: { amount: true },
        }),
      ]);

    const counts = {
      CHEQUE: cheques._count._all,
      CUSTOMER_UDHAAR: customers._count._all,
      VENDOR_UDHAAR: vendors._count._all,
      DRIVER_EXPENSE: drivers._count._all,
      ONLINE_PAYMENT: onlinePayments._count._all,
    };

    return {
      generatedAt: new Date(),
      totalCount: Object.values(counts).reduce((total, count) => total + count, 0),
      totalAmount:
        toNumber(cheques._sum.amount) +
        toNumber(customers._sum.currentBalance) +
        toNumber(vendors._sum.currentBalance) +
        toNumber(drivers._sum.advanceBalance) +
        toNumber(onlinePayments._sum.amount),
      counts,
      items: [],
    };
  }

  async getNotifications() {
    const [cheques, customers, vendors, drivers, onlinePayments] =
      await Promise.all([
        this.prisma.chequeLog.findMany({
          where: { status: ChequeStatus.PENDING },
          include: {
            invoice: { include: { customer: { select: { shopName: true } } } },
            purchase: { include: { vendor: { select: { name: true } } } },
          },
          orderBy: { chequeDate: 'asc' },
        }),
        this.prisma.customer.findMany({
          where: { currentBalance: { gt: 0 }, isActive: true },
          select: { id: true, shopName: true, currentBalance: true, updatedAt: true },
          orderBy: { currentBalance: 'desc' },
        }),
        this.prisma.vendor.findMany({
          where: { currentBalance: { gt: 0 }, isActive: true },
          select: { id: true, name: true, currentBalance: true, updatedAt: true },
          orderBy: { currentBalance: 'desc' },
        }),
        this.prisma.driver.findMany({
          where: { advanceBalance: { gt: 0 }, isActive: true },
          select: { id: true, name: true, advanceBalance: true, updatedAt: true },
          orderBy: { advanceBalance: 'desc' },
        }),
        this.prisma.onlinePaymentLog.findMany({
          where: { status: PaymentStatus.PENDING },
          include: {
            invoice: { include: { customer: { select: { shopName: true } } } },
            purchase: { include: { vendor: { select: { name: true } } } },
          },
          orderBy: { createdAt: 'asc' },
        }),
      ]);

    const items: PendingNotificationItem[] = [
      ...cheques.map((cheque) => {
        const owner = cheque.invoice?.customer.shopName
          ?? cheque.purchase?.vendor.name
          ?? cheque.receivedFrom
          ?? 'Unassigned party';
        return item(
          `cheque:${cheque.id}`,
          'CHEQUE',
          `Cheque ${cheque.chequeNo} needs clearance`,
          `${owner} · ${cheque.bankName || 'Bank not specified'}`,
          cheque.amount,
          cheque.chequeDate,
          '/finance/cheques',
        );
      }),
      ...customers.map((customer) => item(
        `customer:${customer.id}`,
        'CUSTOMER_UDHAAR',
        `${customer.shopName} has pending udhaar`,
        'Customer receivable is still open',
        customer.currentBalance,
        customer.updatedAt,
        '/finance/credit',
      )),
      ...vendors.map((vendor) => item(
        `vendor:${vendor.id}`,
        'VENDOR_UDHAAR',
        `${vendor.name} has pending udhaar`,
        'Vendor payable is still open',
        vendor.currentBalance,
        vendor.updatedAt,
        '/finance/credit',
      )),
      ...drivers.map((driver) => item(
        `driver:${driver.id}`,
        'DRIVER_EXPENSE',
        `${driver.name} has an unpaid driver expense`,
        'Driver balance is waiting for settlement',
        driver.advanceBalance,
        driver.updatedAt,
        '/drivers',
      )),
      ...onlinePayments.map((payment) => {
        const owner = payment.invoice?.customer.shopName
          ?? payment.purchase?.vendor.name
          ?? payment.receivedFrom
          ?? 'Unassigned party';
        return item(
          `online:${payment.id}`,
          'ONLINE_PAYMENT',
          `Online payment from ${owner} needs review`,
          payment.referenceNo ? `Reference ${payment.referenceNo}` : 'Payment record has not been completed',
          payment.amount,
          payment.createdAt,
          '/finance/online',
        );
      }),
    ];

    const counts = items.reduce<Record<PendingNotificationCategory, number>>(
      (result, current) => {
        result[current.category] += 1;
        return result;
      },
      {
        CHEQUE: 0,
        CUSTOMER_UDHAAR: 0,
        VENDOR_UDHAAR: 0,
        DRIVER_EXPENSE: 0,
        ONLINE_PAYMENT: 0,
      },
    );

    return {
      generatedAt: new Date(),
      totalCount: items.length,
      totalAmount: items.reduce((sum, current) => sum + current.amount, 0),
      counts,
      items,
    };
  }
}
