'use client';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import DataTable from '@/components/DataTable';
import Modal from '@/components/Modal';
import { useAuth } from '@/lib/auth';
import api from '@/lib/api';
import { getCachedPageData, setCachedPageData } from '@/lib/page-cache';
import { toast } from 'react-hot-toast';
import { Plus, BookOpen, Pencil, Phone, MapPin, Loader2, Search, CheckCircle2, XCircle, Package, CalendarDays, RotateCcw, WalletCards } from 'lucide-react';
import { BUSINESS_DATA_UPDATED_EVENT, notifyBusinessDataUpdated } from '@/lib/business-events';
import { isPhoneNumberLike, toOptionalPhoneNumber } from '@/lib/phone';
import { formatLedgerRate, formatLedgerWeight, LedgerCommodityFields } from '@/lib/ledger';
import { VOICEPLS_URL } from '@/lib/branding';
import DatePicker from '@/components/DatePicker';

interface Vendor {
  id: number; 
  name: string; 
  contact?: string;
  address?: string; 
  openingBalance: string; 
  currentBalance: string; 
  isActive: boolean;
}

interface LedgerEntry extends LedgerCommodityFields {
  id: number; 
  date: string; 
  type: string;
  amount: string; 
  runningBalance: string; 
  narration?: string; 
  referenceType?: string;
  referenceId?: number;
  paymentMode?: string;
  paymentStatus?: string;
  balanceEffect?: 'CREDIT' | 'DEBIT' | 'SETTLED';
  balanceAmount?: number;
}

interface LedgerSummary {
  vendor: Vendor;
  openingBalance: string | number;
  closingBalance: string | number;
  entries: LedgerEntry[];
}

const fmt = (n: string | number) => 'Rs. ' + Number(n ?? 0).toLocaleString('en-PK');
const emptyForm = { name: '', contact: '', address: '', openingBalance: '0' };
const CACHE_KEY = 'vendors-page';

function formatLedgerNarration(row: LedgerEntry) {
  if (row.referenceType === 'PURCHASE' && row.narration?.startsWith('Purchase from ')) return row.narration;
  if (row.referenceType === 'PURCHASE_PAYMENT') return row.narration || 'Purchase payment';
  return row.narration || '—';
}

export default function VendorsPage() {
  const { user } = useAuth();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editVendor, setEditVendor] = useState<Vendor | null>(null);
  const [ledgerVendor, setLedgerVendor] = useState<Vendor | null>(null);
  const [ledger, setLedger] = useState<LedgerSummary | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const ledgerCacheRef = useRef<Record<string, LedgerSummary>>({});
  const [ledgerDate, setLedgerDate] = useState('');
  const [ledgerAppliedDate, setLedgerAppliedDate] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [statusSavingId, setStatusSavingId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const load = useCallback(async (force = false) => {
    if (!force) {
      const cached = getCachedPageData<Vendor[]>(CACHE_KEY);
      if (cached) {
        setVendors(cached);
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    try { 
      const r = await api.get('/vendors'); 
      setVendors(r.data); 
      setCachedPageData(CACHE_KEY, r.data);
    } catch { 
      toast.error('Failed to load vendors'); 
    } finally { 
      setLoading(false); 
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openLedger = useCallback(async (v: Vendor, date = ledgerAppliedDate, force = false) => {
    setLedgerVendor(v);

    const cacheKey = `${v.id}:${date}`;
    const cached = ledgerCacheRef.current[cacheKey];
    if (!force && cached) {
      setLedger(cached);
      setLedgerLoading(false);
      return;
    }

    setLedger(null);
    setLedgerLoading(true);
    try {
      const params = new URLSearchParams();
      if (date) {
        params.set('startDate', date);
        params.set('endDate', date);
      }
      const r = await api.get(`/vendors/${v.id}/ledger?${params.toString()}`);
      const statement: LedgerSummary = { ...r.data, entries: r.data.ledger ?? [] };
      if (statement.entries.length > 0) {
        ledgerCacheRef.current[cacheKey] = statement;
      } else {
        delete ledgerCacheRef.current[cacheKey];
      }
      setLedger(statement);
    } catch {
      toast.error('Failed to load ledger');
    } finally {
      setLedgerLoading(false);
    }
  }, [ledgerAppliedDate]);

  useEffect(() => {
    const handleBusinessDataUpdated = () => {
      ledgerCacheRef.current = {};
      void load(true);
      if (ledgerVendor) {
        void openLedger(ledgerVendor, ledgerAppliedDate);
      }
    };

    window.addEventListener(BUSINESS_DATA_UPDATED_EVENT, handleBusinessDataUpdated);
    return () => window.removeEventListener(BUSINESS_DATA_UPDATED_EVENT, handleBusinessDataUpdated);
  }, [ledgerAppliedDate, ledgerVendor, load, openLedger]);

  const openEdit = (v: Vendor) => {
    setEditVendor(v);
    setForm({ name: v.name, contact: v.contact ?? '', address: v.address ?? '', openingBalance: v.openingBalance });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) { toast.error('Vendor name required'); return; }
    if (form.contact && !isPhoneNumberLike(form.contact)) { toast.error('Enter a valid contact number'); return; }
    setSaving(true);
    try {
      await api.post('/vendors', { name: form.name, contact: toOptionalPhoneNumber(form.contact), address: form.address || undefined, openingBalance: Number(form.openingBalance) });
      toast.success('Vendor registered!'); 
      setCreateOpen(false); 
      setForm(emptyForm); 
      notifyBusinessDataUpdated();
    } catch (err: any) { 
      toast.error(err.response?.data?.message || 'Failed to save'); 
    } finally { 
      setSaving(false); 
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editVendor) return;
    if (form.contact && !isPhoneNumberLike(form.contact)) { toast.error('Enter a valid contact number'); return; }
    const openingBalance = Number(form.openingBalance);
    if (!Number.isFinite(openingBalance)) { toast.error('Enter a valid opening balance'); return; }
    setSaving(true);
    try {
      await api.patch(`/vendors/${editVendor.id}`, {
        name: form.name,
        contact: toOptionalPhoneNumber(form.contact),
        address: form.address || undefined,
        openingBalance,
      });
      toast.success('Vendor profile and opening balance updated!');
      setEditVendor(null); 
      setForm(emptyForm); 
      notifyBusinessDataUpdated();
    } catch { 
      toast.error('Update failed'); 
    } finally { 
      setSaving(false); 
    }
  };

  const toggleStatus = async (vendor: Vendor) => {
    setStatusSavingId(vendor.id);
    try {
      await api.patch(`/vendors/${vendor.id}`, { isActive: !vendor.isActive });
      toast.success(vendor.isActive ? 'Vendor deactivated' : 'Vendor reactivated');
      notifyBusinessDataUpdated();
    } catch {
      toast.error('Status update failed');
    } finally {
      setStatusSavingId(null);
    }
  };

  const visibleVendors = useMemo(() => {
    return vendors.filter((v) => {
      const matchesStatus = statusFilter === 'ALL' || (statusFilter === 'ACTIVE' ? v.isActive : !v.isActive);
      const matchesSearch = v.name.toLowerCase().includes(searchQuery.toLowerCase()) || (v.contact || '').includes(searchQuery);
      return matchesStatus && matchesSearch;
    });
  }, [statusFilter, searchQuery, vendors]);

  const summary = useMemo(() => {
    const active = vendors.filter(v => v.isActive);
    return {
      total: vendors.length,
      active: active.length,
      inactive: vendors.length - active.length,
      totalPayable: active.reduce((sum, v) => sum + Math.max(0, Number(v.currentBalance)), 0),
    };
  }, [vendors]);

  const columns = [
    { 
      key: 'name', 
      label: 'Vendor Identity', 
      sortable: true, 
      render: (r: Vendor) => (
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${r.isActive ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
             <Package size={16} />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-slate-900 leading-tight">{r.name}</span>
            <div className="flex items-center gap-1.5 mt-0.5">
               <div className={`w-1 h-1 rounded-full ${r.isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
               <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                 {r.isActive ? 'Active Supplier' : 'Inactive'}
               </span>
            </div>
          </div>
        </div>
      ) 
    },
    { 
      key: 'contact', 
      label: 'Contact Details', 
      render: (r: Vendor) => (
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5 text-slate-600 text-sm font-medium">
            <Phone size={12} className="text-slate-300" /> {r.contact || '—'}
          </div>
          <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-medium">
            <MapPin size={12} className="text-slate-300" /> {r.address || '—'}
          </div>
        </div>
      ) 
    },
    { 
      key: 'currentBalance', 
      label: 'Current Position', 
      sortable: true, 
      align: 'right' as const, 
      render: (r: Vendor) => (
        <div className="flex flex-col items-end">
          <span className={`font-black ${Number(r.currentBalance) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
            {fmt(r.currentBalance)}
          </span>
          <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">Running Balance</span>
        </div>
      ) 
    },
    {
      key: 'actions',
      label: '',
      align: 'right' as const,
      render: (r: Vendor) => (
        <div className="flex items-center justify-end gap-2">
          <button 
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold hover:bg-emerald-100 transition-colors"
            onClick={() => showVendorLedger(r)}
          >
            <BookOpen size={14} /> Ledger
          </button>
          
          {user?.role === 'ADMIN' && (
            <div className="flex items-center gap-1">
              <button onClick={() => openEdit(r)} className="p-1.5 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all" title="Edit Profile"><Pencil size={16} /></button>
              <button 
                onClick={() => toggleStatus(r)} 
                disabled={statusSavingId === r.id}
                className={`p-1.5 rounded-lg transition-all ${r.isActive ? 'text-slate-300 hover:text-red-600 hover:bg-red-50' : 'text-slate-300 hover:text-emerald-600 hover:bg-emerald-50'}`}
                title={r.isActive ? 'Deactivate' : 'Reactivate'}
              >
                {statusSavingId === r.id ? <Loader2 size={16} className="animate-spin" /> : r.isActive ? <XCircle size={16} /> : <CheckCircle2 size={16} />}
              </button>
            </div>
          )}
        </div>
      ),
    },
  ];

  const ledgerCols = [
    { key: 'date', label: 'Date', sortable: true, sortValue: (r: LedgerEntry) => new Date(r.date), render: (r: LedgerEntry) => <span className="font-medium text-slate-600 whitespace-nowrap">{new Date(r.date).toLocaleDateString('en-PK')}</span> },
    { key: 'type', label: 'Transaction', render: (r: LedgerEntry) => {
      const isDebit = r.balanceEffect === 'DEBIT' || (r.balanceEffect == null && ['DEBIT', 'CASH', 'CHEQUE', 'ONLINE', 'CLEARED UDHAAR'].includes(r.type));
      return <span className={`inline-flex items-center px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest whitespace-nowrap ${isDebit ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>{r.type.replaceAll('_', ' ')}</span>;
    } },
    { key: 'paymentMode', label: 'Payment', render: (r: LedgerEntry) => <div className="flex flex-col gap-0.5"><span className="text-xs font-black text-slate-700">{r.paymentMode || (r.referenceType === 'PURCHASE' ? 'Purchase' : 'Adjustment')}</span>{r.paymentStatus && <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">{r.paymentStatus}</span>}</div> },
    { key: 'weightKg', label: 'Weight', align: 'right' as const, render: (r: LedgerEntry) => <span className="font-medium text-slate-700 whitespace-nowrap">{formatLedgerWeight(r.weightKg)}</span> },
    { key: 'ratePerKg', label: 'Rate', align: 'right' as const, render: (r: LedgerEntry) => <span className="font-medium text-slate-700 whitespace-nowrap">{formatLedgerRate(r)}</span> },
    { key: 'amount', label: 'Amount', align: 'right' as const, render: (r: LedgerEntry) => <span className="font-bold text-slate-900">{fmt(r.amount)}</span> },
    { key: 'runningBalance', label: 'New Balance', align: 'right' as const, render: (r: LedgerEntry) => <span className="font-black text-slate-900">{fmt(r.runningBalance)}</span> },
    { key: 'narration', label: 'Notes', render: (r: LedgerEntry) => <div className="max-w-[220px]"><span className="block text-xs text-slate-500">{formatLedgerNarration(r)}</span>{r.referenceId && <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Ref #{r.referenceId}</span>}</div> },
  ];

  const ledgerTotals = useMemo(() => {
    const entries = ledger?.entries ?? [];
    return {
      transactions: entries.length,
      credits: entries.filter((entry) => entry.balanceEffect === 'CREDIT').reduce((sum, entry) => sum + Number(entry.balanceAmount ?? entry.amount), 0),
      debits: entries.filter((entry) => entry.balanceEffect === 'DEBIT').reduce((sum, entry) => sum + Number(entry.balanceAmount ?? entry.amount), 0),
    };
  }, [ledger]);

  const applyLedgerDate = () => {
    setLedgerAppliedDate(ledgerDate);
    if (ledgerVendor) void openLedger(ledgerVendor, ledgerDate);
  };

  const clearLedgerDate = () => {
    setLedgerDate('');
    setLedgerAppliedDate('');
    if (ledgerVendor) void openLedger(ledgerVendor, '', true);
  };

  const showVendorLedger = (vendor: Vendor) => {
    setLedgerDate('');
    setLedgerAppliedDate('');
    void openLedger(vendor, '', true);
  };

  const vendorFormContent = (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-1.5 md:col-span-2">
          <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1">Vendor / Farm Name *</label>
          <input className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Al-Noor Poultry Farm" />
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1">Mobile Contact</label>
          <input type="tel" inputMode="tel" autoComplete="tel" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all" value={form.contact} onChange={e => setForm(f => ({ ...f, contact: e.target.value }))} placeholder="+92 300 0000000" />
          <div className="text-[10px] font-medium text-slate-400">Use 10 to 15 digits, with an optional + and spaces.</div>
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1">Opening Balance</label>
          <div className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400 uppercase">Rs.</div>
            <input type="number" step="0.01" className="w-full pl-12 pr-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all" value={form.openingBalance} onChange={e => setForm(f => ({ ...f, openingBalance: e.target.value }))} />
          </div>
          {editVendor && <div className="text-[10px] font-medium text-slate-400">Changing this adjusts the current balance by the same amount.</div>}
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1">Farm Location / Address</label>
          <textarea className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all resize-none h-24" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Physical address for delivery/pickup coordination..." />
        </div>
      </div>
    </div>
  );

  return (
    <AppLayout>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight mb-2">Vendors & Farms</h1>
          <p className="text-slate-500 font-medium tracking-tight">Maintain supplier accounts, coordinate farm pickups, and track procurement aging.</p>
        </div>
        <button 
          className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold text-sm shadow-lg shadow-emerald-200 transition-all active:scale-95 self-start"
          onClick={() => { setForm(emptyForm); setCreateOpen(true); }}
        >
          <Plus size={18} /> Register New Vendor
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Total Suppliers</div>
          <div className="flex items-end gap-2">
            <span className="text-3xl font-black text-slate-900 leading-none">{summary.total}</span>
            <span className="text-xs font-bold text-emerald-600 pb-0.5">{summary.active} Active</span>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm md:col-span-2">
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Aggregate Payable</div>
          <div className="text-3xl font-black text-red-600 leading-none">{fmt(summary.totalPayable)}</div>
        </div>
        <div className="bg-emerald-900 rounded-3xl p-6 shadow-lg shadow-emerald-900/10 flex flex-col justify-center">
           <div className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-1">Archived Records</div>
           <div className="text-xl font-black text-white">{summary.inactive} Records</div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 mb-8">
        <div className="relative flex-1 group">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors">
            <Search size={18} />
          </div>
          <input 
            type="text" 
            placeholder="Quick search by name or contact number..."
            className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-medium focus:ring-4 focus:ring-emerald-500/5 focus:border-emerald-500 outline-none transition-all shadow-sm"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex p-1 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-x-auto no-scrollbar">
          {(['ALL', 'ACTIVE', 'INACTIVE'] as const).map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${statusFilter === f ? 'bg-emerald-600 text-white shadow-md shadow-emerald-100' : 'text-slate-400 hover:text-slate-600'}`}
            >
              {f === 'ALL' ? 'All Vendors' : f === 'ACTIVE' ? 'Active' : 'Archived'}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm animate-fade-in">
        <DataTable columns={columns} data={visibleVendors} loading={loading} emptyMessage="No vendors found matching your criteria." hideSearch />
      </div>

      {/* Modals */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Register New Farmer / Vendor"
        footer={(
          <>
            <button className="px-5 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors" onClick={() => setCreateOpen(false)}>Cancel</button>
            <button className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-emerald-100 transition-all flex items-center gap-2" onClick={handleCreate} disabled={saving}>{saving && <Loader2 size={16} className="animate-spin" />} Register Account</button>
          </>
        )}>
        {vendorFormContent}
      </Modal>

      <Modal open={!!editVendor} onClose={() => setEditVendor(null)} title={`Modify Vendor: ${editVendor?.name}`}
        footer={(
          <>
            <button className="px-5 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors" onClick={() => setEditVendor(null)}>Cancel</button>
            <button className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-emerald-100 transition-all flex items-center gap-2" onClick={handleEdit} disabled={saving}>{saving && <Loader2 size={16} className="animate-spin" />} Update Profile</button>
          </>
        )}>
        {vendorFormContent}
      </Modal>

      <Modal open={!!ledgerVendor} onClose={() => setLedgerVendor(null)} title={`Financial Ledger — ${ledgerVendor?.name}`} size="xl">
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-2">
             <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl">
               <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Opening Balance</div>
               <div className="text-lg font-black text-slate-900">{ledger ? fmt(ledger.openingBalance) : '—'}</div>
             </div>
             <div className="p-4 bg-emerald-900 border border-emerald-800 rounded-2xl shadow-lg shadow-emerald-900/10">
               <div className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-1">Net Balance</div>
               <div className="text-lg font-black text-white">{ledger ? fmt(ledger.closingBalance) : '—'}</div>
             </div>
             <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl">
               <div className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mb-1">Credits</div>
               <div className="text-lg font-black text-emerald-700">{fmt(ledgerTotals.credits)}</div>
             </div>
             <div className="p-4 bg-red-50 border border-red-100 rounded-2xl">
               <div className="text-[10px] font-black uppercase tracking-widest text-red-500 mb-1">Debits / Paid</div>
               <div className="text-lg font-black text-red-600">{fmt(ledgerTotals.debits)}</div>
             </div>
          </div>
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-500"><CalendarDays size={15} className="text-emerald-600" /> Filter by transaction date</div>
            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,320px)_auto_auto] gap-3 items-end">
              <div><label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">Date</label><DatePicker value={ledgerDate} onChange={setLedgerDate} placeholder="All recent transactions" /></div>
              <button type="button" onClick={applyLedgerDate} className="flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-black text-white transition-colors hover:bg-emerald-700"><Search size={14} /> Apply</button>
              <button type="button" onClick={clearLedgerDate} className="flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-500 transition-colors hover:bg-slate-100"><RotateCcw size={14} /> Show recent</button>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400"><WalletCards size={13} /> {ledgerTotals.transactions} transactions in this view <span className="text-slate-300">•</span> {ledgerAppliedDate ? `Showing ${new Date(`${ledgerAppliedDate}T00:00:00`).toLocaleDateString('en-PK')}` : 'Showing latest transactions'} <span className="text-slate-300">•</span> Cash, credit, cheque, online and adjustments included</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <DataTable columns={ledgerCols} data={ledger?.entries ?? []} loading={ledgerLoading} emptyMessage={ledgerAppliedDate ? 'No transactions recorded for this vendor on this date. Choose Show recent to view the latest transactions.' : 'No transactions recorded for this vendor yet.'} keyField="id" defaultSortKey="date" defaultSortDirection="desc" pageSizeOptions={[10, 25, 50]} defaultPageSize={10} />
          </div>
          <div className="border-t border-slate-100 pt-4 text-center text-[9px] font-bold tracking-wide text-slate-400">Powered by Voicepls • AI &amp; Software Development Company • <a href={VOICEPLS_URL} className="text-emerald-600 underline underline-offset-2">voicepls.com</a></div>
        </div>
      </Modal>
    </AppLayout>
  );
}
