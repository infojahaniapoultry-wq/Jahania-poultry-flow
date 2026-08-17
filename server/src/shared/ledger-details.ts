import { toNumber } from './ledger-posting';
import type { PrismaService } from '../prisma/prisma.service';

export type LedgerReference = {
  referenceType?: string | null;
  referenceId?: number | null;
};

export type LedgerDetails = {
  weightKg: number | null;
  ratePerKg: number | null;
  rateCount: number;
};

const emptyLedgerDetails = (): LedgerDetails => ({
  weightKg: null,
  ratePerKg: null,
  rateCount: 0,
});

export function summarizeInvoiceItems(
  items: Array<{ netWeight: unknown; ratePerKg: unknown }>,
): LedgerDetails {
  if (items.length === 0) return emptyLedgerDetails();

  const rates = Array.from(
    new Set(items.map((item) => toNumber(item.ratePerKg))),
  );

  return {
    weightKg: items.reduce(
      (total, item) => total + toNumber(item.netWeight),
      0,
    ),
    ratePerKg: rates.length === 1 ? rates[0] : null,
    rateCount: rates.length,
  };
}

export function summarizePurchase(
  purchase: { weightKg: unknown; ratePerKg: unknown },
): LedgerDetails {
  return {
    weightKg: toNumber(purchase.weightKg),
    ratePerKg: toNumber(purchase.ratePerKg),
    rateCount: 1,
  };
}

export async function loadLedgerDetails(
  prisma: PrismaService,
  rows: LedgerReference[],
) {
  const invoiceIds = Array.from(
    new Set(
      rows
        .filter((row) => row.referenceType?.includes('INVOICE'))
        .map((row) => row.referenceId)
        .filter((id): id is number => typeof id === 'number'),
    ),
  );
  const purchaseIds = Array.from(
    new Set(
      rows
        .filter((row) => row.referenceType?.includes('PURCHASE'))
        .map((row) => row.referenceId)
        .filter((id): id is number => typeof id === 'number'),
    ),
  );

  const [invoices, purchases] = await Promise.all([
    invoiceIds.length
      ? prisma.invoice.findMany({
          where: { id: { in: invoiceIds } },
          select: {
            id: true,
            items: { select: { netWeight: true, ratePerKg: true } },
          },
        })
      : [],
    purchaseIds.length
      ? prisma.purchaseEntry.findMany({
          where: { id: { in: purchaseIds } },
          select: { id: true, weightKg: true, ratePerKg: true },
        })
      : [],
  ]);

  const details = new Map<string, LedgerDetails>();
  for (const invoice of invoices) {
    details.set(
      `INVOICE:${invoice.id}`,
      summarizeInvoiceItems(invoice.items),
    );
  }
  for (const purchase of purchases) {
    details.set(`PURCHASE:${purchase.id}`, summarizePurchase(purchase));
  }

  return details;
}

export function detailsForLedgerRow(
  details: Map<string, LedgerDetails>,
  row: LedgerReference,
): LedgerDetails {
  const kind = row.referenceType?.includes('INVOICE')
    ? 'INVOICE'
    : row.referenceType?.includes('PURCHASE')
      ? 'PURCHASE'
      : null;

  return kind && typeof row.referenceId === 'number'
    ? details.get(`${kind}:${row.referenceId}`) ?? emptyLedgerDetails()
    : emptyLedgerDetails();
}
