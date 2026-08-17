export type PaymentMode = 'CASH' | 'CHEQUE' | 'ONLINE';
export type OnlineProvider = 'JAZZCASH' | 'EASYPAISA' | 'NAYAPAY' | 'BANK_TRANSFER' | 'OTHER';

export const ONLINE_PROVIDER_OPTIONS: Array<{ value: OnlineProvider; label: string }> = [
  { value: 'JAZZCASH', label: 'JazzCash' },
  { value: 'EASYPAISA', label: 'Easypaisa' },
  { value: 'NAYAPAY', label: 'NayaPay' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'OTHER', label: 'Other' },
];

export const BANK_OPTIONS = [
  'MCB Bank',
  'HBL',
  'UBL',
  'Meezan Bank',
  'Allied Bank',
  'Bank Alfalah',
  'Askari Bank',
  'Faysal Bank',
  'Bank Al Habib',
  'Habib Metropolitan Bank',
  'National Bank of Pakistan',
  'JS Bank',
  'Soneri Bank',
  'Silkbank',
  'Standard Chartered',
  'Dubai Islamic Bank',
  'Other',
] as const;

export interface CustomerRow {
  id: number;
  shopName: string;
  openingBalance?: string | number;
  currentBalance?: string | number;
  contact?: string | null;
}

export interface VendorRow {
  id: number;
  name: string;
  openingBalance?: string | number;
  currentBalance?: string | number;
  contact?: string | null;
}

export interface ChequeRow {
  id: number;
  chequeNo: string;
  bankName: string;
  chequeDate: string;
  amount: string | number;
  receivedFrom?: string | null;
  status: string;
  notes?: string | null;
  sourceType?: string | null;
  sourceId?: number | null;
  purchase?: {
    id: number;
    vendor?: { id: number; name: string } | null;
  } | null;
  invoice?: {
    id: number;
    customer?: { id: number; shopName: string } | null;
  } | null;
}

export interface OnlineRow {
  id: number;
  provider: string;
  referenceNo?: string | null;
  amount: string | number;
  status: string;
  receivedFrom?: string | null;
  notes?: string | null;
  sourceType?: string | null;
  sourceId?: number | null;
  createdAt?: string | null;
  purchase?: {
    id: number;
    vendor?: { id: number; name: string } | null;
  } | null;
  invoice?: {
    id: number;
    customer?: { id: number; shopName: string } | null;
  } | null;
}

export interface TransactionRow {
  id: string;
  sourceType: string;
  sourceId: number;
  date: string;
  createdAt?: string | null;
  totalAmount?: string | number;
  settledAmount?: string | number;
  partyName?: string | null;
  driverName?: string | null;
  amount: string | number;
  paymentMode?: string | null;
  paymentStatus?: string | null;
  reference?: string | null;
  narration?: string | null;
  generated: boolean;
  readOnly: boolean;
}

export interface SettlementTarget {
  kind: 'RECOVERY' | 'CREDIT';
  partyId: number;
  partyName: string;
  balance: number;
}

export const today = new Date().toISOString().split('T')[0];

export const fmt = (value: string | number) => `Rs. ${Number(value ?? 0).toLocaleString('en-PK')}`;

export const transactionSortTime = (row: TransactionRow) => new Date(row.createdAt ?? row.date).getTime();

export function sortTransactions(rows: TransactionRow[], order: 'asc' | 'desc' = 'desc') {
  const direction = order === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => (transactionSortTime(a) - transactionSortTime(b)) * direction);
}

export function badgeClass(status?: string | null) {
  switch ((status ?? '').toUpperCase()) {
    case 'CLEARED':
    case 'COMPLETED':
      return 'badge-green';
    case 'PENDING':
      return 'badge-gray';
    case 'OUTSTANDING':
      return 'badge-amber';
    case 'FAILED':
    case 'BOUNCED':
      return 'badge-red';
    default:
      return 'badge-blue';
  }
}

export function modeLabel(mode?: string | null) {
  return mode ? mode.replaceAll('_', ' ') : '-';
}

export function getErrorMessage(error: unknown, fallback: string) {
  if (typeof error === 'object' && error && 'response' in error) {
    const response = error as { response?: { data?: { message?: string } } };
    const message = response.response?.data?.message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}
