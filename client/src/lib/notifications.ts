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
  date: string;
  href: string;
}

export interface PendingNotificationsResponse {
  generatedAt: string;
  totalCount: number;
  totalAmount: number;
  counts: Record<PendingNotificationCategory, number>;
  items: PendingNotificationItem[];
}

export const notificationCategoryMeta: Record<PendingNotificationCategory, { label: string; tone: string }> = {
  CHEQUE: { label: 'Pending cheques', tone: 'amber' },
  CUSTOMER_UDHAAR: { label: 'Customer udhaar', tone: 'rose' },
  VENDOR_UDHAAR: { label: 'Vendor udhaar', tone: 'blue' },
  DRIVER_EXPENSE: { label: 'Driver expenses', tone: 'violet' },
  ONLINE_PAYMENT: { label: 'Online payments', tone: 'emerald' },
};

export function formatNotificationAmount(value: number) {
  return `Rs. ${Number(value ?? 0).toLocaleString('en-PK')}`;
}

export function formatNotificationDate(value: string) {
  return new Date(value).toLocaleDateString('en-PK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
