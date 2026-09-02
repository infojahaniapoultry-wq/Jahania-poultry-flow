import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePurchaseDto, UpdatePurchaseDto } from './purchases.dto';
import {
  CashBookType,
  ChequeStatus,
  LedgerEntryType,
  OnlineProvider,
  PaymentMode,
  PaymentStatus,
} from '@prisma/client';
import {
  dayRange,
  normalizeDate,
  postBankLedger,
  postCashBook,
  postEasypaisaLedger,
  postDriverLedger,
  postVendorLedger,
  toNumber,
} from '../shared/ledger-posting';
import { formatDocumentNo } from '../shared/document-number';

async function rebuildVendorBalance(tx: any, vendorId: number) {
  const vendor = await tx.vendor.findUnique({
    where: { id: vendorId },
    select: { openingBalance: true },
  });
  let runningBalance = toNumber(vendor?.openingBalance);
  const rows = await tx.vendorLedger.findMany({
    where: { vendorId },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
  });

  for (const row of rows) {
    const amount = toNumber(row.amount);
    runningBalance =
      row.type === LedgerEntryType.CREDIT
        ? runningBalance + amount
        : runningBalance - amount;
    await tx.vendorLedger.update({
      where: { id: row.id },
      data: { runningBalance },
    });
  }

  await tx.vendor.update({
    where: { id: vendorId },
    data: { currentBalance: runningBalance },
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
export class PurchasesService {
  private readonly logger = new Logger(PurchasesService.name);
  private readonly transactionOptions = {
    maxWait: 5_000,
    timeout: 15_000,
  };

  constructor(private prisma: PrismaService) {}

  private attachPurchaseNo<T extends { id: number } | null>(purchase: T) {
    if (!purchase) return purchase;
    return {
      ...purchase,
      purchaseNo: formatDocumentNo('PUR', purchase.id),
    };
  }

  async create(dto: CreatePurchaseDto) {
    const weight = toNumber(dto.weightKg);
    const rate = toNumber(dto.ratePerKg);
    const paymentMode = dto.paymentMode ?? PaymentMode.CASH;
    const paymentProvider = dto.paymentProvider;
    const purchaseDate = normalizeDate(dto.date);

    const startedAt = Date.now();
    this.logger.log(
      `purchase.create start vendor=${dto.vendorId} driver=${dto.driverId ?? 'none'} mode=${paymentMode}`,
    );

    try {
      return await this.prisma.$transaction(async (tx) => {
        const vendor = await tx.vendor.findUnique({
          where: { id: dto.vendorId },
          select: { id: true, name: true, currentBalance: true },
        });
        if (!vendor) {
          throw new NotFoundException(`Vendor #${dto.vendorId} not found`);
        }
        this.logger.log(
          `purchase.create vendor loaded vendor=${vendor.id ?? dto.vendorId} name=${vendor.name}`,
        );

        let driver: {
          id: number;
          name: string;
          defaultCharge: unknown;
          advanceBalance: unknown;
        } | null = null;
        if (dto.driverId) {
          driver = await tx.driver.findUnique({
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
            `purchase.create driver loaded driver=${driver.id} name=${driver.name} balance=${toNumber(driver.advanceBalance)}`,
          );
        }

        const driverCharge =
          dto.driverCharge ?? Number(driver?.defaultCharge ?? 0);
        const purchaseAmount = weight * rate;
        const existingCheque =
          paymentMode === PaymentMode.CHEQUE && dto.existingChequeId
            ? await tx.chequeLog.findUnique({
                where: { id: dto.existingChequeId },
                include: { invoice: true, purchase: true },
              })
            : null;
        if (dto.existingChequeId && !existingCheque) {
          throw new NotFoundException(
            `Cheque #${dto.existingChequeId} not found`,
          );
        }
        if (existingCheque) {
          if (existingCheque.status !== ChequeStatus.PENDING) {
            throw new BadRequestException(
              'Only pending cheques can be transferred to a purchase',
            );
          }
          if (!existingCheque.invoice) {
            throw new BadRequestException(
              'Only invoice cheques can be reused for a purchase',
            );
          }
          if (
            existingCheque.purchase ||
            existingCheque.sourceType === 'PURCHASE'
          ) {
            throw new BadRequestException(
              'This cheque is already transferred to a purchase',
            );
          }
        }

        const settledAmountInput =
          dto.settledAmount !== undefined
            ? toNumber(dto.settledAmount)
            : existingCheque
              ? toNumber(existingCheque.amount)
              : paymentMode === PaymentMode.UDHAR
                ? 0
                : purchaseAmount;
        if (settledAmountInput < 0) {
          throw new BadRequestException('Paid amount cannot be negative');
        }
        if (settledAmountInput > purchaseAmount) {
          throw new BadRequestException(
            'Paid amount cannot exceed purchase total',
          );
        }
        if (paymentMode !== PaymentMode.UDHAR && settledAmountInput <= 0) {
          throw new BadRequestException(
            'Paid amount is required for cash, cheque, and online purchases',
          );
        }
        if (paymentMode === PaymentMode.UDHAR && settledAmountInput !== 0) {
          throw new BadRequestException(
            'Udhar purchases cannot include a paid amount',
          );
        }
        const settledAmount = settledAmountInput;
        const balanceDelta = purchaseAmount - settledAmount;
        const purchaseStatus =
          paymentMode === PaymentMode.CASH
            ? balanceDelta > 0
              ? PaymentStatus.OUTSTANDING
              : PaymentStatus.COMPLETED
            : paymentMode === PaymentMode.UDHAR
              ? PaymentStatus.OUTSTANDING
              : PaymentStatus.PENDING;
        const narration = dto.notes ?? `Purchase from ${vendor.name}`;

        const purchase = await tx.purchaseEntry.create({
          data: {
            date: purchaseDate,
            vendorId: dto.vendorId,
            driverId: dto.driverId,
            driverCharge,
            weightKg: weight,
            ratePerKg: rate,
            purchaseAmount,
            settledAmount,
            paymentMode,
            paymentStatus: purchaseStatus,
            paymentReference: dto.paymentReference,
            paymentProvider,
            notes: dto.notes,
          },
          include: { vendor: true, driver: true },
        });
        this.logger.log(
          `purchase.create purchase row created purchaseId=${purchase.id}`,
        );

        if (balanceDelta !== 0) {
          this.logger.log(
            `purchase.create vendor ledger purchaseId=${purchase.id} delta=${balanceDelta}`,
          );
          await postVendorLedger(tx, {
            vendorId: dto.vendorId,
            date: purchaseDate,
            type:
              balanceDelta > 0 ? LedgerEntryType.CREDIT : LedgerEntryType.DEBIT,
            amount: Math.abs(balanceDelta),
            narration,
            referenceId: purchase.id,
            referenceType: 'PURCHASE',
            currentBalance: toNumber(vendor.currentBalance),
          });
          this.logger.log(
            `purchase.create vendor ledger complete purchaseId=${purchase.id}`,
          );
        }

        if (paymentMode === PaymentMode.CASH && settledAmount > 0) {
          this.logger.log(
            `purchase.create cashbook purchaseId=${purchase.id} amount=${settledAmount}`,
          );
          await postCashBook(tx, {
            date: purchaseDate,
            kind: CashBookType.PAYMENT,
            amount: settledAmount,
            narration,
            voucherRef: formatDocumentNo('PUR', purchase.id),
            referenceId: purchase.id,
            referenceType: 'PURCHASE',
          });
        } else if (paymentMode === PaymentMode.CHEQUE) {
          this.logger.log(
            `purchase.create cheque log purchaseId=${purchase.id}`,
          );
          let cheque;
          if (existingCheque) {
            cheque = existingCheque;
          } else {
            if (!dto.chequeNo || !dto.bankName || !dto.chequeDate) {
              throw new BadRequestException(
                'Cheque number, bank name, and cheque date are required',
              );
            }

            cheque = await tx.chequeLog.create({
              data: {
                chequeNo: dto.chequeNo,
                bankName: dto.bankName,
                chequeDate: new Date(dto.chequeDate),
                amount: settledAmount,
                receivedFrom: vendor.name,
                sourceType: 'PURCHASE',
                sourceId: purchase.id,
                paymentMode: PaymentMode.CHEQUE,
                status: ChequeStatus.PENDING,
                notes: dto.notes,
              },
            });
          }

          await tx.purchaseEntry.update({
            where: { id: purchase.id },
            data: {
              chequeLogId: cheque.id,
              paymentReference: cheque.chequeNo,
            },
          });

          if (existingCheque) {
            await tx.chequeLog.update({
              where: { id: cheque.id },
              data: {
                sourceType: 'PURCHASE',
                sourceId: purchase.id,
              },
            });
          }
        } else if (paymentMode === PaymentMode.ONLINE) {
          this.logger.log(
            `purchase.create online payment log purchaseId=${purchase.id} provider=${paymentProvider}`,
          );
          if (!paymentProvider || !dto.paymentReference) {
            throw new BadRequestException(
              'Online provider and payment reference are required',
            );
          }
          const online = await tx.onlinePaymentLog.create({
            data: {
              provider: paymentProvider,
              referenceNo: dto.paymentReference,
              amount: settledAmount,
              status: PaymentStatus.PENDING,
              receivedFrom: vendor.name,
              sourceType: 'PURCHASE',
              sourceId: purchase.id,
              notes: dto.notes,
            },
          });

          await tx.purchaseEntry.update({
            where: { id: purchase.id },
            data: {
              onlinePaymentLogId: online.id,
              paymentReference: dto.paymentReference,
              paymentProvider,
            },
          });
        }

        if (dto.driverId && driverCharge > 0) {
          this.logger.log(
            `purchase.create driver ledger purchaseId=${purchase.id} charge=${driverCharge}`,
          );
          await postDriverLedger(tx, {
            driverId: dto.driverId,
            date: purchaseDate,
            type: LedgerEntryType.DEBIT,
            amount: driverCharge,
            narration: dto.notes ?? `Purchase driver charge`,
            referenceId: purchase.id,
            referenceType: 'PURCHASE_DRIVER_CHARGE',
            currentBalance: driver
              ? toNumber(driver.advanceBalance)
              : undefined,
          });
          this.logger.log(
            `purchase.create driver ledger complete purchaseId=${purchase.id}`,
          );
        }

        const purchaseRow = await tx.purchaseEntry.findUnique({
          where: { id: purchase.id },
          include: {
            vendor: true,
            driver: true,
            chequeLog: true,
            onlinePaymentLog: true,
          },
        });
        return this.attachPurchaseNo(purchaseRow);
      }, this.transactionOptions);
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `purchase.create failed after ${Date.now() - startedAt}ms vendor=${dto.vendorId} driver=${dto.driverId ?? 'none'} mode=${paymentMode}: ${err.message}`,
        err.stack,
      );
      throw error;
    }
  }

  async findAll(date?: string) {
    const where: any = { isVoided: false };
    if (date) {
      const range = dayRange(date);
      where.date = { gte: range.start, lte: range.end };
    }
    const purchases = await this.prisma.purchaseEntry.findMany({
      where,
      include: {
        vendor: { select: { id: true, name: true } },
        driver: { select: { id: true, name: true } },
        chequeLog: true,
        onlinePaymentLog: true,
      },
      orderBy: { date: 'desc' },
    });
    return purchases.map((purchase) => this.attachPurchaseNo(purchase));
  }

  async voidPurchase(id: number, reason?: string) {
    const purchase = await this.findOne(id);
    if ((purchase as any).isVoided) {
      throw new BadRequestException(`Purchase #${id} is already voided`);
    }

    const voidedAt = new Date();
    const voidReason = reason?.trim() || null;
    const settledAmount = Number(
      (purchase as any).settledAmount ?? purchase.purchaseAmount,
    );
    const balanceDelta = Number(purchase.purchaseAmount) - settledAmount;

    return this.prisma.$transaction(async (tx) => {
      if (purchase.driverId && Number(purchase.driverCharge) > 0) {
        await postDriverLedger(tx, {
          driverId: purchase.driverId,
          date: voidedAt,
          type: LedgerEntryType.CREDIT,
          amount: Number(purchase.driverCharge),
          narration: `Void purchase driver charge #${id}`,
          referenceId: purchase.id,
          referenceType: 'PURCHASE_VOID_DRIVER_CHARGE',
        });
      }

      // Always reverse the vendor ledger for the outstanding balance delta.
      // On creation, we posted: CREDIT balanceDelta (if > 0) to vendor.
      // On void, we always reverse that original posting.
      if (balanceDelta !== 0) {
        await postVendorLedger(tx, {
          vendorId: purchase.vendorId,
          date: voidedAt,
          type:
            balanceDelta > 0 ? LedgerEntryType.DEBIT : LedgerEntryType.CREDIT,
          amount: Math.abs(balanceDelta),
          narration: `Void purchase balance #${id}`,
          referenceId: purchase.id,
          referenceType: 'PURCHASE_VOID',
        });
      }

      if (purchase.paymentMode === PaymentMode.CASH && settledAmount > 0) {
        await postCashBook(tx, {
          date: voidedAt,
          kind: CashBookType.RECEIPT,
          amount: settledAmount,
          narration: `Void purchase #${id}`,
          voucherRef: formatDocumentNo('PUR-VOID', id),
          referenceId: purchase.id,
          referenceType: 'PURCHASE_VOID',
        });
      }

      if (purchase.paymentMode === PaymentMode.CHEQUE && purchase.chequeLogId) {
        const cheque = await tx.chequeLog.findUnique({
          where: { id: purchase.chequeLogId },
          include: { invoice: true, purchase: true },
        });

        const chequeAmount = Number(cheque?.amount ?? settledAmount);

        if (cheque?.status === ChequeStatus.CLEARED) {
          await postBankLedger(tx, {
            bankName: cheque.bankName,
            date: voidedAt,
            type: LedgerEntryType.CREDIT,
            amount: chequeAmount,
            narration: `Void purchase cheque #${cheque.chequeNo}`,
            refNo: cheque.chequeNo,
          });
        } else if (cheque?.status === ChequeStatus.BOUNCED) {
          await postVendorLedger(tx, {
            vendorId: purchase.vendorId,
            date: voidedAt,
            type: LedgerEntryType.DEBIT,
            amount: chequeAmount,
            narration: `Void bounced purchase cheque #${cheque.chequeNo}`,
            referenceId: purchase.id,
            referenceType: 'PURCHASE_VOID',
          });
        }

        if (cheque?.invoice) {
          await tx.chequeLog.update({
            where: { id: cheque.id },
            data: {
              sourceType: 'INVOICE',
              sourceId: cheque.invoice.id,
            },
          });
        } else {
          await tx.chequeLog.delete({ where: { id: purchase.chequeLogId } });
        }
      }

      if (
        purchase.paymentMode === PaymentMode.ONLINE &&
        purchase.onlinePaymentLogId
      ) {
        const online = await tx.onlinePaymentLog.findUnique({
          where: { id: purchase.onlinePaymentLogId },
        });
        const onlineAmount = Number(online?.amount ?? settledAmount);

        if (online?.status === PaymentStatus.COMPLETED) {
          if (
            online.provider === OnlineProvider.BANK_TRANSFER ||
            online.provider === OnlineProvider.OTHER
          ) {
            await postBankLedger(tx, {
              bankName: 'Main Bank',
              date: voidedAt,
              type: LedgerEntryType.CREDIT,
              amount: onlineAmount,
              narration: `Void purchase online payment #${id}`,
              refNo: online.referenceNo ?? undefined,
            });
          } else if (online.provider === OnlineProvider.EASYPAISA) {
            await postEasypaisaLedger(tx, {
              date: voidedAt,
              type: LedgerEntryType.CREDIT,
              amount: onlineAmount,
              narration: `Void purchase online payment #${id}`,
              mobileNo: online.referenceNo ?? undefined,
            });
          } else if (online.provider === OnlineProvider.JAZZCASH) {
            await postBankLedger(tx, {
              bankName: 'JazzCash',
              date: voidedAt,
              type: LedgerEntryType.CREDIT,
              amount: onlineAmount,
              narration: `Void purchase JazzCash payment #${id}`,
              refNo: online.referenceNo ?? undefined,
            });
          }
        } else if (
          online?.status === PaymentStatus.FAILED ||
          online?.status === PaymentStatus.BOUNCED
        ) {
          await postVendorLedger(tx, {
            vendorId: purchase.vendorId,
            date: voidedAt,
            type: LedgerEntryType.DEBIT,
            amount: onlineAmount,
            narration: `Void failed purchase online payment #${id}`,
            referenceId: purchase.id,
            referenceType: 'PURCHASE_VOID',
          });
        }

        await tx.onlinePaymentLog.delete({
          where: { id: purchase.onlinePaymentLogId },
        });
      }

      return tx.purchaseEntry.update({
        where: { id },
        data: {
          isVoided: true,
          voidReason,
          voidedAt,
        } as any,
      });
    });
  }

  async findOne(id: number) {
    const purchase = await this.prisma.purchaseEntry.findUnique({
      where: { id },
      include: {
        vendor: true,
        driver: true,
        chequeLog: true,
        onlinePaymentLog: true,
      },
    });
    if (!purchase) throw new NotFoundException(`Purchase #${id} not found`);
    return this.attachPurchaseNo(purchase);
  }

  async update(id: number, dto: UpdatePurchaseDto) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.purchaseEntry.findUnique({
        where: { id },
        include: { chequeLog: true, onlinePaymentLog: true },
      });
      if (!existing) throw new NotFoundException(`Purchase #${id} not found`);
      if (existing.isVoided) {
        throw new BadRequestException('Voided purchases cannot be edited');
      }
      if (existing.chequeLog && existing.chequeLog.status !== ChequeStatus.PENDING) {
        throw new BadRequestException(
          'Processed or bounced cheque purchases cannot be edited',
        );
      }
      if (
        existing.onlinePaymentLog &&
        existing.onlinePaymentLog.status !== PaymentStatus.PENDING
      ) {
        throw new BadRequestException(
          'Processed online-payment purchases cannot be edited',
        );
      }

      const weightKg =
        dto.weightKg === undefined ? toNumber(existing.weightKg) : toNumber(dto.weightKg);
      const ratePerKg =
        dto.ratePerKg === undefined ? toNumber(existing.ratePerKg) : toNumber(dto.ratePerKg);
      if (weightKg <= 0 || ratePerKg <= 0) {
        throw new BadRequestException('Purchase weight and rate must be greater than zero');
      }

      const purchaseDate = dto.date ? normalizeDate(dto.date) : existing.date;
      const purchaseAmount = weightKg * ratePerKg;
      const settledAmount = toNumber(existing.settledAmount);
      if (settledAmount > purchaseAmount) {
        throw new BadRequestException(
          'The updated purchase total cannot be lower than the amount already paid',
        );
      }

      const oldOutstanding = toNumber(existing.purchaseAmount) - settledAmount;
      const newOutstanding = purchaseAmount - settledAmount;
      const paymentStatus =
        existing.paymentMode === PaymentMode.CASH
          ? newOutstanding > 0
            ? PaymentStatus.OUTSTANDING
            : PaymentStatus.COMPLETED
          : existing.paymentMode === PaymentMode.UDHAR
            ? PaymentStatus.OUTSTANDING
            : PaymentStatus.PENDING;
      const narration = dto.notes ?? existing.notes ?? `Purchase #${id}`;

      await tx.purchaseEntry.update({
        where: { id },
        data: {
          date: purchaseDate,
          weightKg,
          ratePerKg,
          purchaseAmount,
          paymentStatus,
          notes: dto.notes ?? existing.notes,
        },
      });

      await tx.vendorLedger.updateMany({
        where: { vendorId: existing.vendorId, referenceId: id, referenceType: 'PURCHASE' },
        data: { date: purchaseDate, narration },
      });
      const outstandingAdjustment = newOutstanding - oldOutstanding;
      if (outstandingAdjustment !== 0) {
        await postVendorLedger(tx, {
          vendorId: existing.vendorId,
          date: purchaseDate,
          type:
            outstandingAdjustment > 0
              ? LedgerEntryType.CREDIT
              : LedgerEntryType.DEBIT,
          amount: Math.abs(outstandingAdjustment),
          narration: `Purchase adjustment #${id}`,
          referenceId: id,
          referenceType: 'PURCHASE_ADJUSTMENT',
        });
      }

      await tx.driverLedger.updateMany({
        where: { driverId: existing.driverId ?? undefined, referenceId: id, referenceType: 'PURCHASE_DRIVER_CHARGE' },
        data: { date: purchaseDate, narration },
      });
      if (existing.paymentMode === PaymentMode.CASH) {
        await tx.cashBook.updateMany({
          where: { referenceId: id, referenceType: 'PURCHASE' },
          data: { date: purchaseDate, narration },
        });
      }

      await rebuildVendorBalance(tx, existing.vendorId);
      if (existing.paymentMode === PaymentMode.CASH) {
        await rebuildCashBook(tx);
      }

      const updated = await tx.purchaseEntry.findUnique({
        where: { id },
        include: { vendor: true, driver: true, chequeLog: true, onlinePaymentLog: true },
      });
      return this.attachPurchaseNo(updated);
    }, this.transactionOptions);
  }

  async remove(id: number) {
    const purchase = await this.findOne(id);
    const settledAmount = Number(
      (purchase as any).settledAmount ??
        (purchase.paymentMode === PaymentMode.UDHAR
          ? 0
          : purchase.purchaseAmount),
    );
    const balanceDelta = Number(purchase.purchaseAmount) - settledAmount;
    return this.prisma.$transaction(async (tx) => {
      if (purchase.driverId && Number(purchase.driverCharge) > 0) {
        await postDriverLedger(tx, {
          driverId: purchase.driverId,
          date: new Date(),
          type: LedgerEntryType.CREDIT,
          amount: Number(purchase.driverCharge),
          narration: `Reversal of Purchase driver charge #${id}`,
          referenceId: id,
          referenceType: 'PURCHASE_DRIVER_CHARGE_REVERSAL',
        });
      }

      // Reverse only the unpaid vendor balance that was posted at creation.
      if (balanceDelta !== 0) {
        await postVendorLedger(tx, {
          vendorId: purchase.vendorId,
          date: new Date(),
          type:
            balanceDelta > 0 ? LedgerEntryType.DEBIT : LedgerEntryType.CREDIT,
          amount: Math.abs(balanceDelta),
          narration: `Reversal of Purchase #${id}`,
          referenceId: id,
          referenceType: 'PURCHASE_REVERSAL',
        });
      }

      if (purchase.paymentMode === PaymentMode.CASH && settledAmount > 0) {
        await postCashBook(tx, {
          date: new Date(),
          kind: CashBookType.RECEIPT,
          amount: settledAmount,
          narration: `Purchase reversal #${id}`,
          voucherRef: formatDocumentNo('PUR-REV', id),
          referenceId: id,
          referenceType: 'PURCHASE_REVERSAL',
        });
      }

      if (purchase.chequeLogId) {
        const cheque = await tx.chequeLog.findUnique({
          where: { id: purchase.chequeLogId },
          include: { invoice: true },
        });

        if (cheque?.invoice) {
          await tx.chequeLog.update({
            where: { id: cheque.id },
            data: {
              sourceType: 'INVOICE',
              sourceId: cheque.invoice.id,
            },
          });
        } else {
          await tx.chequeLog.delete({ where: { id: purchase.chequeLogId } });
        }
      }

      if (purchase.onlinePaymentLogId) {
        await tx.onlinePaymentLog.delete({
          where: { id: purchase.onlinePaymentLogId },
        });
      }

      return tx.purchaseEntry.delete({ where: { id } });
    });
  }
}
