import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInvoiceDto, UpdateInvoiceDto } from './invoices.dto';
import {
  CashBookType,
  ChequeStatus,
  LedgerEntryType,
  OnlineProvider,
  PaymentMode,
  PaymentStatus,
  Role,
} from '@prisma/client';
import {
  dayRange,
  normalizeDate,
  postBankLedger,
  postCashBook,
  postEasypaisaLedger,
  postDriverLedger,
  postCustomerLedger,
  toNumber,
} from '../shared/ledger-posting';
import { formatDocumentNo } from '../shared/document-number';
import { getCurrentStockSummary } from '../shared/stock-summary';
import { MarketRatesService } from '../market-rates/market-rates.service';
import { calculateCustomerRate } from '../shared/pricing';

async function rebuildCustomerBalance(tx: any, customerId: number) {
  const customer = await tx.customer.findUnique({
    where: { id: customerId },
    select: { openingBalance: true },
  });
  let runningBalance = toNumber(customer?.openingBalance);
  const rows = await tx.customerLedger.findMany({
    where: { customerId },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
  });

  for (const row of rows) {
    const amount = toNumber(row.amount);
    runningBalance =
      row.type === LedgerEntryType.DEBIT
        ? runningBalance + amount
        : runningBalance - amount;
    await tx.customerLedger.update({
      where: { id: row.id },
      data: { runningBalance },
    });
  }

  await tx.customer.update({
    where: { id: customerId },
    data: { currentBalance: runningBalance },
  });
}

async function rebuildDriverBalance(
  tx: any,
  driverId: number,
  removedDebitAmount = 0,
) {
  const driver = await tx.driver.findUnique({
    where: { id: driverId },
    select: { advanceBalance: true },
  });
  const rows = await tx.driverLedger.findMany({
    where: { driverId },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
  });
  const ledgerImpact = rows.reduce((total: number, row: any) => {
    const amount = toNumber(row.amount);
    return total + (row.type === LedgerEntryType.DEBIT ? amount : -amount);
  }, 0);
  let runningBalance =
    toNumber(driver?.advanceBalance) - removedDebitAmount - ledgerImpact;

  for (const row of rows) {
    const amount = toNumber(row.amount);
    runningBalance =
      row.type === LedgerEntryType.DEBIT
        ? runningBalance + amount
        : runningBalance - amount;
    await tx.driverLedger.update({
      where: { id: row.id },
      data: { runningBalance },
    });
  }

  await tx.driver.update({
    where: { id: driverId },
    data: { advanceBalance: runningBalance },
  });
}

async function rebuildCashBook(tx: any) {
  const rows = await tx.cashBook.findMany({
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
  });
  let runningBalance = 0;

  for (const row of rows) {
    const amount = toNumber(row.amount);
    runningBalance =
      row.type === CashBookType.RECEIPT
        ? runningBalance + amount
        : runningBalance - amount;
    await tx.cashBook.update({
      where: { id: row.id },
      data: { runningBalance },
    });
  }
}

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);
  private readonly transactionOptions = {
    maxWait: 5_000,
    timeout: 15_000,
  };

  constructor(
    private prisma: PrismaService,
    @Optional() private marketRatesService?: MarketRatesService,
  ) {}

  private generateInvoiceNo(id: number): string {
    return formatDocumentNo('INVOICE', id);
  }

  async create(dto: CreateInvoiceDto, actorRole?: Role) {
    const startedAt = Date.now();
    this.logger.log(
      `invoice.create start driver=${dto.driverId} customer=${dto.customerId} mode=${dto.paymentMode ?? PaymentMode.CASH}`,
    );

    try {
      return await this.prisma.$transaction(async (tx) => {
        const paymentMode = dto.paymentMode ?? PaymentMode.CASH;
        const paymentProvider = dto.paymentProvider;

        const driver = await tx.driver.findUnique({
          where: { id: dto.driverId },
          select: {
            id: true,
            name: true,
            defaultCharge: true,
            advanceBalance: true,
          },
        });
        if (!driver) {
          throw new NotFoundException(`Driver #${dto.driverId} not found`);
        }
        this.logger.log(
          `invoice.create driver loaded driver=${driver.id} name=${driver.name} balance=${toNumber(driver.advanceBalance)}`,
        );

        const customer = await tx.customer.findUnique({
          where: { id: dto.customerId },
          select: {
            id: true,
            shopName: true,
            currentBalance: true,
            pricingBaseRateType: true,
            pricingOffsetDirection: true,
            pricingOffsetValue: true,
          },
        });
        if (!customer) {
          throw new NotFoundException(`Customer #${dto.customerId} not found`);
        }
        this.logger.log(
          `invoice.create customer loaded customer=${customer.id} name=${customer.shopName} balance=${toNumber(customer.currentBalance)}`,
        );

        const previousBalance = toNumber(customer.currentBalance);
        const invoiceDate = normalizeDate(dto.date);
        const manualRateOverride = dto.manualRateOverride === true;
        if (manualRateOverride && actorRole !== Role.ADMIN) {
          throw new BadRequestException(
            'Only administrators can override calculated invoice rates',
          );
        }

        let calculatedRate: number | null = null;
        if (this.marketRatesService) {
          if (
            !customer.pricingBaseRateType ||
            !customer.pricingOffsetDirection ||
            customer.pricingOffsetValue === null ||
            customer.pricingOffsetValue === undefined
          ) {
            throw new BadRequestException(
              'Customer pricing rule is not configured',
            );
          }

          const marketRates = await this.marketRatesService.getEffective(
            invoiceDate,
          );
          calculatedRate = calculateCustomerRate(
            {
              baseRateType: customer.pricingBaseRateType,
              offsetDirection: customer.pricingOffsetDirection,
              offsetValue: customer.pricingOffsetValue,
            },
            marketRates,
          );
        }
        const effectiveDriverCharge = toNumber(
          dto.driverCharge ?? driver.defaultCharge,
        );

        const itemsData = dto.items.map((item) => {
          const fw = toNumber(item.firstWeight ?? item.quantityKg ?? 0);
          const sw = toNumber(item.secondWeight ?? 0);
          // If quantityKg is provided it means a simple "net only" entry
          const netWeight =
            item.quantityKg !== undefined ? toNumber(item.quantityKg) : fw - sw;
          const ratePerKg = manualRateOverride
            ? toNumber(item.ratePerKg)
            : calculatedRate ?? toNumber(item.ratePerKg);
          if (ratePerKg <= 0) {
            throw new BadRequestException(
              'A valid invoice rate is required for every item',
            );
          }
          const amount = netWeight * ratePerKg;
          return {
            description: item.description ?? null,
            firstWeight: fw,
            secondWeight: sw,
            netWeight,
            ratePerKg,
            amount,
          };
        });

        const totalAmount = itemsData.reduce(
          (sum, item) => sum + item.amount,
          0,
        );
        const totalBalance = totalAmount + previousBalance;
        const settledAmount =
          dto.settledAmount !== undefined
            ? toNumber(dto.settledAmount)
            : paymentMode === PaymentMode.UDHAR
              ? 0
              : totalAmount;
        if (settledAmount < 0) {
          throw new BadRequestException('Paid amount cannot be negative');
        }
        if (settledAmount > totalAmount) {
          throw new BadRequestException(
            'Paid amount cannot exceed invoice total',
          );
        }
        if (paymentMode !== PaymentMode.UDHAR && settledAmount <= 0) {
          throw new BadRequestException(
            'Paid amount is required for cash, cheque, and online invoices',
          );
        }
        if (paymentMode === PaymentMode.UDHAR && settledAmount !== 0) {
          throw new BadRequestException(
            'Udhar invoices cannot include a paid amount',
          );
        }

        const requestedWeight = itemsData.reduce(
          (sum, item) => sum + item.netWeight,
          0,
        );
        const stock = await getCurrentStockSummary(tx);
        this.logger.log(
          `invoice.create stock checked requested=${requestedWeight.toFixed(3)} available=${stock.availableWeight.toFixed(3)}`,
        );
        if (requestedWeight > stock.availableWeight) {
          throw new BadRequestException(
            `Insufficient stock. Available ${stock.availableWeight.toFixed(3)} kg, requested ${requestedWeight.toFixed(3)} kg.`,
          );
        }

        const balanceDelta = totalAmount - settledAmount;
        const paymentStatus =
          paymentMode === PaymentMode.CASH
            ? balanceDelta > 0
              ? PaymentStatus.OUTSTANDING
              : PaymentStatus.COMPLETED
            : paymentMode === PaymentMode.UDHAR
              ? PaymentStatus.OUTSTANDING
              : PaymentStatus.PENDING;

        const invoice = await tx.invoice.create({
          data: {
            invoiceNo: 'TEMP',
            date: invoiceDate,
            customerId: dto.customerId,
            driverId: dto.driverId,
            driverCharge: effectiveDriverCharge,
            previousBalance,
            totalAmount,
            totalBalance,
            settledAmount,
            paymentMode,
            paymentStatus,
            paymentReference: dto.paymentReference,
            paymentProvider,
            notes: dto.notes,
            items: {
              create: itemsData,
            },
          },
          include: { items: true, customer: true, driver: true },
        });
        this.logger.log(
          `invoice.create invoice row created invoiceId=${invoice.id}`,
        );

        const invoiceNo = this.generateInvoiceNo(invoice.id);
        await tx.invoice.update({
          where: { id: invoice.id },
          data: { invoiceNo },
        });

        if (totalAmount > 0) {
          this.logger.log(
            `invoice.create customer ledger invoiceId=${invoice.id} amount=${totalAmount}`,
          );
          await postCustomerLedger(tx, {
            customerId: dto.customerId,
            date: invoiceDate,
            type: LedgerEntryType.DEBIT,
            amount: totalAmount,
            narration: `Invoice ${invoiceNo}`,
            referenceId: invoice.id,
            referenceType: 'INVOICE',
            currentBalance: previousBalance,
          });

          if (settledAmount > 0) {
            await postCustomerLedger(tx, {
              customerId: dto.customerId,
              date: invoiceDate,
              type: LedgerEntryType.CREDIT,
              amount: settledAmount,
              narration: `Payment for invoice ${invoiceNo}`,
              referenceId: invoice.id,
              referenceType: 'INVOICE_PAYMENT',
              currentBalance: previousBalance + totalAmount,
            });
          }

          this.logger.log(
            `invoice.create customer ledger complete invoiceId=${invoice.id}`,
          );
        }

        if (dto.driverId && effectiveDriverCharge > 0) {
          this.logger.log(
            `invoice.create driver ledger invoiceId=${invoice.id} charge=${effectiveDriverCharge}`,
          );
          await postDriverLedger(tx, {
            driverId: dto.driverId,
            date: invoiceDate,
            type: LedgerEntryType.DEBIT,
            amount: effectiveDriverCharge,
            narration: dto.notes ?? `Invoice driver charge`,
            referenceId: invoice.id,
            referenceType: 'INVOICE_DRIVER_CHARGE',
            currentBalance: toNumber(driver.advanceBalance),
          });
          this.logger.log(
            `invoice.create driver ledger complete invoiceId=${invoice.id}`,
          );
        }

        if (paymentMode === PaymentMode.CASH && settledAmount > 0) {
          this.logger.log(
            `invoice.create cashbook invoiceId=${invoice.id} amount=${settledAmount}`,
          );
          await postCashBook(tx, {
            date: invoiceDate,
            kind: CashBookType.RECEIPT,
            amount: settledAmount,
            narration: `Invoice ${invoiceNo}`,
            voucherRef: invoiceNo,
            referenceId: invoice.id,
            referenceType: 'INVOICE',
          });
        } else if (paymentMode === PaymentMode.CHEQUE) {
          this.logger.log(`invoice.create cheque log invoiceId=${invoice.id}`);
          if (!dto.chequeNo || !dto.bankName || !dto.chequeDate) {
            throw new BadRequestException(
              'Cheque number, bank name, and cheque date are required for invoice cheque payments',
            );
          }
          const cheque = await tx.chequeLog.create({
            data: {
              chequeNo: dto.chequeNo,
              bankName: dto.bankName,
              chequeDate: new Date(dto.chequeDate),
              amount: settledAmount,
              receivedFrom: customer.shopName,
              sourceType: 'INVOICE',
              sourceId: invoice.id,
              paymentMode: PaymentMode.CHEQUE,
              status: ChequeStatus.PENDING,
              notes: dto.notes,
            },
          });

          await tx.invoice.update({
            where: { id: invoice.id },
            data: {
              chequeLogId: cheque.id,
              paymentReference: dto.chequeNo,
            },
          });
        } else if (paymentMode === PaymentMode.ONLINE) {
          this.logger.log(
            `invoice.create online payment log invoiceId=${invoice.id} provider=${paymentProvider}`,
          );
          if (!paymentProvider || !dto.paymentReference) {
            throw new BadRequestException(
              'Online provider and payment reference are required for invoice online payments',
            );
          }
          const online = await tx.onlinePaymentLog.create({
            data: {
              provider: paymentProvider,
              referenceNo: dto.paymentReference,
              amount: settledAmount,
              status: PaymentStatus.PENDING,
              receivedFrom: customer.shopName,
              sourceType: 'INVOICE',
              sourceId: invoice.id,
              notes: dto.notes,
            },
          });

          await tx.invoice.update({
            where: { id: invoice.id },
            data: {
              onlinePaymentLogId: online.id,
              paymentReference: dto.paymentReference,
              paymentProvider,
            },
          });
        }

        return {
          ...invoice,
          invoiceNo,
        };
      }, this.transactionOptions);
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `invoice.create failed after ${Date.now() - startedAt}ms driver=${dto.driverId} customer=${dto.customerId} mode=${dto.paymentMode ?? PaymentMode.CASH}: ${err.message}`,
        err.stack,
      );
      throw error;
    }
  }

  async findAll(date?: string, customerId?: number) {
    const where: any = {};
    where.isVoided = false;
    if (date) {
      const range = dayRange(date);
      where.date = { gte: range.start, lte: range.end };
    }
    if (customerId) where.customerId = customerId;

    return this.prisma.invoice.findMany({
      where,
      include: {
        customer: { select: { id: true, shopName: true } },
        driver: { select: { id: true, name: true } },
        chequeLog: true,
        onlinePaymentLog: true,
        items: true,
      },
      orderBy: { date: 'desc' },
    });
  }

  async findOne(id: number) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        customer: true,
        driver: true,
        chequeLog: true,
        onlinePaymentLog: true,
        items: true,
      },
    });
    if (!invoice) throw new NotFoundException(`Invoice #${id} not found`);
    return invoice;
  }

  async update(id: number, dto: UpdateInvoiceDto, actorRole?: Role) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.invoice.findUnique({
        where: { id },
        include: {
          items: true,
          chequeLog: { include: { purchase: true } },
          onlinePaymentLog: true,
        },
      });
      if (!existing) throw new NotFoundException(`Invoice #${id} not found`);
      if (existing.isVoided) {
        throw new BadRequestException('Voided invoices cannot be edited');
      }
      if (
        existing.chequeLog &&
        (existing.chequeLog.status !== ChequeStatus.PENDING ||
          existing.chequeLog.purchase)
      ) {
        throw new BadRequestException(
          'This invoice cheque is already processed or transferred and cannot be edited',
        );
      }
      if (
        existing.onlinePaymentLog &&
        existing.onlinePaymentLog.status !== PaymentStatus.PENDING
      ) {
        throw new BadRequestException(
          'This invoice online payment is already processed and cannot be edited',
        );
      }

      const adjustmentCount = await tx.customerLedger.count({
        where: {
          referenceId: id,
          referenceType: 'PAYMENT_ADJUSTMENT_INVOICE',
        },
      });
      if (adjustmentCount > 0) {
        throw new BadRequestException(
          'Invoices with payment adjustments cannot be edited; void and recreate it instead',
        );
      }

      const paymentMode = dto.paymentMode ?? existing.paymentMode;
      const paymentProvider = dto.paymentProvider;
      if (
        paymentMode === PaymentMode.CHEQUE &&
        (!dto.chequeNo || !dto.bankName || !dto.chequeDate)
      ) {
        throw new BadRequestException(
          'Cheque number, bank name, and cheque date are required for invoice cheque payments',
        );
      }
      if (
        paymentMode === PaymentMode.ONLINE &&
        (!paymentProvider || !dto.paymentReference)
      ) {
        throw new BadRequestException(
          'Online provider and payment reference are required for invoice online payments',
        );
      }

      const [driver, customer] = await Promise.all([
        tx.driver.findUnique({
          where: { id: dto.driverId },
          select: {
            id: true,
            name: true,
            defaultCharge: true,
            advanceBalance: true,
          },
        }),
        tx.customer.findUnique({
          where: { id: dto.customerId },
          select: {
            id: true,
            shopName: true,
            currentBalance: true,
            pricingBaseRateType: true,
            pricingOffsetDirection: true,
            pricingOffsetValue: true,
          },
        }),
      ]);
      if (!driver) throw new NotFoundException(`Driver #${dto.driverId} not found`);
      if (!customer) throw new NotFoundException(`Customer #${dto.customerId} not found`);

      const invoiceDate = normalizeDate(dto.date);
      const manualRateOverride = dto.manualRateOverride === true;
      if (manualRateOverride && actorRole !== Role.ADMIN) {
        throw new BadRequestException(
          'Only administrators can override calculated invoice rates',
        );
      }

      let calculatedRate: number | null = null;
      if (this.marketRatesService && !manualRateOverride) {
        if (
          !customer.pricingBaseRateType ||
          !customer.pricingOffsetDirection ||
          customer.pricingOffsetValue === null ||
          customer.pricingOffsetValue === undefined
        ) {
          throw new BadRequestException('Customer pricing rule is not configured');
        }
        const marketRates = await this.marketRatesService.getEffective(invoiceDate);
        calculatedRate = calculateCustomerRate(
          {
            baseRateType: customer.pricingBaseRateType,
            offsetDirection: customer.pricingOffsetDirection,
            offsetValue: customer.pricingOffsetValue,
          },
          marketRates,
        );
      }

      const itemsData = dto.items.map((item) => {
        const firstWeight = toNumber(item.firstWeight ?? item.quantityKg ?? 0);
        const secondWeight = toNumber(item.secondWeight ?? 0);
        const netWeight =
          item.quantityKg !== undefined
            ? toNumber(item.quantityKg)
            : firstWeight - secondWeight;
        const ratePerKg = manualRateOverride
          ? toNumber(item.ratePerKg)
          : calculatedRate ?? toNumber(item.ratePerKg);
        if (netWeight <= 0 || ratePerKg <= 0) {
          throw new BadRequestException(
            'A valid weight and invoice rate are required for every item',
          );
        }
        return {
          description: item.description ?? null,
          firstWeight,
          secondWeight,
          netWeight,
          ratePerKg,
          amount: netWeight * ratePerKg,
        };
      });
      const totalAmount = itemsData.reduce((sum, item) => sum + item.amount, 0);
      const settledAmount =
        dto.settledAmount !== undefined
          ? toNumber(dto.settledAmount)
          : paymentMode === PaymentMode.UDHAR
            ? 0
            : totalAmount;
      if (settledAmount < 0 || settledAmount > totalAmount) {
        throw new BadRequestException(
          'Paid amount must be between zero and the invoice total',
        );
      }
      if (paymentMode !== PaymentMode.UDHAR && settledAmount <= 0) {
        throw new BadRequestException(
          'Paid amount is required for cash, cheque, and online invoices',
        );
      }
      if (paymentMode === PaymentMode.UDHAR && settledAmount !== 0) {
        throw new BadRequestException('Udhar invoices cannot include a paid amount');
      }

      const oldWeight = existing.items.reduce(
        (sum, item) => sum + toNumber(item.netWeight),
        0,
      );
      const stock = await getCurrentStockSummary(tx);
      const newWeight = itemsData.reduce((sum, item) => sum + item.netWeight, 0);
      if (newWeight > stock.availableWeight + oldWeight) {
        throw new BadRequestException(
          `Insufficient stock. Available ${(stock.availableWeight + oldWeight).toFixed(3)} kg for this invoice update.`,
        );
      }

      const oldCustomerId = existing.customerId;
      const oldDriverId = existing.driverId;
      await tx.customerLedger.deleteMany({
        where: {
          referenceId: id,
          referenceType: { in: ['INVOICE', 'INVOICE_PAYMENT'] },
        },
      });
      await tx.driverLedger.deleteMany({
        where: { referenceId: id, referenceType: 'INVOICE_DRIVER_CHARGE' },
      });
      await tx.cashBook.deleteMany({
        where: { referenceId: id, referenceType: 'INVOICE' },
      });
      await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });

      await tx.invoice.update({
        where: { id },
        data: { chequeLogId: null, onlinePaymentLogId: null },
      });
      if (existing.chequeLogId) {
        await tx.chequeLog.delete({ where: { id: existing.chequeLogId } });
      }
      if (existing.onlinePaymentLogId) {
        await tx.onlinePaymentLog.delete({ where: { id: existing.onlinePaymentLogId } });
      }

      await rebuildCustomerBalance(tx, oldCustomerId);
      if (oldDriverId) {
        await rebuildDriverBalance(
          tx,
          oldDriverId,
          toNumber(existing.driverCharge),
        );
      }
      await rebuildCashBook(tx);

      const refreshedCustomer = await tx.customer.findUnique({
        where: { id: dto.customerId },
        select: { currentBalance: true },
      });
      const refreshedDriver = await tx.driver.findUnique({
        where: { id: dto.driverId },
        select: { advanceBalance: true },
      });
      const previousBalance = toNumber(refreshedCustomer?.currentBalance);
      const totalBalance = totalAmount + previousBalance;
      const balanceDelta = totalAmount - settledAmount;
      const paymentStatus =
        paymentMode === PaymentMode.CASH
          ? balanceDelta > 0
            ? PaymentStatus.OUTSTANDING
            : PaymentStatus.COMPLETED
          : paymentMode === PaymentMode.UDHAR
            ? PaymentStatus.OUTSTANDING
            : PaymentStatus.PENDING;
      const effectiveDriverCharge = toNumber(
        dto.driverCharge ?? driver.defaultCharge,
      );

      await tx.invoice.update({
        where: { id },
        data: {
          date: invoiceDate,
          customerId: dto.customerId,
          driverId: dto.driverId,
          driverCharge: effectiveDriverCharge,
          previousBalance,
          totalAmount,
          totalBalance,
          settledAmount,
          paymentMode,
          paymentStatus,
          paymentReference: dto.paymentReference ?? null,
          paymentProvider: paymentMode === PaymentMode.ONLINE ? paymentProvider : null,
          notes: dto.notes ?? null,
          items: { create: itemsData },
        },
      });

      if (totalAmount > 0) {
        await postCustomerLedger(tx, {
          customerId: dto.customerId,
          date: invoiceDate,
          type: LedgerEntryType.DEBIT,
          amount: totalAmount,
          narration: `Invoice ${existing.invoiceNo}`,
          referenceId: id,
          referenceType: 'INVOICE',
          currentBalance: previousBalance,
        });
        if (settledAmount > 0) {
          await postCustomerLedger(tx, {
            customerId: dto.customerId,
            date: invoiceDate,
            type: LedgerEntryType.CREDIT,
            amount: settledAmount,
            narration: `Payment for invoice ${existing.invoiceNo}`,
            referenceId: id,
            referenceType: 'INVOICE_PAYMENT',
            currentBalance: previousBalance + totalAmount,
          });
        }
      }
      if (effectiveDriverCharge > 0) {
        await postDriverLedger(tx, {
          driverId: dto.driverId,
          date: invoiceDate,
          type: LedgerEntryType.DEBIT,
          amount: effectiveDriverCharge,
          narration: dto.notes ?? 'Invoice driver charge',
          referenceId: id,
          referenceType: 'INVOICE_DRIVER_CHARGE',
          currentBalance: toNumber(refreshedDriver?.advanceBalance),
        });
      }
      if (paymentMode === PaymentMode.CASH && settledAmount > 0) {
        await postCashBook(tx, {
          date: invoiceDate,
          kind: CashBookType.RECEIPT,
          amount: settledAmount,
          narration: `Invoice ${existing.invoiceNo}`,
          voucherRef: existing.invoiceNo,
          referenceId: id,
          referenceType: 'INVOICE',
        });
      }
      if (paymentMode === PaymentMode.CHEQUE) {
        const cheque = await tx.chequeLog.create({
          data: {
            chequeNo: dto.chequeNo!,
            bankName: dto.bankName!,
            chequeDate: new Date(dto.chequeDate as string),
            amount: settledAmount,
            receivedFrom: customer.shopName,
            sourceType: 'INVOICE',
            sourceId: id,
            paymentMode: PaymentMode.CHEQUE,
            status: ChequeStatus.PENDING,
            notes: dto.notes,
          },
        });
        await tx.invoice.update({
          where: { id },
          data: { chequeLogId: cheque.id, paymentReference: dto.chequeNo },
        });
      } else if (paymentMode === PaymentMode.ONLINE) {
        const online = await tx.onlinePaymentLog.create({
          data: {
            provider: paymentProvider!,
            referenceNo: dto.paymentReference,
            amount: settledAmount,
            status: PaymentStatus.PENDING,
            receivedFrom: customer.shopName,
            sourceType: 'INVOICE',
            sourceId: id,
            notes: dto.notes,
          },
        });
        await tx.invoice.update({
          where: { id },
          data: { onlinePaymentLogId: online.id },
        });
      }

      return tx.invoice.findUnique({
        where: { id },
        include: {
          customer: true,
          driver: true,
          chequeLog: true,
          onlinePaymentLog: true,
          items: true,
        },
      });
    }, this.transactionOptions);
  }

  async voidInvoice(id: number, reason?: string) {
    const invoice = await this.findOne(id);
    if ((invoice as any).isVoided) {
      throw new BadRequestException(`Invoice #${id} is already voided`);
    }

    const voidedAt = new Date();
    const voidReason = reason?.trim() || null;
    const settledAmount = Number(
      (invoice as any).settledAmount ??
        (invoice.paymentMode === PaymentMode.UDHAR ? 0 : invoice.totalAmount),
    );

    return this.prisma.$transaction(async (tx) => {
      if (invoice.driverId && Number(invoice.driverCharge) > 0) {
        await postDriverLedger(tx, {
          driverId: invoice.driverId,
          date: voidedAt,
          type: LedgerEntryType.CREDIT,
          amount: Number(invoice.driverCharge),
          narration: `Void invoice driver charge #${id}`,
          referenceId: invoice.id,
          referenceType: 'INVOICE_VOID_DRIVER_CHARGE',
        });
      }

      // Reverse the sale and its settled payment separately. This mirrors the
      // two ledger rows created for every invoice and also handles legacy
      // invoices that only posted their outstanding balance.
      if (Number(invoice.totalAmount) > 0) {
        await postCustomerLedger(tx, {
          customerId: invoice.customerId,
          date: voidedAt,
          type: LedgerEntryType.CREDIT,
          amount: Number(invoice.totalAmount),
          narration: `Void invoice ${invoice.invoiceNo}`,
          referenceId: invoice.id,
          referenceType: 'INVOICE_VOID',
        });
      }

      if (settledAmount > 0) {
        await postCustomerLedger(tx, {
          customerId: invoice.customerId,
          date: voidedAt,
          type: LedgerEntryType.DEBIT,
          amount: settledAmount,
          narration: `Void invoice payment reversal ${invoice.invoiceNo}`,
          referenceId: invoice.id,
          referenceType: 'INVOICE_VOID_PAYMENT',
        });
      }

      if (invoice.paymentMode === PaymentMode.CASH && settledAmount > 0) {
        await postCashBook(tx, {
          date: voidedAt,
          kind: CashBookType.PAYMENT,
          amount: settledAmount,
          narration: `Void invoice ${invoice.invoiceNo}`,
          voucherRef: invoice.invoiceNo,
          referenceId: invoice.id,
          referenceType: 'INVOICE_VOID',
        });
      }

      if (invoice.paymentMode === PaymentMode.CHEQUE && invoice.chequeLogId) {
        const cheque = await tx.chequeLog.findUnique({
          where: { id: invoice.chequeLogId },
          include: { purchase: true, invoice: true },
        });

        if (cheque?.purchase) {
          throw new BadRequestException(
            'Void the transferred cheque before voiding this invoice',
          );
        }

        if (cheque?.status === ChequeStatus.CLEARED) {
          await postBankLedger(tx, {
            bankName: cheque.bankName,
            date: voidedAt,
            type: LedgerEntryType.DEBIT,
            amount: Number(cheque.amount ?? settledAmount),
            narration: `Void invoice cheque #${cheque.chequeNo}`,
            refNo: cheque.chequeNo,
          });
        }

        await tx.chequeLog.delete({ where: { id: invoice.chequeLogId } });
      }

      if (
        invoice.paymentMode === PaymentMode.ONLINE &&
        invoice.onlinePaymentLogId
      ) {
        const online = await tx.onlinePaymentLog.findUnique({
          where: { id: invoice.onlinePaymentLogId },
        });

        if (online?.status === PaymentStatus.COMPLETED) {
          if (
            online.provider === OnlineProvider.BANK_TRANSFER ||
            online.provider === OnlineProvider.OTHER
          ) {
            await postBankLedger(tx, {
              bankName: 'Main Bank',
              date: voidedAt,
              type: LedgerEntryType.DEBIT,
              amount: Number(online.amount ?? settledAmount),
              narration: `Void invoice online payment #${id}`,
              refNo: online.referenceNo ?? undefined,
            });
          } else if (online.provider === OnlineProvider.EASYPAISA) {
            await postEasypaisaLedger(tx, {
              date: voidedAt,
              type: LedgerEntryType.DEBIT,
              amount: Number(online.amount ?? settledAmount),
              narration: `Void invoice online payment #${id}`,
              mobileNo: online.referenceNo ?? undefined,
            });
          } else if (online.provider === OnlineProvider.JAZZCASH) {
            await postBankLedger(tx, {
              bankName: 'JazzCash',
              date: voidedAt,
              type: LedgerEntryType.DEBIT,
              amount: Number(online.amount ?? settledAmount),
              narration: `Void invoice JazzCash payment #${id}`,
              refNo: online.referenceNo ?? undefined,
            });
          }
        }

        await tx.onlinePaymentLog.delete({
          where: { id: invoice.onlinePaymentLogId },
        });
      }

      return tx.invoice.update({
        where: { id },
        data: {
          isVoided: true,
          voidReason,
          voidedAt,
        },
      });
    });
  }
}
