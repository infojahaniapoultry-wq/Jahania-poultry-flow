'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import DataTable from '@/components/DataTable';
import DatePicker from '@/components/DatePicker';
import api from '@/lib/api';
import { toast } from 'react-hot-toast';
import { RefreshCw, Landmark, Search, Clock, MoreHorizontal } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { BUSINESS_DATA_UPDATED_EVENT, notifyBusinessDataUpdated } from '@/lib/business-events';
import { getCachedPageData, setCachedPageData } from '@/lib/page-cache';
import {
  ChequeRow,
  fmt,
} from '../shared';

type ChequeStatus = 'PENDING' | 'CLEARED' | 'BOUNCED';

const chequeStatusMeta: Record<ChequeStatus, { label: string; color: string; description: string }> = {
  PENDING: {
    label: 'In Hand / Pending',
    color: 'text-amber-600 bg-amber-50',
    description: 'Awaiting bank clearance',
  },
  CLEARED: {
    label: 'Cleared / Realized',
    color: 'text-emerald-600 bg-emerald-50',
    description: 'Funds credited to account',
  },
  BOUNCED: {
    label: 'Bounced / Returned',
    color: 'text-red-600 bg-red-50',
    description: 'Transaction failed',
  },
};

function getChequeOwner(row: ChequeRow) {
  if (row.sourceType === 'VOUCHER') return row.receivedFrom || 'Settlement Voucher';
  if (row.purchase?.vendor?.name) return row.purchase.vendor.name;
  if (row.invoice?.customer?.shopName) return row.invoice.customer.shopName;
  return row.receivedFrom || 'Internal Account';
}

function getChequeOrigin(row: ChequeRow) {
  if (row.sourceType === 'VOUCHER') return 'Credit settlement voucher';
  if (row.purchase && row.invoice) return `Invoice #${row.invoice.id} → Purchase #${row.purchase.id}`;
  if (row.purchase) return `Purchase #${row.purchase.id}`;
  if (row.invoice) return `Invoice #${row.invoice.id}`;
  return 'Manual Log';
}

function getChequeStateLabel(row: ChequeRow) {
  if (row.sourceType === 'VOUCHER') return { label: 'Settlement', color: 'bg-slate-50 text-slate-700' };
  if (row.purchase && row.invoice) return { label: 'Transferred', color: 'bg-amber-100 text-amber-700' };
  if (row.purchase) return { label: 'Outgoing', color: 'bg-red-50 text-red-700' };
  if (row.invoice) return { label: 'Incoming', color: 'bg-emerald-50 text-emerald-700' };
  return { label: 'Manual', color: 'bg-slate-50 text-slate-700' };
}

export default function FinanceChequesPage() {
  const { user } = useAuth();
  const canEditStatuses = user?.role === 'ADMIN';
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [cheques, setCheques] = useState<ChequeRow[]>([]);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<{ status: '' | 'PENDING' | 'CLEARED' | 'BOUNCED'; sourceType: '' | 'PURCHASE' | 'INVOICE' | 'MANUAL'; date: string }>({ status: '', sourceType: '', date: '' });
  const cacheKey = useMemo(
    () => `finance-cheques-page:${filters.status || 'ALL'}:${filters.sourceType || 'ALL'}:${filters.date || 'ALL'}`,
    [filters.date, filters.sourceType, filters.status],
  );

  const load = useCallback(async (force = false) => {
    if (!force) {
      const cached = getCachedPageData<ChequeRow[]>(cacheKey);
      if (cached) {
        setCheques(cached);
        setDrafts(Object.fromEntries(cached.map((row) => [row.id, row.status === 'PENDING' ? 'CLEARED' : row.status])));
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (filters.status) query.set('status', filters.status);
      if (filters.sourceType) query.set('sourceType', filters.sourceType);
      if (filters.date) {
        query.set('startDate', new Date(`${filters.date}T00:00:00.000+05:00`).toISOString());
        query.set('endDate', new Date(`${filters.date}T23:59:59.999+05:00`).toISOString());
      }
      const res = await api.get(`/payments/cheques?${query.toString()}`);
      const rows = res.data as ChequeRow[];
      setCheques(rows);
      setDrafts(Object.fromEntries(rows.map((row) => [row.id, row.status === 'PENDING' ? 'CLEARED' : row.status])));
      setCachedPageData(cacheKey, rows);
    } catch { toast.error('Failed to load registry'); } finally { setLoading(false); }
  }, [cacheKey, filters.date, filters.sourceType, filters.status]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const handleBusinessDataUpdated = () => {
      void load(true);
    };

    window.addEventListener(BUSINESS_DATA_UPDATED_EVENT, handleBusinessDataUpdated);
    return () => window.removeEventListener(BUSINESS_DATA_UPDATED_EVENT, handleBusinessDataUpdated);
  }, [load]);

  const visibleCheques = useMemo(() => {
    return cheques.filter(c => {
      const owner = getChequeOwner(c).toLowerCase();
      const chk = (c.chequeNo || '').toLowerCase();
      const q = searchQuery.toLowerCase();
      return owner.includes(q) || chk.includes(q);
    });
  }, [cheques, searchQuery]);

  const summary = useMemo(() => {
    return visibleCheques.reduce((acc, c) => {
      if (c.status === 'PENDING') { acc.count++; acc.val += Number(c.amount); }
      return acc;
    }, { count: 0, val: 0 });
  }, [visibleCheques]);

  const saveStatus = async (id: number) => {
    const status = drafts[id];
    if (!status) return;
    setSavingId(id);
    try {
      await api.patch(`/payments/cheques/${id}/status`, { status });
      toast.success('Status updated');
      notifyBusinessDataUpdated();
    } catch { toast.error('Update failed'); } finally { setSavingId(null); }
  };

  const columns = [
    { 
      key: 'chequeNo', 
      label: 'Document ID', 
      render: (r: ChequeRow) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500">
            <Landmark size={16} />
          </div>
          <div className="flex flex-col">
             <span className="text-sm font-black text-slate-900 tracking-tight">{r.chequeNo}</span>
             <span className="text-[10px] font-bold text-slate-400 uppercase">{r.bankName || 'Unknown Bank'}</span>
          </div>
        </div>
      )
    },
    {
      key: 'receivedFrom',
      label: 'Financial Flow',
      render: (r: ChequeRow) => {
        const state = getChequeStateLabel(r);
        return (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-800">{getChequeOwner(r)}</span>
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${state.color}`}>{state.label}</span>
            </div>
            <span className="text-[10px] font-medium text-slate-400 italic">{getChequeOrigin(r)}</span>
          </div>
        );
      }
    },
    { 
      key: 'chequeDate', 
      label: 'Due Date', 
      render: (r: ChequeRow) => (
        <div className="flex flex-col">
          <span className="text-sm font-bold text-slate-900">{new Date(r.chequeDate).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' })}</span>
          <span className="text-[10px] font-medium text-slate-400">{new Date(r.chequeDate).getFullYear()}</span>
        </div>
      )
    },
    { 
      key: 'amount', 
      label: 'Face Value', 
      align: 'right' as const, 
      render: (r: ChequeRow) => <span className="text-sm font-black text-slate-900">{fmt(r.amount)}</span> 
    },
    {
      key: 'status',
      label: 'State',
      render: (r: ChequeRow) => {
        const meta = chequeStatusMeta[r.status as ChequeStatus] || chequeStatusMeta.PENDING;
        return <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${meta.color}`}>{meta.label}</span>;
      }
    },
      {
        key: 'action',
        label: '',
        align: 'right' as const,
        render: (r: ChequeRow) => (
          <div className="flex justify-end">
           {canEditStatuses && r.status === 'PENDING' ? (
              <div className="flex items-center gap-2 p-1 bg-slate-50 border border-slate-100 rounded-xl">
                 <select className="bg-transparent border-none text-[10px] font-black uppercase outline-none px-2" value={drafts[r.id]} onChange={e => setDrafts(p => ({ ...p, [r.id]: e.target.value }))}>
                    <option value="CLEARED">Clear</option>
                    <option value="BOUNCED">Bounce</option>
                 </select>
               <button onClick={() => saveStatus(r.id)} disabled={savingId === r.id} className="px-3 py-1 bg-emerald-600 text-white rounded-lg text-[9px] font-black uppercase transition-all active:scale-95 hover:bg-emerald-700 shadow-sm shadow-emerald-100">
                 {savingId === r.id ? '...' : 'OK'}
               </button>
            </div>
          ) : (
            <button className="p-2 text-slate-300 hover:text-slate-600 hover:bg-slate-50 rounded-xl"><MoreHorizontal size={16} /></button>
          )}
        </div>
      )
    }
  ];

  return (
    <AppLayout>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight mb-2">Cheque Registry</h1>
          <p className="text-slate-500 font-medium tracking-tight">Monitor post-dated cheques, realize realized payments, and handle returns.</p>
        </div>
        <div className="flex items-center gap-3 self-start">
           <button onClick={() => load(true)} className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl transition-all active:scale-95">
             <RefreshCw size={18} />
           </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
        <div className="bg-amber-600 rounded-[32px] p-6 shadow-lg shadow-amber-100 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/20 rounded-full -mr-10 -mt-10 blur-2xl transition-transform" />
          <div className="relative z-10 flex flex-col h-full">
            <div className="flex items-center gap-2 text-amber-100/80 text-[10px] font-black uppercase tracking-widest mb-4">
              <Clock size={14} /> Total Pending Realization
            </div>
            <div className="text-3xl font-black text-white mt-auto">{fmt(summary.val)}</div>
          </div>
        </div>
        <div className="bg-white border-2 border-slate-900 rounded-[32px] p-6 shadow-sm relative overflow-hidden">
           <div className="relative z-10 flex flex-col h-full justify-center">
             <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Awaiting Clearance</div>
             <div className="text-4xl font-black text-slate-900 leading-none">{summary.count} <span className="text-xs text-slate-300">Docs</span></div>
           </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 mb-8">
        <div className="relative flex-1 group">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-900 transition-colors" />
          <input 
            className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-medium focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all shadow-sm" 
            placeholder="Search by cheque number, bank, or party..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="min-w-[220px]">
          <DatePicker value={filters.date} onChange={(date) => setFilters((current) => ({ ...current, date }))} placeholder="All cheque dates" />
        </div>
        <div className="flex p-1 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-x-auto no-scrollbar">
          {(['', 'PENDING', 'CLEARED', 'BOUNCED'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilters(p => ({ ...p, status: f }))}
              className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${filters.status === f ? 'bg-slate-900 text-white shadow-md shadow-slate-200' : 'text-slate-400 hover:text-slate-600'}`}
            >
              {f === '' ? 'Full Registry' : f}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-[32px] overflow-hidden shadow-sm animate-fade-in">
        <DataTable columns={columns} data={visibleCheques} loading={loading} emptyMessage="No cheque records found matching your filters." hideSearch />
      </div>
    </AppLayout>
  );
}
