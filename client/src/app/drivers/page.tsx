'use client';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import DataTable from '@/components/DataTable';
import Modal from '@/components/Modal';
import { useAuth } from '@/lib/auth';
import api from '@/lib/api';
import { toast } from 'react-hot-toast';
import { getCachedPageData, setCachedPageData } from '@/lib/page-cache';
import { Plus, Car, BookOpen, Pencil, Phone, Wallet, CheckCircle2, XCircle, Loader2, Search } from 'lucide-react';
import { BUSINESS_DATA_UPDATED_EVENT, notifyBusinessDataUpdated } from '@/lib/business-events';
import { isPhoneNumberLike, toOptionalPhoneNumber } from '@/lib/phone';
import { formatLedgerRate, formatLedgerWeight, LedgerCommodityFields } from '@/lib/ledger';
import { ONLINE_PROVIDER_OPTIONS } from '../finance/shared';
import WhatsAppButton from '@/components/WhatsAppButton';
import { formatShareCurrency, formatShareDate, makeWhatsAppMessage, openWhatsApp } from '@/lib/whatsapp';

interface Driver {
  id: number;
  name: string;
  contact?: string;
  vehicleType?: string;
  defaultCharge: string;
  advanceBalance: string;
  isActive: boolean;
}

interface LedgerEntry extends LedgerCommodityFields {
  id: number;
  date: string;
  amount: string;
  type: string;
  runningBalance: string;
  narration?: string | null;
  referenceType?: string | null;
}

const fmt = (n: string | number) => 'Rs. ' + Number(n ?? 0).toLocaleString('en-PK');
const emptyDriverForm = { name: '', contact: '', vehicleType: '', defaultCharge: '0' };
const CACHE_KEY = 'drivers-page';

export default function DriversPage() {
  const { user } = useAuth();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [settlementOpen, setSettlementOpen] = useState(false);
  const [ledgerDriver, setLedgerDriver] = useState<Driver | null>(null);
  const [advances, setAdvances] = useState<LedgerEntry[]>([]);
  const ledgerCacheRef = useRef<Record<number, LedgerEntry[]>>({});
  const [saving, setSaving] = useState(false);
  const [driverForm, setDriverForm] = useState(emptyDriverForm);
  const [settlementSaving, setSettlementSaving] = useState(false);
  const [statusSavingId, setStatusSavingId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [settlementForm, setSettlementForm] = useState({ amount: '', paymentMode: 'CASH', paymentProvider: 'JAZZCASH', paymentReference: '', narration: '' });
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);

  const openEdit = (d: Driver) => {
    setEditingDriver(d);
    setDriverForm({
      name: d.name,
      contact: d.contact || '',
      vehicleType: d.vehicleType || '',
      defaultCharge: String(d.defaultCharge),
    });
    setCreateOpen(true);
  };

  const load = useCallback(async (force = false) => {
    if (!force) {
      const cached = getCachedPageData<{ drivers: Driver[] }>(CACHE_KEY);
      if (cached) {
        setDrivers(cached.drivers);
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    try {
      const driverRes = await api.get('/drivers');
      setDrivers(driverRes.data);
      setCachedPageData(CACHE_KEY, { drivers: driverRes.data });
    } catch {
      toast.error('Failed to load drivers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openLedger = useCallback(async (driver: Driver) => {
    setLedgerDriver(driver);

    const cached = ledgerCacheRef.current[driver.id];
    if (cached) {
      setAdvances(cached);
      return;
    }

    try {
      const r = await api.get(`/drivers/${driver.id}/ledger`);
      ledgerCacheRef.current[driver.id] = r.data;
      setAdvances(r.data);
    } catch {
      toast.error('Failed to load ledger');
    }
  }, []);

  const openSettlement = () => {
    if (!ledgerDriver) return;
    setSettlementForm({ amount: String(Number(ledgerDriver.advanceBalance ?? 0)), paymentMode: 'CASH', paymentProvider: 'JAZZCASH', paymentReference: '', narration: 'Driver balance settlement' });
    setSettlementOpen(true);
  };

  const handleShareLedger = () => {
    if (!ledgerDriver) return;
    const recentRows = [...advances]
      .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
      .slice(0, 10);
    openWhatsApp(makeWhatsAppMessage('Driver Ledger', [
      `Driver: ${ledgerDriver.name}`,
      `Outstanding advance: ${formatShareCurrency(ledgerDriver.advanceBalance)}`,
      `Transactions: ${advances.length}`,
      ...recentRows.map((row) => `${formatShareDate(row.date)} · ${row.type} · ${formatShareCurrency(row.amount)} · ${row.narration || 'Driver transaction'}`),
      advances.length > recentRows.length ? `Showing the latest ${recentRows.length} transactions.` : '',
    ]));
  };

  const handleSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ledgerDriver || !settlementForm.amount || Number(settlementForm.amount) <= 0) { toast.error('Valid amount required'); return; }
    setSettlementSaving(true);
    try {
      const driverId = ledgerDriver.id;
      await api.post(`/drivers/${driverId}/settle-balance`, { amount: Number(settlementForm.amount), paymentMode: settlementForm.paymentMode, paymentProvider: settlementForm.paymentMode === 'ONLINE' ? settlementForm.paymentProvider : undefined, paymentReference: settlementForm.paymentMode !== 'CASH' ? settlementForm.paymentReference || undefined : undefined, narration: settlementForm.narration || undefined });
      toast.success('Driver balance cleared');
      setSettlementOpen(false);
      notifyBusinessDataUpdated();
    } catch {
      toast.error('Failed to clear balance');
    } finally {
      setSettlementSaving(false);
    }
  };

  useEffect(() => {
    const handleBusinessDataUpdated = () => {
      ledgerCacheRef.current = {};
      void load(true);
      if (ledgerDriver) {
        void openLedger(ledgerDriver);
      }
    };

    window.addEventListener(BUSINESS_DATA_UPDATED_EVENT, handleBusinessDataUpdated);
    return () => window.removeEventListener(BUSINESS_DATA_UPDATED_EVENT, handleBusinessDataUpdated);
  }, [ledgerDriver, load, openLedger]);

  const toggleStatus = async (d: Driver) => {
    if (!confirm(`${d.isActive ? 'Deactivate' : 'Reactivate'} this driver profile?`)) return;
    setStatusSavingId(d.id);
    try {
      await api.patch(`/drivers/${d.id}`, { isActive: !d.isActive });
      toast.success('Status updated');
      notifyBusinessDataUpdated();
    } catch {
      toast.error('Failed to update status');
    } finally {
      setStatusSavingId(null);
    }
  };

  const handleCreateDriver = async () => {
    if (!driverForm.name) { toast.error('Name is required'); return; }
    if (driverForm.contact && !isPhoneNumberLike(driverForm.contact)) { toast.error('Enter a valid contact number'); return; }
    setSaving(true);
    try {
      const payload = {
        ...driverForm,
        contact: toOptionalPhoneNumber(driverForm.contact),
        defaultCharge: Number(driverForm.defaultCharge),
      };
      
      if (editingDriver) {
        await api.patch(`/drivers/${editingDriver.id}`, payload);
        toast.success('Driver updated');
      } else {
        await api.post('/drivers', payload);
        toast.success('Driver created');
      }
      
      setCreateOpen(false);
      setEditingDriver(null);
      setDriverForm(emptyDriverForm);
      notifyBusinessDataUpdated();
    } catch {
      toast.error(editingDriver ? 'Failed to update driver' : 'Failed to create driver');
    } finally {
      setSaving(false);
    }
  };

  const visibleDrivers = useMemo(() => {
    return drivers.filter((v) => {
      const matchesStatus = statusFilter === 'ALL' || (statusFilter === 'ACTIVE' ? v.isActive : !v.isActive);
      const matchesSearch = v.name.toLowerCase().includes(searchQuery.toLowerCase()) || (v.contact || '').includes(searchQuery);
      return matchesStatus && matchesSearch;
    });
  }, [statusFilter, searchQuery, drivers]);

  const summary = useMemo(() => {
    const active = drivers.filter(d => d.isActive);
    return {
      total: drivers.length,
      active: active.length,
      totalAdvances: active.reduce((sum, d) => sum + Number(d.advanceBalance), 0),
    };
  }, [drivers]);

  const columns = [
    { 
      key: 'name', 
      label: 'Driver Identity', 
      sortable: true, 
      render: (r: Driver) => (
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${r.isActive ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
             <Car size={16} />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-slate-900 leading-tight">{r.name}</span>
            <div className="flex items-center gap-1.5 mt-0.5">
               <div className={`w-1 h-1 rounded-full ${r.isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
               <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                 {r.isActive ? 'Active Fleet' : 'Inactive'}
               </span>
            </div>
          </div>
        </div>
      ) 
    },
    { 
      key: 'contact', 
      label: 'Contact Details', 
      render: (r: Driver) => (
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5 text-slate-600 text-sm font-medium">
            <Phone size={12} className="text-slate-300" /> {r.contact || '—'}
          </div>
          <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-medium">
            <Car size={12} className="text-slate-300" /> {r.vehicleType || 'No Vehicle'}
          </div>
        </div>
      ) 
    },
    { 
      key: 'defaultCharge', 
      label: 'Dispatch Rate', 
      align: 'right' as const, 
      render: (r: Driver) => (
        <div className="flex flex-col items-end">
          <span className="font-bold text-slate-900">{fmt(r.defaultCharge)}</span>
          <span className="text-[10px] font-bold text-slate-300 uppercase tracking-tighter">Per Trip Base</span>
        </div>
      ) 
    },
    { 
      key: 'advanceBalance', 
      label: 'Current Position', 
      sortable: true, 
      align: 'right' as const, 
      render: (r: Driver) => (
        <div className="flex flex-col items-end">
          <span className={`font-black ${Number(r.advanceBalance) > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
            {fmt(r.advanceBalance)}
          </span>
          <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">Net Advance</span>
        </div>
      ) 
    },
    {
      key: 'actions',
      label: '',
      align: 'right' as const,
      render: (r: Driver) => (
        <div className="flex items-center justify-end gap-2">
          <button 
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold hover:bg-emerald-100 transition-colors"
            onClick={() => openLedger(r)}
          >
            <BookOpen size={14} /> Ledger
          </button>
          
          <div className="flex items-center gap-1">
            {user?.role === 'ADMIN' && (
              <>
                <button onClick={() => openEdit(r)} className="p-1.5 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all" title="Edit Profile"><Pencil size={16} /></button>
                <button 
                  onClick={() => toggleStatus(r)} 
                  disabled={statusSavingId === r.id}
                  className={`p-1.5 rounded-lg transition-all ${r.isActive ? 'text-slate-300 hover:text-red-600 hover:bg-red-50' : 'text-slate-300 hover:text-emerald-600 hover:bg-emerald-50'}`}
                  title={r.isActive ? 'Deactivate' : 'Reactivate'}
                >
                  {statusSavingId === r.id ? <Loader2 size={16} className="animate-spin" /> : r.isActive ? <XCircle size={16} /> : <CheckCircle2 size={16} />}
                </button>
              </>
            )}
          </div>
        </div>
      )
    }
  ];

  return (
    <AppLayout>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight mb-2">Transport Fleet</h1>
          <p className="text-slate-500 font-medium tracking-tight">Manage dispatch riders and settle balances.</p>
        </div>
        <div className="flex items-center gap-3 self-start">
          <button onClick={() => setCreateOpen(true)} className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold text-sm shadow-lg shadow-emerald-200 transition-all active:scale-95">
            <Plus size={18} /> Add Driver
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Active Fleet</div>
          <div className="flex items-end gap-2">
            <span className="text-3xl font-black text-slate-900 leading-none">{summary.active}</span>
            <span className="text-xs font-bold text-slate-400 pb-0.5">/ {summary.total} Total</span>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm md:col-span-2">
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Total Fleet Debt (Advances)</div>
          <div className="text-3xl font-black text-amber-600 leading-none">{fmt(summary.totalAdvances)}</div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 mb-8">
        <div className="relative flex-1 group">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-amber-500 transition-colors">
            <Search size={18} />
          </div>
          <input 
            type="text" 
            placeholder="Search drivers by name or mobile number..."
            className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-medium focus:ring-4 focus:ring-amber-500/5 focus:border-amber-500 outline-none transition-all shadow-sm"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex p-1 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-x-auto no-scrollbar">
          {(['ALL', 'ACTIVE', 'INACTIVE'] as const).map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${statusFilter === f ? 'bg-amber-600 text-white shadow-md shadow-amber-100' : 'text-slate-400 hover:text-slate-600'}`}
            >
              {f === 'ALL' ? 'All Personnel' : f === 'ACTIVE' ? 'On Duty' : 'Archived'}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm animate-fade-in">
        <DataTable columns={columns} data={visibleDrivers} loading={loading} emptyMessage="No driver profiles found matching your search." hideSearch />
      </div>

      {/* Modals */}
      <Modal open={createOpen} onClose={() => { setCreateOpen(false); setEditingDriver(null); setDriverForm(emptyDriverForm); }} title={editingDriver ? "Update Driver Profile" : "Register New Driver"}
        footer={(
          <>
            <button className="px-5 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors" onClick={() => setCreateOpen(false)}>Cancel</button>
            <button className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-emerald-100 transition-all flex items-center gap-2" onClick={handleCreateDriver} disabled={saving}>{saving && <Loader2 size={16} className="animate-spin" />} {editingDriver ? 'Save Changes' : 'Create Profile'}</button>
          </>
        )}>
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1">Full Identity Name *</label>
              <input className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all" value={driverForm.name} onChange={e => setDriverForm(p => ({ ...p, name: e.target.value }))} placeholder="Full Legal Name" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1">Mobile Contact</label>
              <input type="tel" inputMode="tel" autoComplete="tel" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all" value={driverForm.contact} onChange={e => setDriverForm(p => ({ ...p, contact: e.target.value }))} placeholder="+92 300 0000000" />
              <div className="text-[10px] font-medium text-slate-400">Use 10 to 15 digits, with an optional + and spaces.</div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1">Assigned Vehicle</label>
              <input className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all" value={driverForm.vehicleType} onChange={e => setDriverForm(p => ({ ...p, vehicleType: e.target.value }))} placeholder="e.g. Mazda 3500, Loader" />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1">Base Dispatch Charge (Per Trip)</label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400 uppercase">Rs.</div>
                <input type="number" className="w-full pl-12 pr-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all" value={driverForm.defaultCharge} onChange={e => setDriverForm(p => ({ ...p, defaultCharge: e.target.value }))} placeholder="0.00" />
              </div>
            </div>
          </div>
        </div>
      </Modal>

      <Modal open={!!ledgerDriver} onClose={() => setLedgerDriver(null)} title={`Fleet Ledger — ${ledgerDriver?.name}`} size="lg"
        footer={(
          <>
            <button className="px-5 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors" onClick={() => setLedgerDriver(null)}>Close Ledger</button>
            <WhatsAppButton onClick={handleShareLedger} label="Share Ledger" title="Share driver ledger on WhatsApp" />
            <button className="px-6 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-amber-100 transition-all flex items-center gap-2" onClick={openSettlement} disabled={!ledgerDriver || Number(ledgerDriver.advanceBalance ?? 0) <= 0}>
               Clear Net Balance
            </button>
          </>
        )}>
        <div className="space-y-6">
          <div className="p-5 bg-amber-900 border border-amber-800 rounded-3xl shadow-lg shadow-amber-900/10 flex items-center justify-between">
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-amber-400 mb-1">Total Outstanding Advance</div>
              <div className="text-2xl font-black text-white leading-none">{ledgerDriver ? fmt(ledgerDriver.advanceBalance) : '—'}</div>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-amber-800 flex items-center justify-center text-amber-400"><Wallet size={24} /></div>
          </div>
          <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
            <DataTable 
               columns={[
                { key: 'date', label: 'Date', render: (r: LedgerEntry) => <span className="text-slate-600 font-medium">{new Date(r.date).toLocaleDateString('en-PK')}</span> },
                { key: 'type', label: 'Nature', render: (r: LedgerEntry) => <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${r.type === 'DEBIT' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>{r.type}</span> },
                { key: 'weightKg', label: 'Weight', align: 'right', render: (r: LedgerEntry) => <span className="font-medium text-slate-700 whitespace-nowrap">{formatLedgerWeight(r.weightKg)}</span> },
                { key: 'ratePerKg', label: 'Rate', align: 'right', render: (r: LedgerEntry) => <span className="font-medium text-slate-700 whitespace-nowrap">{formatLedgerRate(r)}</span> },
                { key: 'amount', label: 'Value', align: 'right', render: (r: LedgerEntry) => <span className="font-bold text-slate-900">{fmt(r.amount)}</span> },
                { key: 'runningBalance', label: 'Running', align: 'right', render: (r: LedgerEntry) => <span className="font-black text-slate-900">{fmt(r.runningBalance)}</span> },
                { key: 'narration', label: 'Details', render: (r: LedgerEntry) => <span className="text-xs text-slate-400 italic">{r.narration || '—'}</span> },
              ]} 
              data={advances} 
              emptyMessage="No financial history for this driver." 
            />
          </div>
        </div>
      </Modal>

      <Modal open={settlementOpen} onClose={() => setSettlementOpen(false)} title={`Balance Settlement — ${ledgerDriver?.name}`}
        footer={(
          <>
            <button className="px-5 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors" onClick={() => setSettlementOpen(false)}>Cancel</button>
            <button className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-emerald-100 transition-all flex items-center gap-2" onClick={handleSettlement} disabled={settlementSaving}>{settlementSaving && <Loader2 size={16} className="animate-spin" />} Commit Settlement</button>
          </>
        )}>
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1">Repayment Value *</label>
              <input type="number" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold focus:bg-white outline-none" value={settlementForm.amount} onChange={e => setSettlementForm(p => ({ ...p, amount: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1">Payment Channel</label>
              <select className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold" value={settlementForm.paymentMode} onChange={e => setSettlementForm(p => ({ ...p, paymentMode: e.target.value as any }))}>
                <option value="CASH">CASH</option>
                <option value="ONLINE">ONLINE TRANSFER</option>
              </select>
            </div>
            {settlementForm.paymentMode !== 'CASH' && (
              <div className="space-y-1.5 md:col-span-2 p-4 bg-slate-50 rounded-2xl border border-slate-100 grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Provider</label>
                  <select className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold" value={settlementForm.paymentProvider} onChange={e => setSettlementForm(p => ({ ...p, paymentProvider: e.target.value }))}>
                    {ONLINE_PROVIDER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Reference No</label>
                  <input className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold" value={settlementForm.paymentReference} onChange={e => setSettlementForm(p => ({ ...p, paymentReference: e.target.value }))} placeholder="Txn ID" />
                </div>
              </div>
            )}
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1">Settlement Memo</label>
              <input className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:bg-white outline-none" value={settlementForm.narration} onChange={e => setSettlementForm(p => ({ ...p, narration: e.target.value }))} placeholder="Remarks..." />
            </div>
          </div>
        </div>
      </Modal>

    </AppLayout>
  );
}
