'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, RefreshCw, Users, Package2, Search, Loader2, Info, Phone, ArrowDownLeft } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import DataTable, { Column } from '@/components/DataTable';
import DatePicker from '@/components/DatePicker';
import Modal from '@/components/Modal';
import api from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { toast } from 'react-hot-toast';
import { BUSINESS_DATA_UPDATED_EVENT, notifyBusinessDataUpdated } from '@/lib/business-events';
import { getCachedPageData, setCachedPageData } from '@/lib/page-cache';
import {
  CustomerRow,
  fmt,
  getErrorMessage,
  OnlineProvider,
  BANK_OPTIONS,
  ONLINE_PROVIDER_OPTIONS,
  VendorRow,
} from '../shared';

type PartyRole = 'CUSTOMER' | 'VENDOR';
type PartyFilter = 'ALL' | PartyRole;
type SettlementMode = 'CASH' | 'CHEQUE' | 'ONLINE';
const CACHE_KEY = 'finance-credit-page';

interface PartyBalanceRow {
  id: number;
  role: PartyRole;
  name: string;
  contact: string | null;
  balance: number;
  openingBalance: number;
}

const getPKTDate = () => {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Karachi' }));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

interface SettlementForm {
  amount: string;
  date: string;
  paymentMode: SettlementMode;
  paymentProvider: OnlineProvider;
  paymentReference: string;
  chequeNo: string;
  bankName: string;
  chequeDate: string;
  narration: string;
}

function buildPartyRows(customers: CustomerRow[], vendors: VendorRow[]) {
  const customerRows = customers
    .filter((customer) => Number(customer.currentBalance ?? 0) > 0)
    .map((customer) => ({
      id: customer.id,
      role: 'CUSTOMER' as const,
      name: customer.shopName,
      contact: customer.contact ?? null,
      balance: Number(customer.currentBalance ?? 0),
      openingBalance: Number(customer.openingBalance ?? 0),
    }));

  const vendorRows = vendors
    .filter((vendor) => Number(vendor.currentBalance ?? 0) > 0)
    .map((vendor) => ({
      id: vendor.id,
      role: 'VENDOR' as const,
      name: vendor.name,
      contact: vendor.contact ?? null,
      balance: Number(vendor.currentBalance ?? 0),
      openingBalance: Number(vendor.openingBalance ?? 0),
    }));

  return [...customerRows, ...vendorRows];
}

export default function FinanceCreditPage() {
  const { user } = useAuth();
  const canSettle = user?.role === 'ADMIN' || user?.role === 'DATA_ENTRY';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [partyFilter, setPartyFilter] = useState<PartyFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [selectedParty, setSelectedParty] = useState<PartyBalanceRow | null>(null);
  const [settlementDate, setSettlementDate] = useState(getPKTDate());
  const [form, setForm] = useState<SettlementForm>({
    amount: '',
    date: getPKTDate(),
    paymentMode: 'CASH',
    paymentProvider: 'JAZZCASH',
    paymentReference: '',
    chequeNo: '',
    bankName: '',
    chequeDate: getPKTDate(),
    narration: '',
  });

  const openSettlement = (row: PartyBalanceRow) => {
    setSelectedParty(row);
    setForm({
      amount: String(row.balance),
      date: settlementDate,
      paymentMode: 'CASH',
      paymentProvider: 'JAZZCASH',
      paymentReference: '',
      chequeNo: '',
      bankName: '',
      chequeDate: getPKTDate(),
      narration: '',
    });
  };

  const load = useCallback(async (force = false) => {
    if (!force) {
      const cached = getCachedPageData<{ customers: CustomerRow[]; vendors: VendorRow[] }>(CACHE_KEY);
      if (cached) {
        setCustomers(cached.customers);
        setVendors(cached.vendors);
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    try {
      const [customerRes, vendorRes] = await Promise.all([api.get('/customers'), api.get('/vendors')]);
      setCustomers(customerRes.data as CustomerRow[]);
      setVendors(vendorRes.data as VendorRow[]);
      setCachedPageData(CACHE_KEY, { customers: customerRes.data as CustomerRow[], vendors: vendorRes.data as VendorRow[] });
    } catch {
      toast.error('Failed to load udhar data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const handleBusinessDataUpdated = () => {
      void load(true);
    };

    window.addEventListener(BUSINESS_DATA_UPDATED_EVENT, handleBusinessDataUpdated);
    return () => window.removeEventListener(BUSINESS_DATA_UPDATED_EVENT, handleBusinessDataUpdated);
  }, [load]);

  const allRows = useMemo(() => buildPartyRows(customers, vendors), [customers, vendors]);

  const visibleRows = useMemo(() => {
    return allRows.filter((row) => {
      const matchesFilter = partyFilter === 'ALL' || row.role === partyFilter;
      const matchesSearch = row.name.toLowerCase().includes(searchQuery.toLowerCase()) || (row.contact || '').includes(searchQuery);
      return matchesFilter && matchesSearch;
    });
  }, [allRows, partyFilter, searchQuery]);

  const summary = useMemo(() => {
    const customerUdhar = allRows.filter((row) => row.role === 'CUSTOMER').reduce((sum, row) => sum + row.balance, 0);
    const vendorUdhar = allRows.filter((row) => row.role === 'VENDOR').reduce((sum, row) => sum + row.balance, 0);
    return { customerUdhar, vendorUdhar, totalUdhar: customerUdhar + vendorUdhar, parties: allRows.length };
  }, [allRows]);

  const saveSettlement = async () => {
    if (!selectedParty) return;
    const amount = Number(form.amount);
    if (!amount || amount <= 0) { toast.error('Enter a valid amount'); return; }
    if (amount > selectedParty.balance) {
      toast.error('Settlement cannot exceed the current udhar balance');
      return;
    }
    if (form.paymentMode === 'CHEQUE' && (!form.chequeNo || !form.bankName || !form.chequeDate)) {
      toast.error('Cheque number, bank name, and maturity date are required');
      return;
    }
    if (form.paymentMode === 'ONLINE' && !form.paymentReference) {
      toast.error('Payment reference is required');
      return;
    }
    setSaving(true);
    try {
      const chequeMeta = form.paymentMode === 'CHEQUE'
        ? [form.chequeNo, form.bankName, form.chequeDate].filter(Boolean).join(' | ')
        : '';
        const payload: Record<string, unknown> = {
          type: selectedParty.role === 'CUSTOMER' ? 'RECOVERY' : 'DEBIT',
          amount,
          date: new Date(form.date).toISOString(),
          paymentMode: form.paymentMode,
        narration: ['Credit settlement', chequeMeta, form.narration].filter(Boolean).join(' - '),
        reference:
          form.paymentMode === 'CHEQUE'
            ? form.chequeNo || undefined
            : form.paymentMode === 'ONLINE'
              ? form.paymentReference || undefined
              : undefined,
        };
        if (selectedParty.role === 'CUSTOMER') payload.customerId = selectedParty.id; else payload.vendorId = selectedParty.id;
        if (form.paymentMode === 'ONLINE') {
          payload.paymentProvider = form.paymentProvider;
          payload.paymentReference = form.paymentReference || undefined;
        } else if (form.paymentMode === 'CHEQUE') {
          payload.paymentReference = form.chequeNo || undefined;
          payload.chequeNo = form.chequeNo || undefined;
          payload.bankName = form.bankName || undefined;
          payload.chequeDate = form.chequeDate ? new Date(form.chequeDate).toISOString() : undefined;
        }
        await api.post('/vouchers', payload);
      toast.success('Settlement record updated');
      setSelectedParty(null);
      notifyBusinessDataUpdated();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Failed to settle udhar'));
    } finally {
      setSaving(false);
    }
  };

  const columns: Column<PartyBalanceRow>[] = [
    {
      key: 'name',
      label: 'Stakeholder Name',
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${row.role === 'CUSTOMER' ? 'bg-amber-100 text-amber-600 shadow-sm shadow-amber-100' : 'bg-blue-100 text-blue-600 shadow-sm shadow-blue-100'}`}>
            {row.role === 'CUSTOMER' ? <Users size={18} /> : <Package2 size={18} />}
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-slate-900 leading-tight">{row.name}</span>
            <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">{row.role}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'contact',
      label: 'Contact',
      render: (row) => (
        <div className="flex items-center gap-1.5 text-slate-600 text-sm font-medium">
          <Phone size={12} className="text-slate-300" /> {row.contact || '—'}
        </div>
      ),
    },
    {
      key: 'balance',
      label: 'Current Net Debt',
      align: 'right',
      sortValue: (row) => row.balance,
      render: (row) => (
        <div className="flex flex-col items-end">
          <span className={`font-black ${row.role === 'CUSTOMER' ? 'text-amber-600' : 'text-blue-600'}`}>
            {fmt(row.balance)}
          </span>
          <span className="text-[10px] font-bold text-slate-300 uppercase tracking-tighter">{row.role === 'CUSTOMER' ? 'Receivable' : 'Payable'}</span>
        </div>
      ),
    },
    {
      key: 'openingBalance',
      label: 'Opening',
      align: 'right',
      render: (row) => <span className="text-xs font-bold text-slate-400">{fmt(row.openingBalance)}</span>,
    },
    {
      key: 'action',
      label: '',
      align: 'right',
      render: (row) => (
        <div className="flex justify-end">
          {canSettle ? (
            <button onClick={() => openSettlement(row)} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold text-[10px] uppercase tracking-widest shadow-lg shadow-emerald-100 transition-all active:scale-95 hover:bg-emerald-700">
               Settle Account
            </button>
          ) : (
            <span className="px-2 py-0.5 bg-slate-50 rounded text-[10px] font-bold text-slate-400 uppercase tracking-widest border border-slate-100">Audit Only</span>
          )}
        </div>
      ),
    },
  ];

  return (
    <AppLayout>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight mb-2">Credit Management</h1>
          <p className="text-slate-500 font-medium tracking-tight">Consolidated view of outstanding udhar. Settle balances across all business entities.</p>
        </div>
        <div className="flex flex-wrap items-end justify-end gap-3 self-start">
          <div className="min-w-[220px]">
            <label className="mb-1 ml-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Settlement date</label>
            <DatePicker value={settlementDate} onChange={(date) => setSettlementDate(date || getPKTDate())} />
          </div>
          <button onClick={() => load(true)} className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl transition-all active:scale-95">
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
        <div className="bg-amber-600 rounded-[32px] p-6 shadow-lg shadow-amber-100 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/20 rounded-full -mr-10 -mt-10 blur-2xl group-hover:scale-125 transition-transform" />
          <div className="relative z-10 flex flex-col h-full">
            <div className="flex items-center gap-2 text-amber-100/80 text-[10px] font-black uppercase tracking-widest mb-4">
              <ArrowDownLeft size={14} /> Total Receivables
            </div>
            <div className="text-3xl font-black text-white mt-auto">{fmt(summary.customerUdhar)}</div>
          </div>
        </div>
        <div className="bg-blue-600 rounded-[32px] p-6 shadow-lg shadow-blue-100 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/20 rounded-full -mr-10 -mt-10 blur-2xl group-hover:scale-125 transition-transform" />
          <div className="relative z-10 flex flex-col h-full">
            <div className="flex items-center gap-2 text-blue-100/80 text-[10px] font-black uppercase tracking-widest mb-4">
              <ArrowUpRight size={14} /> Total Payables
            </div>
            <div className="text-3xl font-black text-white mt-auto">{fmt(summary.vendorUdhar)}</div>
          </div>
        </div>
        <div className="bg-white border-2 border-slate-900 rounded-[32px] p-6 shadow-sm relative overflow-hidden md:col-span-2">
           <div className="relative z-10 flex flex-col h-full justify-center">
             <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 text-center">Net Outstanding Exposure</div>
             <div className="text-4xl font-black text-slate-900 text-center tracking-tighter">
               {summary.customerUdhar > summary.vendorUdhar ? '+' : ''}{fmt(summary.customerUdhar - summary.vendorUdhar)}
             </div>
           </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 mb-8">
        <div className="relative flex-1 group">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-900 transition-colors">
            <Search size={18} />
          </div>
          <input 
            type="text" 
            placeholder="Search party by name or contact number..."
            className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-medium focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all shadow-sm"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex p-1 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-x-auto no-scrollbar">
          {(['ALL', 'CUSTOMER', 'VENDOR'] as const).map(f => (
            <button
              key={f}
              onClick={() => setPartyFilter(f)}
              className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${partyFilter === f ? 'bg-slate-900 text-white shadow-md shadow-slate-200' : 'text-slate-400 hover:text-slate-600'}`}
            >
              {f === 'ALL' ? 'Everything' : f === 'CUSTOMER' ? 'Receivables' : 'Payables'}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-[32px] overflow-hidden shadow-sm animate-fade-in">
        <DataTable columns={columns} data={visibleRows} loading={loading} emptyMessage="No outstanding credit balances found." defaultSortKey="balance" defaultSortDirection="desc" hideSearch />
      </div>

      <Modal open={!!selectedParty} onClose={() => setSelectedParty(null)} title="Commit Settlement Entry" size="lg"
        footer={(
          <>
            <button className="px-5 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors" onClick={() => setSelectedParty(null)}>Cancel</button>
            <button className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold text-sm shadow-lg shadow-emerald-200 transition-all flex items-center gap-2" onClick={saveSettlement} disabled={saving || !selectedParty}>{saving && <Loader2 size={16} className="animate-spin" />} Clear Balance</button>
          </>
        )}>
        {selectedParty && (
          <div className="space-y-8">
            <div className={`p-6 rounded-[32px] flex items-center justify-between border shadow-lg shadow-slate-900/5 ${selectedParty.role === 'CUSTOMER' ? 'bg-amber-50 border-amber-100' : 'bg-blue-50 border-blue-100'}`}>
               <div>
                 <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Unsettled Value</div>
                 <div className={`text-3xl font-black ${selectedParty.role === 'CUSTOMER' ? 'text-amber-600' : 'text-blue-600'}`}>{fmt(selectedParty.balance)}</div>
               </div>
               <div className="text-right">
                 <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Account Entity</div>
                 <div className="text-sm font-black text-slate-900 uppercase tracking-tight">{selectedParty.name}</div>
               </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1">Repayment Value *</label>
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400 uppercase">Rs.</div>
                    <input type="number" className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-lg font-black focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1">Settlement Date</label>
                  <DatePicker value={form.date} onChange={(d) => setForm(p => ({ ...p, date: d }))} className="!py-2 !text-sm font-bold" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1">Payment Method</label>
                <div className="grid grid-cols-3 gap-2">
                    {(['CASH', 'CHEQUE', 'ONLINE'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setForm(p => ({
                          ...p,
                          paymentMode: mode,
                          paymentReference: mode === 'ONLINE' ? p.paymentReference : '',
                          chequeNo: mode === 'CHEQUE' ? p.chequeNo : '',
                          bankName: mode === 'CHEQUE' ? p.bankName : '',
                          chequeDate: mode === 'CHEQUE' ? p.chequeDate : getPKTDate(),
                        }))}
                        className={`py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                          form.paymentMode === mode
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-100'
                            : 'bg-slate-50 text-slate-500 border-slate-100 hover:border-emerald-200'
                        }`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1">Audit Narration</label>
                  <textarea className="w-full px-4 py-2 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-medium focus:bg-white outline-none resize-none" rows={2} value={form.narration} onChange={e => setForm(p => ({ ...p, narration: e.target.value }))} placeholder="Internal remarks..." />
                </div>
              </div>
            </div>

            {form.paymentMode === 'CHEQUE' && (
              <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-4 animate-in slide-in-from-top-2">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cheque No</label>
                  <input className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:ring-4 focus:ring-emerald-500/10 outline-none" value={form.chequeNo} onChange={e => setForm(p => ({ ...p, chequeNo: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Bank Name</label>
                  <select className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:ring-4 focus:ring-emerald-500/10 outline-none" value={form.bankName} onChange={e => setForm(p => ({ ...p, bankName: e.target.value }))}>
                    <option value="">Select bank</option>
                    {BANK_OPTIONS.map((bank) => <option key={bank} value={bank}>{bank}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Maturity Date</label>
                  <DatePicker value={form.chequeDate} onChange={(d) => setForm(p => ({ ...p, chequeDate: d }))} className="!py-2 !text-xs font-bold" popperPlacement="top-start" />
                </div>
              </div>
            )}

            {form.paymentMode === 'ONLINE' && (
              <div className="p-4 bg-slate-100/50 border border-slate-200 rounded-2xl grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Gateway</label>
                  <select className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none" value={form.paymentProvider} onChange={e => setForm(p => ({ ...p, paymentProvider: e.target.value as OnlineProvider }))}>
                    {ONLINE_PROVIDER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Txn Link</label>
                  <input className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none" value={form.paymentReference} onChange={e => setForm(p => ({ ...p, paymentReference: e.target.value }))} placeholder="Trans ID" />
                </div>
              </div>
            )}

            <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl flex gap-3 text-slate-500">
              <Info size={20} className="shrink-0 text-slate-400" />
              <p className="text-[11px] font-bold leading-relaxed tracking-tight">This settlement will generate a corresponding voucher and update the stakeholder&apos;s ledger immediately. The net balance shown is the latest snapshot from the system.</p>
            </div>
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}
