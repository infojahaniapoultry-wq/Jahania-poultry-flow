'use client';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import DataTable from '@/components/DataTable';
import Modal from '@/components/Modal';
import { useAuth } from '@/lib/auth';
import api from '@/lib/api';
import { getCachedPageData, setCachedPageData } from '@/lib/page-cache';
import { toast } from 'react-hot-toast';
import { BookOpen, Pencil, UserPlus, Filter, CheckCircle2, XCircle, Loader2, Users, Phone, MapPin } from 'lucide-react';
import { BUSINESS_DATA_UPDATED_EVENT, notifyBusinessDataUpdated } from '@/lib/business-events';
import { isPhoneNumberLike, toOptionalPhoneNumber } from '@/lib/phone';
import { formatLedgerRate, formatLedgerWeight, LedgerCommodityFields } from '@/lib/ledger';
import { VOICEPLS_URL } from '@/lib/branding';

interface Customer {
  id: number; shopName: string; contact?: string;
  address?: string; openingBalance: string; currentBalance: string; isActive: boolean;
  pricingBaseRateType?: 'FARM' | 'FINAL' | null;
  pricingOffsetDirection?: 'PLUS' | 'MINUS' | null;
  pricingOffsetValue?: string | number | null;
}
interface LedgerEntry extends LedgerCommodityFields {
  id: number; date: string; type: string;
  amount: string; runningBalance: string; narration?: string; referenceType?: string;
}
interface LedgerSummary {
  customer: Customer;
  openingBalance: string | number;
  closingBalance: string | number;
  entries: LedgerEntry[];
}

interface MarketRate {
  effectiveDate: string;
  farmRate: number | string;
  finalRate: number | string;
}

type PricingBaseRateType = 'FARM' | 'FINAL';
type PricingOffsetDirection = 'PLUS' | 'MINUS';

const fmt = (n: string | number) => 'Rs. ' + Number(n ?? 0).toLocaleString('en-PK');
const emptyForm = {
  shopName: '',
  contact: '',
  address: '',
  openingBalance: '0',
  pricingBaseRateType: 'FARM' as PricingBaseRateType,
  pricingOffsetDirection: 'MINUS' as PricingOffsetDirection,
  pricingOffsetValue: '0',
  pricingTargetRate: '',
};
const CACHE_KEY = 'customers-page';

const getPKTDate = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
};

const formatRateInput = (value: number) => Number.isFinite(value) ? String(Number(value.toFixed(2))) : '';

function calculateTargetRate(
  form: Pick<typeof emptyForm, 'pricingBaseRateType' | 'pricingOffsetDirection' | 'pricingOffsetValue'>,
  marketRate: MarketRate | null,
) {
  if (!marketRate) return '';
  const baseRate = Number(form.pricingBaseRateType === 'FARM' ? marketRate.farmRate : marketRate.finalRate);
  const offset = Number(form.pricingOffsetValue || 0);
  if (!Number.isFinite(baseRate) || !Number.isFinite(offset)) return '';
  return formatRateInput(form.pricingOffsetDirection === 'PLUS' ? baseRate + offset : baseRate - offset);
}

function formatLedgerNarration(row: LedgerEntry) {
  if (row.referenceType === 'INVOICE' && row.narration?.startsWith('Invoice ')) return row.narration;
  if (row.referenceType === 'INVOICE_PAYMENT') return row.narration || 'Invoice payment';
  return row.narration || '—';
}

function formatPricingRule(customer: Customer) {
  if (!customer.pricingBaseRateType || !customer.pricingOffsetDirection || customer.pricingOffsetValue == null) {
    return 'Pricing not configured';
  }
  const sign = customer.pricingOffsetDirection === 'PLUS' ? '+' : '-';
  return `${customer.pricingBaseRateType} ${sign} Rs. ${Number(customer.pricingOffsetValue).toLocaleString('en-PK')}`;
}

export default function CustomersPage() {
  const { user } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [ledgerCustomer, setLedgerCustomer] = useState<Customer | null>(null);
  const [ledger, setLedger] = useState<LedgerSummary | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const ledgerCacheRef = useRef<Record<number, LedgerSummary>>({});
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [statusSavingId, setStatusSavingId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [marketRate, setMarketRate] = useState<MarketRate | null>(null);
  const [marketRateLoading, setMarketRateLoading] = useState(true);

  const load = useCallback(async (force = false) => {
    if (!force) {
      const cached = getCachedPageData<Customer[]>(CACHE_KEY);
      if (cached) {
        setCustomers(cached);
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    try {
      const r = await api.get('/customers');
      setCustomers(r.data);
      setCachedPageData(CACHE_KEY, r.data);
    }
    catch { toast.error('Failed to load customers'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let active = true;
    setMarketRateLoading(true);
    api.get<MarketRate>(`/market-rates/effective?date=${getPKTDate()}`)
      .then((response) => { if (active) setMarketRate(response.data); })
      .catch(() => { if (active) setMarketRate(null); })
      .finally(() => { if (active) setMarketRateLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!marketRate) return;
    setForm((previous) => previous.pricingTargetRate
      ? previous
      : { ...previous, pricingTargetRate: calculateTargetRate(previous, marketRate) });
  }, [marketRate]);

  const openLedger = useCallback(async (c: Customer) => {
    setLedgerCustomer(c);

    const cached = ledgerCacheRef.current[c.id];
    if (cached) {
      setLedger(cached);
      setLedgerLoading(false);
      return;
    }

    setLedger(null);
    setLedgerLoading(true);
    try {
      const r = await api.get(`/customers/${c.id}/ledger`);
      ledgerCacheRef.current[c.id] = r.data;
      setLedger(r.data);
    } catch {
      toast.error('Failed to load ledger');
    } finally {
      setLedgerLoading(false);
    }
  }, []);

  useEffect(() => {
    const handleBusinessDataUpdated = () => {
      ledgerCacheRef.current = {};
      void load(true);
      if (ledgerCustomer) {
        void openLedger(ledgerCustomer);
      }
    };

    window.addEventListener(BUSINESS_DATA_UPDATED_EVENT, handleBusinessDataUpdated);
    return () => window.removeEventListener(BUSINESS_DATA_UPDATED_EVENT, handleBusinessDataUpdated);
  }, [ledgerCustomer, load, openLedger]);

  const openEdit = (c: Customer) => {
    setEditCustomer(c);
    const nextForm = {
      shopName: c.shopName,
      contact: c.contact ?? '',
      address: c.address ?? '',
      openingBalance: c.openingBalance,
      pricingBaseRateType: c.pricingBaseRateType ?? 'FARM',
      pricingOffsetDirection: c.pricingOffsetDirection ?? 'MINUS',
      pricingOffsetValue: String(c.pricingOffsetValue ?? 0),
      pricingTargetRate: '',
    } satisfies typeof emptyForm;
    setForm({ ...nextForm, pricingTargetRate: calculateTargetRate(nextForm, marketRate) });
  };

  const updatePricingFields = (changes: Partial<typeof emptyForm>) => {
    setForm((previous) => {
      const next = { ...previous, ...changes };
      return { ...next, pricingTargetRate: calculateTargetRate(next, marketRate) };
    });
  };

  const handleTargetRateChange = (targetRate: string) => {
    setForm((previous) => {
      const next = { ...previous, pricingTargetRate: targetRate };
      if (!marketRate || targetRate === '') return next;
      const baseRate = Number(previous.pricingBaseRateType === 'FARM' ? marketRate.farmRate : marketRate.finalRate);
      const target = Number(targetRate);
      if (!Number.isFinite(baseRate) || !Number.isFinite(target)) return next;
      const difference = target - baseRate;
      return {
        ...next,
        pricingOffsetDirection: difference < 0 ? 'MINUS' : 'PLUS',
        pricingOffsetValue: formatRateInput(Math.abs(difference)),
      };
    });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.shopName) { toast.error('Shop name required'); return; }
    if (form.contact && !isPhoneNumberLike(form.contact)) { toast.error('Enter a valid contact number'); return; }
    if (!Number.isFinite(Number(form.pricingOffsetValue)) || Number(form.pricingOffsetValue) < 0) { toast.error('Enter a valid pricing adjustment'); return; }
    if (marketRate && (!form.pricingTargetRate || !Number.isFinite(Number(form.pricingTargetRate)))) { toast.error('Enter a valid final rate'); return; }
    setSaving(true);
    try {
      await api.post('/customers', {
        shopName: form.shopName,
        contact: toOptionalPhoneNumber(form.contact),
        address: form.address || undefined,
        openingBalance: Number(form.openingBalance),
        pricingBaseRateType: form.pricingBaseRateType,
        pricingOffsetDirection: form.pricingOffsetDirection,
        pricingOffsetValue: Number(form.pricingOffsetValue),
      });
      toast.success('Customer added!'); setCreateOpen(false); setForm(emptyForm); notifyBusinessDataUpdated();
    } catch (err: any) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editCustomer) return;
    if (form.contact && !isPhoneNumberLike(form.contact)) { toast.error('Enter a valid contact number'); return; }
    if (!Number.isFinite(Number(form.pricingOffsetValue)) || Number(form.pricingOffsetValue) < 0) { toast.error('Enter a valid pricing adjustment'); return; }
    if (marketRate && (!form.pricingTargetRate || !Number.isFinite(Number(form.pricingTargetRate)))) { toast.error('Enter a valid final rate'); return; }
    setSaving(true);
    try {
      await api.patch(`/customers/${editCustomer.id}`, {
        shopName: form.shopName,
        contact: toOptionalPhoneNumber(form.contact),
        address: form.address || undefined,
        pricingBaseRateType: form.pricingBaseRateType,
        pricingOffsetDirection: form.pricingOffsetDirection,
        pricingOffsetValue: Number(form.pricingOffsetValue),
      });
      toast.success('Updated!'); setEditCustomer(null); setForm(emptyForm); notifyBusinessDataUpdated();
    } catch { toast.error('Failed to update'); }
    finally { setSaving(false); }
  };

  const toggleStatus = async (customer: Customer) => {
    setStatusSavingId(customer.id);
    try {
      await api.patch(`/customers/${customer.id}`, { isActive: !customer.isActive });
      toast.success(customer.isActive ? 'Customer deactivated' : 'Customer activated');
      notifyBusinessDataUpdated();
    } catch {
      toast.error('Failed to update status');
    } finally {
      setStatusSavingId(null);
    }
  };

  const visibleCustomers = useMemo(
    () =>
      customers.filter((customer) => {
        if (statusFilter === 'ACTIVE' && !customer.isActive) return false;
        if (statusFilter === 'INACTIVE' && customer.isActive) return false;
        return true;
      }),
    [customers, statusFilter],
  );

  const columns = [
    { 
      key: 'shopName', 
      label: 'Customer Identity', 
      sortable: true, 
      render: (r: Customer) => (
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${r.isActive ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
             <Users size={16} />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-slate-900 leading-tight">{r.shopName}</span>
            <div className="flex items-center gap-1.5 mt-0.5">
               <div className={`w-1 h-1 rounded-full ${r.isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
               <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                 {r.isActive ? 'Active Client' : 'Inactive'}
               </span>
            </div>
          </div>
        </div>
      ) 
    },
    { 
      key: 'contact', 
      label: 'Contact Details', 
      render: (r: Customer) => (
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
      render: (r: Customer) => (
        <div className="flex flex-col items-end">
          <span className={`font-black ${Number(r.currentBalance) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
            {fmt(r.currentBalance)}
          </span>
          <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">Running Balance</span>
        </div>
      ) 
    },
    {
      key: 'pricingBaseRateType',
      label: 'Pricing Rule',
      sortable: true,
      render: (r: Customer) => (
        <span className={`text-xs font-bold ${r.pricingBaseRateType ? 'text-slate-700' : 'text-amber-600'}`}>
          {formatPricingRule(r)}
        </span>
      ),
    },
    {
      key: 'actions', 
      label: '', 
      sortable: false, 
      align: 'right' as const,
      render: (r: Customer) => (
        <div className="flex items-center justify-end gap-2">
          <button 
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold hover:bg-emerald-100 transition-colors"
            onClick={() => openLedger(r)}
          >
            <BookOpen size={14} /> Ledger
          </button>
          
          {user?.role === 'ADMIN' && (
            <div className="flex items-center gap-1">
              <button 
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-all"
                onClick={() => openEdit(r)}
                title="Edit Profile"
              >
                <Pencil size={16} />
              </button>
              <button 
                className={`p-1.5 rounded-lg transition-all ${r.isActive ? 'text-slate-300 hover:text-red-600 hover:bg-red-50' : 'text-slate-300 hover:text-emerald-600 hover:bg-emerald-50'}`}
                onClick={() => toggleStatus(r)}
                disabled={statusSavingId === r.id}
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
    { key: 'date', label: 'Date', sortable: true, render: (r: LedgerEntry) => <span className="font-medium">{new Date(r.date).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}</span> },
    { 
      key: 'type', 
      label: 'Type', 
      sortable: true, 
      render: (r: LedgerEntry) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black tracking-widest ${
          r.type === 'DEBIT' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'
        }`}>
          {r.type}
        </span>
      ) 
    },
    { key: 'weightKg', label: 'Weight', sortable: true, align: 'right' as const, render: (r: LedgerEntry) => <span className="font-medium text-slate-700 whitespace-nowrap">{formatLedgerWeight(r.weightKg)}</span> },
    { key: 'ratePerKg', label: 'Rate', sortable: true, align: 'right' as const, render: (r: LedgerEntry) => <span className="font-medium text-slate-700 whitespace-nowrap">{formatLedgerRate(r)}</span> },
    { key: 'amount', label: 'Amount', sortable: true, align: 'right' as const, render: (r: LedgerEntry) => <span className="font-bold text-slate-900">{fmt(r.amount)}</span> },
    { key: 'runningBalance', label: 'Balance', sortable: true, align: 'right' as const, render: (r: LedgerEntry) => <span className="font-black text-slate-900">{fmt(r.runningBalance)}</span> },
    { key: 'narration', label: 'Narration', sortable: true, render: (r: LedgerEntry) => <span className="text-slate-500 italic text-xs">{formatLedgerNarration(r)}</span> },
    { 
      key: 'referenceType', 
      label: 'Ref', 
      sortable: true, 
      render: (r: LedgerEntry) => r.referenceType ? (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 text-[9px] font-bold uppercase tracking-wider">
          {r.referenceType}
        </span>
      ) : '—' 
    },
  ];

  const customerForm = (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
      <div className="sm:col-span-2">
        <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1 mb-1.5 block">Business / Shop Name *</label>
        <input 
          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all" 
          value={form.shopName} 
          onChange={e => setForm(f => ({ ...f, shopName: e.target.value }))} 
          placeholder="e.g. Al-Madina Poultry" 
        />
      </div>
      <div>
        <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1 mb-1.5 block">Contact Number</label>
        <input 
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all" 
          value={form.contact} 
          onChange={e => setForm(f => ({ ...f, contact: e.target.value }))} 
          placeholder="+92 300 0000000" 
        />
        <div className="text-[10px] font-medium text-slate-400">Use 10 to 15 digits, with an optional + and spaces.</div>
      </div>
      <div className="sm:col-span-2 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-700">Automatic Pricing Rule</div>
          <div className="text-[10px] font-bold text-emerald-700">{marketRateLoading ? 'Loading today\'s rates…' : marketRate ? `Today\'s farm rate: Rs. ${Number(marketRate.farmRate).toLocaleString('en-PK')}` : 'Set today\'s rates in Market Pricing first'}</div>
        </div>
        <div className="mb-3 text-xs font-medium text-emerald-800/75">Choose a benchmark, then use the editable final rate to set the exact customer price.</div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Base Rate</label>
            <select
              className="mt-1 w-full rounded-xl border border-emerald-100 bg-white px-3 py-2.5 text-sm font-bold outline-none focus:border-emerald-500"
              value={form.pricingBaseRateType}
              onChange={e => updatePricingFields({ pricingBaseRateType: e.target.value as PricingBaseRateType })}
            >
              <option value="FARM">Farm Rate</option>
              <option value="FINAL">Final Rate</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Adjustment</label>
            <select
              className="mt-1 w-full rounded-xl border border-emerald-100 bg-white px-3 py-2.5 text-sm font-bold outline-none focus:border-emerald-500"
              value={form.pricingOffsetDirection}
              onChange={e => updatePricingFields({ pricingOffsetDirection: e.target.value as PricingOffsetDirection })}
            >
              <option value="MINUS">Minus</option>
              <option value="PLUS">Plus</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Offset (Rs.)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="mt-1 w-full rounded-xl border border-emerald-100 bg-white px-3 py-2.5 text-sm font-bold outline-none focus:border-emerald-500"
              value={form.pricingOffsetValue}
              onChange={e => updatePricingFields({ pricingOffsetValue: e.target.value })}
            />
          </div>
          <div>
            <label className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-500"><span>Final Rate / kg</span><span className="text-emerald-700">Editable</span></label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="mt-1 w-full rounded-xl border-2 border-emerald-300 bg-white px-3 py-2.5 text-sm font-black text-emerald-900 outline-none shadow-sm focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10"
              value={form.pricingTargetRate}
              onChange={e => handleTargetRateChange(e.target.value)}
              placeholder={marketRate ? 'e.g. 342' : 'Set market rate first'}
            />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-emerald-200/70 pt-3 text-[11px] font-semibold text-emerald-800">
          <span>{marketRate ? `${form.pricingBaseRateType === 'FARM' ? 'Farm' : 'Final'} rate ${form.pricingOffsetDirection === 'PLUS' ? 'plus' : 'minus'} Rs. ${form.pricingOffsetValue || '0'} =` : 'Final rate preview will appear after market rates are configured.'}</span>
          {marketRate && <strong className="rounded-lg bg-white px-2.5 py-1 text-sm font-black text-emerald-900">Rs. {form.pricingTargetRate || '—'} / kg</strong>}
        </div>
      </div>
      <div>
        <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1 mb-1.5 block">Initial Opening Balance</label>
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs pointer-events-none">Rs.</div>
          <input 
            type="number" 
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all disabled:opacity-50" 
            value={form.openingBalance} 
            onChange={e => setForm(f => ({ ...f, openingBalance: e.target.value }))} 
            disabled={!!editCustomer} 
          />
        </div>
      </div>
      <div className="sm:col-span-2">
        <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1 mb-1.5 block">Office / Shop Address</label>
        <textarea 
          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all resize-none h-24" 
          value={form.address} 
          onChange={e => setForm(f => ({ ...f, address: e.target.value }))} 
          placeholder="Enter detailed shop address..." 
        />
      </div>
    </div>
  );

  return (
    <AppLayout>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight mb-2">Customers</h1>
          <p className="text-slate-500 font-medium tracking-tight">Manage shop accounts, monitor outstanding balances, and access detailed ledgers.</p>
        </div>
        <button 
          className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold text-sm shadow-lg shadow-emerald-200 transition-all active:scale-95 self-start"
          onClick={() => { setForm({ ...emptyForm, pricingTargetRate: calculateTargetRate(emptyForm, marketRate) }); setCreateOpen(true); }}
        >
          <UserPlus size={18} /> Add New Account
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-3 mb-8 bg-white p-3 rounded-2xl shadow-sm border border-slate-200 w-full overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-xl border border-slate-200">
          <Filter size={14} className="text-slate-400" />
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 whitespace-nowrap">Filter Status</span>
        </div>
        <div className="flex gap-1.5">
          {['ALL', 'ACTIVE', 'INACTIVE'].map((val) => (
            <button
              key={val}
              onClick={() => setStatusFilter(val as any)}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold tracking-tight transition-all ${
                statusFilter === val 
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-100' 
                  : 'bg-white text-slate-600 border border-slate-200 hover:border-emerald-200'
              }`}
            >
              {val === 'ALL' ? 'All Accounts' : val === 'ACTIVE' ? 'Active' : 'Inactive'}
            </button>
          ))}
        </div>
      </div>

      <div className="animate-fade-in">
        <DataTable columns={columns} data={visibleCustomers} loading={loading} emptyMessage="No customer accounts match your search." />
      </div>

      {/* Create Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Customer Account"
        footer={(
          <>
            <button className="px-5 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors" onClick={() => setCreateOpen(false)}>Cancel</button>
            <button className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-emerald-100 transition-all disabled:opacity-50" onClick={handleCreate} disabled={saving}>
              {saving ? 'Creating...' : 'Create Account'}
            </button>
          </>
        )}
      >
        {customerForm}
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editCustomer} onClose={() => setEditCustomer(null)} title={`Modify: ${editCustomer?.shopName}`}
        footer={(
          <>
            <button className="px-5 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors" onClick={() => setEditCustomer(null)}>Cancel</button>
            <button className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-emerald-100 transition-all disabled:opacity-50" onClick={handleEdit} disabled={saving}>
              {saving ? 'Updating...' : 'Save Changes'}
            </button>
          </>
        )}
      >
        {customerForm}
      </Modal>

      {/* Ledger Modal */}
      <Modal open={!!ledgerCustomer} onClose={() => setLedgerCustomer(null)} title={`Ledger Registry — ${ledgerCustomer?.shopName}`} size="lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 p-6 bg-slate-50 rounded-2xl border border-slate-100">
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Account Holder</div>
            <div className="text-xl font-black text-slate-900 tracking-tight leading-none">{ledgerCustomer?.shopName}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Current Outstanding</div>
            <div className={`text-2xl font-black tracking-tight leading-none ${Number(ledger?.closingBalance ?? 0) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
              {ledger ? fmt(ledger.closingBalance) : '—'}
            </div>
          </div>
        </div>
        <DataTable columns={ledgerCols} data={ledger?.entries ?? []} loading={ledgerLoading} emptyMessage="No transactions recorded in this ledger yet." />
        <div className="border-t border-slate-100 pt-4 text-center text-[9px] font-bold tracking-wide text-slate-400">Powered by Voicepls • AI &amp; Software Development Company • <a href={VOICEPLS_URL} className="text-emerald-600 underline underline-offset-2">voicepls.com</a></div>
      </Modal>
    </AppLayout>
  );
}
