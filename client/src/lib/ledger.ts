export interface LedgerCommodityFields {
  weightKg?: number | string | null;
  ratePerKg?: number | string | null;
  rateCount?: number;
}

export function formatLedgerWeight(value: LedgerCommodityFields['weightKg']) {
  if (value == null) return '—';
  return `${Number(value).toLocaleString('en-PK', {
    maximumFractionDigits: 3,
  })} kg`;
}

export function formatLedgerRate(row: LedgerCommodityFields) {
  if ((row.rateCount ?? 0) > 1) return 'Multiple';
  if (row.ratePerKg == null) return '—';
  return `Rs. ${Number(row.ratePerKg).toLocaleString('en-PK')} / kg`;
}
