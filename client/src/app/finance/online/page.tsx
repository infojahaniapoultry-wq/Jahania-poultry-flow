'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Smartphone, Landmark, CreditCard, Search, Clock, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import DataTable from '@/components/DataTable';
import DatePicker from '@/components/DatePicker';
import api from '@/lib/api';
import { toast } from 'react-hot-toast';
import { BUSINESS_DATA_UPDATED_EVENT, notifyBusinessDataUpdated } from '@/lib/business-events';
import { getCachedPageData, setCachedPageData } from '@/lib/page-cache';
import { useAuth } from '@/lib/auth';
import {
  fmt,
  OnlineProvider,
  OnlineRow,
  ONLINE_PROVIDER_OPTIONS,
} from '../shared';

type OnlineFilterProvider = '' | OnlineProvider;
type OnlineSourceFilter = '' | 'PURCHASE' | 'INVOICE' | 'MANUAL';

const providerMeta: Record<OnlineProvider, { label: string; color: string; icon: any }> = {
  JAZZCASH: { label: 'JazzCash', color: 'bg-red-50 text-red-700', icon: Smartphone },
  EASYPAISA: { label: 'Easypaisa', color: 'bg-emerald-50 text-emerald-700', icon: Smartphone },
  NAYAPAY: { label: 'NayaPay', color: 'bg-violet-50 text-violet-700', icon: Smartphone },
  BANK_TRANSFER: { label: 'Bank', color: 'bg-blue-50 text-blue-700', icon: Landmark },
  OTHER: { label: 'Digital', color: 'bg-slate-50 text-slate-700', icon: CreditCard },
};

function getOnlineOwner(row: OnlineRow) {
  if (row.sourceType === 'VOUCHER') return row.receivedFrom || 'Settlement Voucher';
  if (row.purchase?.vendor?.name) return row.purchase.vendor.name;
  if (row.invoice?.customer?.shopName) return row.invoice.customer.shopName;
  return row.receivedFrom || 'Manual Entry';
}

function getOnlineOrigin(row: OnlineRow) {
  if (row.sourceType === 'VOUCHER') return 'Credit settlement voucher';
  if (row.purchase) return `Purchase #${row.purchase.id}`;
  if (row.invoice) return `Invoice #${row.invoice.id}`;
  return row.sourceType || 'Manual';
}

export default function FinanceOnlinePage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [rows, setRows] = useState<OnlineRow[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<{ provider: OnlineFilterProvider; sourceType: OnlineSourceFilter; startDate: string; endDate: string; }>({ provider: '', sourceType: '', startDate: '', endDate: '' });
  const cacheKey = useMemo(
    () => `finance-online-page:${filters.provider || 'ALL'}:${filters.sourceType || 'ALL'}:${filters.startDate || 'ALL'}:${filters.endDate || 'ALL'}`,
    [filters.endDate, filters.provider, filters.sourceType, filters.startDate],
  );

  const load = useCallback(async (force = false) => {
    if (!force) {
      const cached = getCachedPageData<{ rows: OnlineRow[] }>(cacheKey);
      if (cached) {
        setRows(cached.rows);
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (filters.provider) query.set('provider', filters.provider);
      if (filters.sourceType) query.set('sourceType', filters.sourceType);
      if (filters.startDate) query.set('startDate', `${filters.startDate}T00:00:00.000+05:00`);
      if (filters.endDate) query.set('endDate', `${filters.endDate}T23:59:59.999+05:00`);
      const res = await api.get(`/payments/online?${query.toString()}`);
      const data = res.data as OnlineRow[];
      setRows(data);
      setCachedPageData(cacheKey, { rows: data });
    } catch { toast.error('Failed to load transfers'); } finally { setLoading(false); }
  }, [cacheKey, filters]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const handleBusinessDataUpdated = () => {
      void load(true);
    };

    window.addEventListener(BUSINESS_DATA_UPDATED_EVENT, handleBusinessDataUpdated);
    return () => window.removeEventListener(BUSINESS_DATA_UPDATED_EVENT, handleBusinessDataUpdated);
  }, [load]);

  const visibleRows = useMemo(() => {
    return rows.filter(r => {
      const owner = getOnlineOwner(r).toLowerCase();
      const ref = (r.referenceNo || '').toLowerCase();
      const q = searchQuery.toLowerCase();
      return owner.includes(q) || ref.includes(q);
    });
  }, [rows, searchQuery]);

  const summary = useMemo(() => {
    return visibleRows.reduce((acc, r) => {
      if (r.status === 'PENDING') {
        acc.count++;
        acc.val += Number(r.amount);
      }
      return acc;
    }, { count: 0, val: 0 });
  }, [visibleRows]);

  const updateStatus = async (row: OnlineRow, status: 'COMPLETED' | 'FAILED') => {
    if (user?.role !== 'ADMIN' || row.status !== 'PENDING') return;
    const actionLabel = status === 'COMPLETED' ? 'clear' : 'mark as failed';
    if (!window.confirm(`Confirm ${actionLabel} for ${fmt(row.amount)} (${row.referenceNo || 'no reference'})?`)) return;

    setUpdatingId(row.id);
    try {
      await api.patch(`/payments/online/${row.id}/status`, { status });
      toast.success(status === 'COMPLETED' ? 'Online payment cleared' : 'Online payment marked as failed');
      notifyBusinessDataUpdated();
      await load(true);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Online payment status could not be updated');
    } finally {
      setUpdatingId(null);
    }
  };

  const columns = [
    {
      key: 'provider',
      label: 'Network',
      render: (r: OnlineRow) => {
        const meta = providerMeta[r.provider as OnlineProvider] || providerMeta.OTHER;
        const Icon = meta.icon;
        return (
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${meta.color} shadow-sm`}>
              <Icon size={16} />
            </div>
            <span className="text-xs font-black uppercase tracking-widest">{meta.label}</span>
          </div>
        );
      }
    },
    {
      key: 'receivedFrom',
      label: 'Flow Logic',
      render: (r: OnlineRow) => (
        <div className="flex flex-col">
          <span className="text-sm font-bold text-slate-900 leading-tight">{getOnlineOwner(r)}</span>
          <span className="text-[10px] font-medium text-slate-400 italic">Linked: {getOnlineOrigin(r)}</span>
        </div>
      )
    },
    { key: 'referenceNo', label: 'Reference ID', render: (r: OnlineRow) => <span className="text-xs font-bold text-slate-600 font-mono tracking-tight">{r.referenceNo || '—'}</span> },
    { key: 'amount', label: 'Net Value', align: 'right' as const, render: (r: OnlineRow) => <span className="text-sm font-black text-slate-900">{fmt(r.amount)}</span> },
    {
      key: 'status',
      label: 'Status',
      render: (r: OnlineRow) => {
        const status = (r.status || 'PENDING').toUpperCase();
        const isPending = status === 'PENDING';
        const isBusy = updatingId === r.id;
        const meta = status === 'COMPLETED'
          ? { label: 'Cleared', className: 'text-emerald-700 bg-emerald-50', note: 'Funds posted to ledger' }
          : status === 'FAILED'
            ? { label: 'Failed', className: 'text-red-700 bg-red-50', note: 'Source balance reopened' }
            : { label: 'Pending', className: 'text-amber-700 bg-amber-50', note: 'Awaiting transfer confirmation' };
        return (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-col">
              <span className={`inline-flex w-fit rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-widest ${meta.className}`}>{meta.label}</span>
              <span className="mt-0.5 text-[9px] font-medium text-slate-400">{meta.note}</span>
            </div>
            {isPending && user?.role === 'ADMIN' && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void updateStatus(r, 'COMPLETED')}
                  title="Confirm funds received or sent"
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-white transition hover:bg-emerald-700 disabled:opacity-50"
                >
                  {isBusy ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                  Clear
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void updateStatus(r, 'FAILED')}
                  title="Mark transfer as failed and reopen the balance"
                  className="rounded-lg p-1 text-red-500 transition hover:bg-red-50 disabled:opacity-50"
                >
                  <XCircle size={15} />
                </button>
              </div>
            )}
          </div>
        );
      },
    },
  ];

  const pendingLabel = summary.count === 1 ? 'TRANSFER' : 'TRANSFERS';

  return (
    <AppLayout>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight mb-2">Digital Clearing</h1>
          <p className="text-slate-500 font-medium tracking-tight">Confirm online transfers after you verify the money has arrived or been sent.</p>
        </div>
        <div className="flex items-center gap-3 self-start">
           <button onClick={() => load(true)} className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl transition-all active:scale-95">
             <RefreshCw size={18} />
           </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
        <div className="bg-emerald-600 rounded-[32px] p-6 shadow-lg shadow-emerald-100 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/20 rounded-full -mr-10 -mt-10 blur-2xl transition-transform" />
          <div className="relative z-10 flex flex-col h-full">
            <div className="flex items-center gap-2 text-emerald-100/80 text-[10px] font-black uppercase tracking-widest mb-4">
              <Clock size={14} /> Pending Digital Funds
            </div>
            <div className="text-3xl font-black text-white mt-auto">{fmt(summary.val)}</div>
          </div>
        </div>
        
        <div className="bg-white border-2 border-slate-900 rounded-[32px] p-6 shadow-sm relative overflow-hidden">
           <div className="relative z-10 flex flex-col h-full justify-center">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Awaiting Confirmation</div>
             <div className="text-4xl font-black text-slate-900 leading-none">{summary.count} <span className="text-xs text-slate-300 tracking-widest">{pendingLabel}</span></div>
           </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-8 bg-white border border-slate-200 p-2 rounded-3xl shadow-sm">
        <select className="px-4 py-2 bg-slate-50 border border-slate-100 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-600 outline-none" value={filters.provider} onChange={e => setFilters(p => ({ ...p, provider: e.target.value as any }))}>
          <option value="">All Networks</option>{ONLINE_PROVIDER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <div className="flex items-center bg-slate-50 border border-slate-100 rounded-2xl px-2">
           <DatePicker value={filters.startDate} onChange={d => setFilters(p => ({ ...p, startDate: d }))} />
           <span className="text-[10px] font-black text-slate-300 px-1">TO</span>
           <DatePicker value={filters.endDate} onChange={d => setFilters(p => ({ ...p, endDate: d }))} />
        </div>
        <div className="flex-1 min-w-[200px] relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            className="w-full pl-11 pr-4 py-2 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold outline-none" 
            placeholder="Search reference number or party..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-[32px] overflow-hidden shadow-sm animate-fade-in">
        <DataTable columns={columns} data={visibleRows} loading={loading} emptyMessage="No digital transfer records found for these filters." hideSearch />
      </div>
    </AppLayout>
  );
}
