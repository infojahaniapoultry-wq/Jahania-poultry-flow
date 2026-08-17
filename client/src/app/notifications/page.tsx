'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import api from '@/lib/api';
import { BUSINESS_DATA_UPDATED_EVENT } from '@/lib/business-events';
import {
  formatNotificationAmount,
  formatNotificationDate,
  notificationCategoryMeta,
  type PendingNotificationCategory,
  type PendingNotificationItem,
  type PendingNotificationsResponse,
} from '@/lib/notifications';
import { AlertTriangle, ArrowUpRight, Bell, Car, CheckCircle2, Landmark, RefreshCw, Smartphone, Users, WalletCards } from 'lucide-react';
import { toast } from 'react-hot-toast';

const categoryVisuals: Record<PendingNotificationCategory, { icon: typeof Bell; iconClass: string; badgeClass: string }> = {
  CHEQUE: { icon: Landmark, iconClass: 'bg-amber-50 text-amber-700', badgeClass: 'bg-amber-50 text-amber-700' },
  CUSTOMER_UDHAAR: { icon: Users, iconClass: 'bg-rose-50 text-rose-700', badgeClass: 'bg-rose-50 text-rose-700' },
  VENDOR_UDHAAR: { icon: WalletCards, iconClass: 'bg-blue-50 text-blue-700', badgeClass: 'bg-blue-50 text-blue-700' },
  DRIVER_EXPENSE: { icon: Car, iconClass: 'bg-violet-50 text-violet-700', badgeClass: 'bg-violet-50 text-violet-700' },
  ONLINE_PAYMENT: { icon: Smartphone, iconClass: 'bg-emerald-50 text-emerald-700', badgeClass: 'bg-emerald-50 text-emerald-700' },
};

const categoryOrder: PendingNotificationCategory[] = ['CHEQUE', 'CUSTOMER_UDHAAR', 'VENDOR_UDHAAR', 'DRIVER_EXPENSE', 'ONLINE_PAYMENT'];

function groupItems(items: PendingNotificationItem[]) {
  return categoryOrder.map((category) => ({
    category,
    items: items.filter((item) => item.category === category),
  })).filter((group) => group.items.length > 0);
}

export default function NotificationsPage() {
  const [data, setData] = useState<PendingNotificationsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get<PendingNotificationsResponse>('/notifications');
      setData(response.data);
    } catch {
      toast.error('Could not load pending notifications');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const refresh = () => { void load(); };
    window.addEventListener(BUSINESS_DATA_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(BUSINESS_DATA_UPDATED_EVENT, refresh);
  }, [load]);

  const groups = useMemo(() => groupItems(data?.items ?? []), [data?.items]);

  return (
    <AppLayout>
      <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.18em] text-amber-700"><Bell size={13} /> Operations inbox</div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">Pending work</h1>
          <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-slate-500">Everything that still needs a financial action: cheque clearance, udhaar settlement, driver payment, or online transfer review.</p>
        </div>
        <button onClick={() => void load()} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-600 shadow-sm transition hover:border-emerald-200 hover:text-emerald-700"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh</button>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-3xl border border-amber-100 bg-amber-50 p-5"><div className="text-[10px] font-black uppercase tracking-widest text-amber-700">Open items</div><div className="mt-2 text-3xl font-black text-slate-900">{data?.totalCount ?? '—'}</div><div className="mt-1 text-xs font-medium text-amber-800/70">requiring attention</div></div>
        <div className="rounded-3xl border border-rose-100 bg-rose-50 p-5"><div className="text-[10px] font-black uppercase tracking-widest text-rose-700">Pending value</div><div className="mt-2 text-3xl font-black text-slate-900">{data ? formatNotificationAmount(data.totalAmount) : '—'}</div><div className="mt-1 text-xs font-medium text-rose-800/70">across open records</div></div>
        <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-5"><div className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Control status</div><div className="mt-2 flex items-center gap-2 text-xl font-black text-slate-900"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Live</div><div className="mt-1 text-xs font-medium text-emerald-800/70">last checked just now</div></div>
      </div>

      {loading && !data ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-14 text-center shadow-sm"><div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-emerald-100 border-t-emerald-600" /><p className="text-sm font-bold text-slate-500">Checking your pending work…</p></div>
      ) : groups.length === 0 ? (
        <div className="rounded-3xl border border-emerald-100 bg-emerald-50/60 p-14 text-center shadow-sm"><CheckCircle2 size={42} className="mx-auto mb-4 text-emerald-600" /><h2 className="text-xl font-black text-slate-900">All clear for now</h2><p className="mx-auto mt-2 max-w-md text-sm font-medium leading-6 text-slate-500">There are no pending cheques, udhaar balances, driver expenses, or online payment reviews.</p></div>
      ) : (
        <div className="space-y-5">
          {groups.map(({ category, items }) => {
            const visual = categoryVisuals[category];
            const Icon = visual.icon;
            const meta = notificationCategoryMeta[category];
            return <section key={category} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><span className={`grid h-10 w-10 place-items-center rounded-2xl ${visual.iconClass}`}><Icon size={18} /></span><div><h2 className="text-sm font-black uppercase tracking-wider text-slate-900">{meta.label}</h2><p className="mt-0.5 text-xs font-medium text-slate-400">{items.length} open record{items.length === 1 ? '' : 's'}</p></div></div><span className={`w-fit rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${visual.badgeClass}`}>{formatNotificationAmount(items.reduce((sum, item) => sum + item.amount, 0))}</span></div><div className="divide-y divide-slate-100">{items.map((notification) => <Link key={notification.id} href={notification.href} className="group flex items-center gap-4 px-5 py-4 transition hover:bg-slate-50"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${visual.iconClass}`}><Icon size={16} /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-black text-slate-900">{notification.title}</span><span className="mt-1 block truncate text-xs font-medium text-slate-400">{notification.description} · {formatNotificationDate(notification.date)}</span></span><span className="shrink-0 text-sm font-black text-red-600">{formatNotificationAmount(notification.amount)}</span><ArrowUpRight size={16} className="shrink-0 text-slate-300 transition group-hover:text-emerald-600" /></Link>)}</div></section>;
          })}
        </div>
      )}

      <div className="mt-7 flex items-start gap-3 rounded-2xl border border-amber-100 bg-amber-50/60 p-4 text-xs font-medium leading-5 text-amber-900/70"><AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" /><span>Pending value is a work queue total. Cheques and digital transfers may also be represented in a party balance until they are cleared.</span></div>
    </AppLayout>
  );
}
