'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import DataTable from '@/components/DataTable';
import Modal from '@/components/Modal';
import api from '@/lib/api';
import { toast } from 'react-hot-toast';
import { BUSINESS_DATA_UPDATED_EVENT, notifyBusinessDataUpdated } from '@/lib/business-events';
import { getCachedPageData, setCachedPageData } from '@/lib/page-cache';
import { Plus, RefreshCw, Search, ArrowUpRight, ArrowDownLeft, Wallet, Landmark, Loader2, MoreVertical, FileText, Truck, ShoppingBag, Banknote } from 'lucide-react';
import DatePicker from '@/components/DatePicker';
import { ONLINE_PROVIDER_OPTIONS } from '../finance/shared';

interface Customer { id: number; shopName: string; }
interface Vendor { id: number; name: string; }
interface Driver { id: number; name: string; }
interface ExpenseAccount { id: number; name: string; category?: string; isActive?: boolean; _count?: { entries?: number } }
interface TransactionsCache {
  rows: TransactionRow[];
  customers: Customer[];
  vendors: Vendor[];
  drivers: Driver[];
  accounts: ExpenseAccount[];
}
interface TransactionRow {
  id: string;
  sourceType: string;
  sourceId: number;
  date: string;
  createdAt?: string | null;
  totalAmount?: string | number;
  settledAmount?: string | number;
  partyName?: string | null;
  driverName?: string | null;
  amount: string;
  paymentMode?: string | null;
  paymentStatus?: string | null;
  reference?: string | null;
  narration?: string | null;
  generated: boolean;
  readOnly: boolean;
}

function getStatusLabel(row: TransactionRow) {
  const status = (row.paymentStatus ?? '').toUpperCase();
  const sourceType = (row.sourceType ?? '').toUpperCase();
  const settled = Number(row.settledAmount ?? 0);
  const total = Number(row.totalAmount ?? row.amount ?? 0);

  if (sourceType === 'DRIVER_SETTLEMENT' && status === 'COMPLETED') return 'Fleet Cleared';
  if (sourceType === 'DRIVER_CHARGE' && status === 'COMPLETED') return 'Cost Paid';
  if (status === 'COMPLETED') return 'Cleared';
  if (settled > 0 && total > 0 && settled < total) return 'Partial';
  if (settled > total) return 'Overpaid';
  if (status === 'OUTSTANDING') return 'Unpaid';
  if (status === 'BOUNCED') return 'Bounced';
  if (status === 'FAILED') return 'Failed';
  if (status === 'PENDING') return 'Processing';
  return row.paymentStatus ?? '—';
}

function getStatusColor(row: TransactionRow) {
  const status = (row.paymentStatus ?? '').toUpperCase();
  if (status === 'COMPLETED') return 'text-emerald-600 bg-emerald-50';
  if (status === 'OUTSTANDING') return 'text-amber-600 bg-amber-50';
  if (status === 'BOUNCED' || status === 'FAILED') return 'text-red-600 bg-red-50';
  if (status === 'PENDING') return 'text-slate-500 bg-slate-50';
  return 'text-blue-600 bg-blue-50';
}

const fmt = (n: string | number) => 'Rs. ' + Number(n ?? 0).toLocaleString('en-PK');

const getPKTDate = () => {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Karachi' }));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const today = getPKTDate();

export default function TransactionsPage() {
  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [accounts, setAccounts] = useState<ExpenseAccount[]>([]);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountSaving, setAccountSaving] = useState(false);
  const [accountForm, setAccountForm] = useState({ name: '', category: '' });
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({ type: '', mode: '', status: '', startDate: today, endDate: today });
  const [form, setForm] = useState({
    type: 'EXPENSE',
    date: today,
    amount: '',
    paymentMode: 'CASH',
    paymentProvider: 'JAZZCASH',
    paymentReference: '',
    expenseAccountId: '',
    voucherType: 'RECOVERY',
    customerId: '',
    vendorId: '',
    driverId: '',
    reference: '',
    narration: '',
    purpose: '',
    voucherRef: '',
  });
  const cacheKey = useMemo(
    () => `transactions-page:${filters.type || 'ALL'}:${filters.startDate || 'ALL'}:${filters.endDate || 'ALL'}`,
    [filters.endDate, filters.startDate, filters.type],
  );

  const load = useCallback(async (force = false) => {
    if (!force) {
      const cached = getCachedPageData<TransactionsCache>(cacheKey);
      if (cached) {
        setRows(cached.rows);
        setCustomers(cached.customers);
        setVendors(cached.vendors);
        setDrivers(cached.drivers);
        setAccounts(cached.accounts);
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (filters.type) query.set('type', filters.type);
      if (filters.startDate) query.set('startDate', new Date(`${filters.startDate}T00:00:00.000+05:00`).toISOString());
      if (filters.endDate) query.set('endDate', new Date(`${filters.endDate}T23:59:59.999+05:00`).toISOString());
      const [txRes, customerRes, vendorRes, driverRes, accountRes] = await Promise.all([
        api.get(`/payments/transactions?${query.toString()}`),
        api.get('/customers'),
        api.get('/vendors'),
        api.get('/drivers'),
        api.get('/expenses/accounts'),
      ]);
      setRows(txRes.data);
      setCustomers(customerRes.data);
      setVendors(vendorRes.data);
      setDrivers(driverRes.data);
      setAccounts(accountRes.data);
      setCachedPageData(cacheKey, {
        rows: txRes.data,
        customers: customerRes.data,
        vendors: vendorRes.data,
        drivers: driverRes.data,
        accounts: accountRes.data,
      });
    } catch {
      toast.error('Failed to load ledger data');
    } finally {
      setLoading(false);
    }
  }, [cacheKey, filters.endDate, filters.startDate, filters.type]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const handleBusinessDataUpdated = () => {
      void load(true);
    };

    window.addEventListener(BUSINESS_DATA_UPDATED_EVENT, handleBusinessDataUpdated);
    return () => window.removeEventListener(BUSINESS_DATA_UPDATED_EVENT, handleBusinessDataUpdated);
  }, [load]);

  const saveEntry = async () => {
    if (!form.amount) { toast.error('Value required'); return; }
    setSaving(true);
    try {
      if (form.type === 'EXPENSE') {
        if (!form.expenseAccountId) { toast.error('Select account'); setSaving(false); return; }
        await api.post('/expenses', { date: new Date(`${form.date}T12:00:00+05:00`).toISOString(), expenseAccountId: Number(form.expenseAccountId), amount: Number(form.amount), paymentMode: form.paymentMode, paymentProvider: form.paymentMode === 'ONLINE' ? form.paymentProvider : undefined, paymentReference: form.paymentMode === 'ONLINE' ? form.paymentReference : undefined, narration: form.narration || undefined, voucherRef: form.voucherRef || undefined });
      } else if (form.type === 'VOUCHER') {
        await api.post('/vouchers', { type: form.voucherType, date: new Date(`${form.date}T12:00:00+05:00`).toISOString(), amount: Number(form.amount), paymentMode: form.paymentMode, paymentProvider: form.paymentMode === 'ONLINE' ? form.paymentProvider : undefined, paymentReference: form.paymentMode === 'ONLINE' ? form.paymentReference : undefined, customerId: form.customerId ? Number(form.customerId) : undefined, vendorId: form.vendorId ? Number(form.vendorId) : undefined, reference: form.reference || undefined, narration: form.narration || undefined });
      } else if (form.type === 'TRANSPORT') {
        if (!form.driverId) { toast.error('Select driver'); setSaving(false); return; }
        await api.post('/transport/advances', { date: new Date(`${form.date}T12:00:00+05:00`).toISOString(), driverId: Number(form.driverId), amount: Number(form.amount), paymentMode: form.paymentMode, paymentProvider: form.paymentMode === 'ONLINE' ? form.paymentProvider : undefined, paymentReference: form.paymentMode === 'ONLINE' ? form.paymentReference : undefined, purpose: form.purpose || undefined, voucherRef: form.voucherRef || undefined });
      }
      toast.success('Ledger updated');
      setOpen(false);
      notifyBusinessDataUpdated();
    } catch { toast.error('Save failed'); } finally { setSaving(false); }
  };

  const visibleRows = useMemo(() => {
    return rows.filter((row) => {
      const query = searchQuery.trim().toLowerCase();
      if (query) {
        const searchableText = [
          row.partyName,
          row.driverName,
          row.reference,
          row.narration,
          row.sourceType,
          row.paymentMode,
        ].filter(Boolean).join(' ').toLowerCase();
        if (!searchableText.includes(query)) return false;
      }
      if (filters.mode && (row.paymentMode ?? '').toUpperCase() !== filters.mode) return false;
      if (filters.status && (row.paymentStatus ?? '').toUpperCase() !== filters.status) return false;
      return true;
    });
  }, [filters.mode, filters.status, rows, searchQuery]);

  const summary = useMemo(() => {
    return visibleRows.reduce((acc, r) => {
      const amt = Number(r.amount);
      const isOut = ['EXPENSE', 'TRANSPORT_ADVANCE', 'PURCHASE'].includes(r.sourceType);
      if (isOut) acc.out += amt; else acc.in += amt;
      return acc;
    }, { in: 0, out: 0 });
  }, [visibleRows]);

  const columns = [
    { 
      key: 'date', 
      label: 'Timeline', 
      sortable: true, 
      render: (r: TransactionRow) => (
        <div className="flex flex-col">
          <span className="text-sm font-bold text-slate-900">{new Date(r.date).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' })}</span>
          <span className="text-[10px] font-medium text-slate-400 uppercase">{new Date(r.date).getFullYear()}</span>
        </div>
      ) 
    },
    { 
      key: 'sourceType', 
      label: 'Channel', 
      render: (r: TransactionRow) => {
        const icons: Record<string, any> = { PURCHASE: <ShoppingBag />, INVOICE: <FileText />, EXPENSE: <Banknote />, TRANSPORT_ADVANCE: <Truck />, DRIVER_CHARGE: <Truck />, DRIVER_SETTLEMENT: <Truck /> };
        return (
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${r.generated ? 'bg-slate-50 text-slate-400' : 'bg-emerald-50 text-emerald-600'}`}>
              {icons[r.sourceType] || <ArrowUpRight size={14} />}
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-black text-slate-700 uppercase tracking-tight">{r.sourceType.replace(/_/g, ' ')}</span>
              {r.generated && <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">Auto-Gen</span>}
            </div>
          </div>
        );
      } 
    },
    { 
      key: 'partyName', 
      label: 'Stakeholder', 
      render: (r: TransactionRow) => (
        <div className="flex flex-col">
          <span className="text-sm font-bold text-slate-900">{r.partyName || r.driverName || 'Internal Account'}</span>
          <span className="text-[10px] font-medium text-slate-400">{r.reference || 'No Ref Linked'}</span>
        </div>
      ) 
    },
    { 
      key: 'amount', 
      label: 'Valuation', 
      align: 'right' as const, 
      render: (r: TransactionRow) => (
        <div className="flex flex-col items-end">
          <span className={`text-sm font-black ${['EXPENSE', 'TRANSPORT_ADVANCE', 'PURCHASE'].includes(r.sourceType) ? 'text-red-600' : 'text-emerald-600'}`}>
            {fmt(r.amount)}
          </span>
          <span className="text-[10px] font-bold text-slate-300 uppercase tracking-tighter">{r.paymentMode || 'Udhar'}</span>
        </div>
      ) 
    },
    { 
      key: 'paymentStatus', 
      label: 'State', 
      render: (r: TransactionRow) => (
        <div className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${getStatusColor(r)}`}>
          {getStatusLabel(r)}
        </div>
      ) 
    },
    {
      key: 'actions',
      label: '',
      align: 'right' as const,
      render: () => (
        <div className="flex justify-end">
           <button className="p-2 text-slate-300 hover:text-slate-600 hover:bg-slate-50 rounded-xl"><MoreVertical size={16} /></button>
        </div>
      )
    }
  ];

  return (
    <AppLayout>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight mb-2">Financial Ledger</h1>
          <p className="text-slate-500 font-medium tracking-tight">Consolidated view of all cash flows, bank transfers, and manual adjustments.</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setAccountOpen(true)} className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-2xl font-bold text-sm shadow-sm hover:bg-slate-50 transition-all active:scale-95">
            <Wallet size={18} /> Accounts
          </button>
          <button onClick={() => setOpen(true)} className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold text-sm shadow-lg shadow-emerald-200 transition-all active:scale-95">
            <Plus size={18} /> New Entry
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <div className="bg-emerald-600 rounded-[32px] p-6 shadow-lg shadow-emerald-100 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/20 rounded-full -mr-10 -mt-10 blur-2xl group-hover:scale-125 transition-transform" />
          <div className="relative z-10 flex flex-col h-full">
            <div className="flex items-center gap-2 text-emerald-100/80 text-[10px] font-black uppercase tracking-widest mb-4">
              <ArrowDownLeft size={14} /> Recovery & Income
            </div>
            <div className="text-3xl font-black text-white mt-auto">{fmt(summary.in)}</div>
          </div>
        </div>
        <div className="bg-red-600 rounded-[32px] p-6 shadow-lg shadow-red-100 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/20 rounded-full -mr-10 -mt-10 blur-2xl group-hover:scale-125 transition-transform" />
          <div className="relative z-10 flex flex-col h-full">
            <div className="flex items-center gap-2 text-red-100/80 text-[10px] font-black uppercase tracking-widest mb-4">
              <ArrowUpRight size={14} /> Spend & Costs
            </div>
            <div className="text-3xl font-black text-white mt-auto">{fmt(summary.out)}</div>
          </div>
        </div>
        <div className="bg-white border-2 border-slate-900 rounded-[32px] p-6 shadow-sm relative overflow-hidden">
          <div className="relative z-10 flex flex-col h-full">
            <div className="flex items-center gap-2 text-slate-400 text-[10px] font-black uppercase tracking-widest mb-4">
              <Landmark size={14} /> Net Operational Cash
            </div>
            <div className="text-3xl font-black text-slate-900 mt-auto">{fmt(summary.in - summary.out)}</div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-3xl p-2 mb-8 shadow-sm flex flex-wrap gap-2">
        <div className="flex-1 min-w-[200px] relative group">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-900 transition-colors" />
          <input
            className="w-full pl-11 pr-4 py-2 bg-slate-50 rounded-2xl text-xs font-bold focus:bg-white outline-none transition-all"
            placeholder="Search by party or reference..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>
        <select className="px-4 py-2 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-black uppercase tracking-widest text-slate-600 outline-none focus:bg-white" value={filters.type} onChange={e => setFilters(p => ({ ...p, type: e.target.value }))}>
          <option value="">Nature: All</option>
          <option value="PURCHASE">Purchases</option><option value="INVOICE">Sales</option><option value="EXPENSE">Expenses</option><option value="VOUCHER">Vouchers</option><option value="TRANSPORT_ADVANCE">Fleet</option>
        </select>
        <select className="px-4 py-2 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-black uppercase tracking-widest text-slate-600 outline-none focus:bg-white" value={filters.status} onChange={e => setFilters(p => ({ ...p, status: e.target.value }))}>
          <option value="">State: All</option>
          <option value="COMPLETED">Cleared</option><option value="PENDING">Awaiting</option><option value="OUTSTANDING">Unpaid</option>
        </select>
        <div className="flex items-center bg-slate-50 border border-slate-100 rounded-2xl px-2">
           <DatePicker value={filters.startDate} onChange={d => setFilters(p => ({ ...p, startDate: d }))} />
           <span className="text-[10px] font-black text-slate-300 px-1">TO</span>
           <DatePicker value={filters.endDate} onChange={d => setFilters(p => ({ ...p, endDate: d }))} />
        </div>
        <button onClick={() => load(true)} className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl transition-all active:scale-95"><RefreshCw size={18} /></button>
      </div>

      <div className="bg-white border border-slate-200 rounded-[32px] overflow-hidden shadow-sm animate-fade-in">
        <DataTable columns={columns} data={visibleRows} loading={loading} emptyMessage="No transactions found for these filters." defaultSortKey="date" defaultSortDirection="desc" />
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Create Financial Entry" size="lg"
        footer={(
          <>
            <button className="px-5 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors" onClick={() => setOpen(false)}>Cancel</button>
            <button className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold text-sm shadow-lg shadow-emerald-200 transition-all flex items-center gap-2" onClick={saveEntry} disabled={saving}>{saving && <Loader2 size={16} className="animate-spin" />} Commit Transaction</button>
          </>
        )}>
        <div className="space-y-8">
           <div className="flex p-1 bg-slate-100 rounded-2xl max-w-fit mx-auto">
             {(['EXPENSE', 'TRANSPORT'] as const).map(t => (
               <button key={t} onClick={() => setForm(p => ({ ...p, type: t }))} className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${form.type === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>{t}</button>
             ))}
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
             <div className="space-y-6">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1">Monetary Value *</label>
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400 uppercase">Rs.</div>
                    <input type="number" className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-lg font-black focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} placeholder="0.00" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1">Payment Channel</label>
                  <select className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold" value={form.paymentMode} onChange={e => setForm(p => ({ ...p, paymentMode: e.target.value }))}>
                    <option value="CASH">Liquid Cash</option>
                    <option value="ONLINE">Digital Transfer</option>
                  </select>
                </div>
                {form.paymentMode === 'ONLINE' && (
                  <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase">Gateway</label>
                      <select className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none" value={form.paymentProvider} onChange={e => setForm(p => ({ ...p, paymentProvider: e.target.value }))}>
                        {ONLINE_PROVIDER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase">Ref ID</label>
                      <input className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none" value={form.paymentReference} onChange={e => setForm(p => ({ ...p, paymentReference: e.target.value }))} placeholder="Txn ID" />
                    </div>
                  </div>
                )}
             </div>

             <div className="space-y-6">
                {form.type === 'EXPENSE' && (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1">Expenditure Account</label>
                      <select className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold" value={form.expenseAccountId} onChange={e => setForm(p => ({ ...p, expenseAccountId: e.target.value }))}>
                        <option value="">Select Target Account</option>
                        {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1">Voucher #</label>
                      <input className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold" value={form.voucherRef} onChange={e => setForm(p => ({ ...p, voucherRef: e.target.value }))} placeholder="Optional Ref" />
                    </div>
                  </>
                )}
                {form.type === 'VOUCHER' && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1">Voucher Action</label>
                        <select className="w-full px-3 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-black uppercase" value={form.voucherType} onChange={e => setForm(p => ({ ...p, voucherType: e.target.value }))}>
                          <option value="RECOVERY">Recovery</option><option value="CREDIT">Credit</option><option value="DEBIT">Debit</option><option value="PURCHASE">Purchase</option>
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1">Party Entity</label>
                        {['RECOVERY', 'CREDIT'].includes(form.voucherType) ? (
                          <select className="w-full px-3 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold" value={form.customerId} onChange={e => setForm(p => ({ ...p, customerId: e.target.value, vendorId: '' }))}>
                            <option value="">Customer...</option>
                            {customers.map(c => <option key={c.id} value={c.id}>{c.shopName}</option>)}
                          </select>
                        ) : (
                          <select className="w-full px-3 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold" value={form.vendorId} onChange={e => setForm(p => ({ ...p, vendorId: e.target.value, customerId: '' }))}>
                            <option value="">Vendor...</option>
                            {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                          </select>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1">Official Reference</label>
                      <input className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold" value={form.reference} onChange={e => setForm(p => ({ ...p, reference: e.target.value }))} placeholder="Cheque # or Ledger ID" />
                    </div>
                  </>
                )}
                {form.type === 'TRANSPORT' && (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1">Fleet Driver</label>
                      <select className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold" value={form.driverId} onChange={e => setForm(p => ({ ...p, driverId: e.target.value }))}>
                        <option value="">Select Driver</option>
                        {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1">Usage / Purpose</label>
                      <input className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold" value={form.purpose} onChange={e => setForm(p => ({ ...p, purpose: e.target.value }))} placeholder="Fuel, Trip, Repair..." />
                    </div>
                  </>
                )}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1">Brief Description</label>
                  <textarea className="w-full px-4 py-2 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-medium focus:bg-white outline-none resize-none" rows={2} value={form.narration} onChange={e => setForm(p => ({ ...p, narration: e.target.value }))} placeholder="Optional notes for auditing..." />
                </div>
             </div>
           </div>
        </div>
      </Modal>

      <Modal open={accountOpen} onClose={() => setAccountOpen(false)} title="System Accounts" size="lg"
        footer={(<button className="px-5 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors" onClick={() => setAccountOpen(false)}>Close</button>)}>
        <div className="space-y-8">
           <div className="p-6 bg-slate-50 border border-slate-100 rounded-3xl space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center"><Plus size={16} /></div>
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-900">Define New Category</h3>
              </div>
              <form className="flex gap-4 items-end" onSubmit={async e => {
                e.preventDefault();
                if (!accountForm.name) return;
                setAccountSaving(true);
                try { await api.post('/expenses/accounts', accountForm); toast.success('Account Ready'); setAccountForm({ name: '', category: '' }); notifyBusinessDataUpdated(); } catch { toast.error('Error'); } finally { setAccountSaving(false); }
              }}>
                <div className="flex-1 space-y-1">
                   <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Account Label</label>
                   <input className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none" value={accountForm.name} onChange={e => setAccountForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Workshop Repairs" />
                </div>
                <div className="flex-1 space-y-1">
                   <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Classification</label>
                   <input className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none" value={accountForm.category} onChange={e => setAccountForm(p => ({ ...p, category: e.target.value }))} placeholder="e.g. Maintenance" />
                </div>
                <button type="submit" disabled={accountSaving} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest h-[38px] shadow-md shadow-emerald-100 transition-all">{accountSaving ? '...' : 'Create'}</button>
              </form>
           </div>

           <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
             <DataTable 
                columns={[
                  { key: 'name', label: 'Title', render: (r: ExpenseAccount) => <span className="font-bold text-slate-900">{r.name}</span> },
                  { key: 'category', label: 'Classification', render: (r: ExpenseAccount) => <span className="px-2 py-0.5 bg-slate-50 rounded text-[10px] font-black text-slate-400 uppercase tracking-widest">{r.category || 'General'}</span> },
                  { key: '_count', label: 'Total Entries', align: 'center', render: (r: ExpenseAccount) => <span className="font-black text-slate-400">{r._count?.entries ?? 0}</span> }
                ]} 
                data={accounts} 
                emptyMessage="No customized accounts created." 
                defaultPageSize={5}
             />
           </div>
        </div>
      </Modal>
    </AppLayout>
  );
}
