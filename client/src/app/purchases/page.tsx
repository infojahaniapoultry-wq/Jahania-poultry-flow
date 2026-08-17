'use client';
import { useEffect, useState, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import Modal from '@/components/Modal';
import SalesInvoiceModal from '@/components/SalesInvoiceModal';
import api from '@/lib/api';
import { toast } from 'react-hot-toast';
import { Plus, RefreshCw, ShoppingCart, Truck, Scale, DollarSign, CreditCard, Info, Loader2 } from 'lucide-react';
import DatePicker from '@/components/DatePicker';
import { BUSINESS_DATA_UPDATED_EVENT, notifyBusinessDataUpdated } from '@/lib/business-events';
import { getCachedPageData, setCachedPageData } from '@/lib/page-cache';
import { BANK_OPTIONS, ONLINE_PROVIDER_OPTIONS } from '../finance/shared';

interface Vendor {
  id: number;
  name: string;
  currentBalance?: string | number;
  isActive?: boolean;
}

interface Driver {
  id: number;
  name: string;
  defaultCharge?: string | number;
}

interface ChequeOption {
  id: number;
  chequeNo: string;
  bankName: string;
  chequeDate: string;
  amount: string | number;
  receivedFrom?: string | null;
  sourceType?: string | null;
  purchase?: { id: number; vendor?: { id: number; name: string } } | null;
  invoice?: { id: number; customer?: { id: number; shopName: string } } | null;
}

interface StockSummary {
  purchasedWeight: number;
  soldWeight: number;
  availableWeight: number;
}

type PaymentMode = 'CASH' | 'UDHAR' | 'CHEQUE' | 'ONLINE';
type OnlineProvider = 'JAZZCASH' | 'EASYPAISA' | 'NAYAPAY' | 'BANK_TRANSFER' | 'OTHER';

const getPKTDate = () => {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Karachi' }));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const getEmptyForm = () => ({
  vendorId: '',
  driverId: '',
  driverCharge: '',
  date: getPKTDate(),
  weightKg: '',
  ratePerKg: '',
  settledAmount: '',
  paymentMode: 'CASH' as PaymentMode,
  paymentProvider: 'JAZZCASH' as OnlineProvider,
  paymentReference: '',
  chequeNo: '',
  bankName: '',
  chequeDate: getPKTDate(),
  existingChequeId: '',
  chequeSource: 'new' as 'new' | 'existing',
  notes: '',
});
const CACHE_KEY = 'purchases-page';
const fmt = (n: string | number) => 'Rs. ' + Number(n ?? 0).toLocaleString('en-PK');

export default function PurchasesPage() {
  const [stock, setStock] = useState<StockSummary>({ purchasedWeight: 0, soldWeight: 0, availableWeight: 0 });
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [availableCheques, setAvailableCheques] = useState<ChequeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [sellingOpen, setSellingOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(getEmptyForm());
  const [saving, setSaving] = useState(false);

  const weight = Number(form.weightKg || 0);
  const amount = (weight * Number(form.ratePerKg || 0)).toFixed(2);
  const selectedVendor = vendors.find((v) => v.id === Number(form.vendorId));
  const selectedDriver = drivers.find((d) => d.id === Number(form.driverId));
  const effectiveDriverCharge = Number(form.driverCharge || selectedDriver?.defaultCharge || 0);
  const activeVendors = vendors.filter((vendor) => vendor.isActive !== false);

  const load = useCallback(async (force = false) => {
    if (!force) {
      const cached = getCachedPageData<{
        stock: StockSummary;
        vendors: Vendor[];
        drivers: Driver[];
        availableCheques: ChequeOption[];
      }>(CACHE_KEY);
      if (cached) {
        setStock(cached.stock);
        setVendors(cached.vendors);
        setDrivers(cached.drivers);
        setAvailableCheques(cached.availableCheques);
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    try {
      const [sr, vr, dr, cr] = await Promise.all([
        api.get('/reports/stock-summary'),
        api.get('/vendors'),
        api.get('/drivers'),
        api.get('/payments/cheques?status=PENDING'),
      ]);
      const nextStock = sr.data ?? { purchasedWeight: 0, soldWeight: 0, availableWeight: 0 };
      const nextAvailableCheques = (cr.data ?? []).filter((cheque: ChequeOption) => (cheque.sourceType ?? '').toUpperCase() !== 'PURCHASE');
      setStock(nextStock);
      setVendors(vr.data);
      setDrivers(dr.data);
      setAvailableCheques(nextAvailableCheques);
      setCachedPageData(CACHE_KEY, {
        stock: nextStock,
        vendors: vr.data,
        drivers: dr.data,
        availableCheques: nextAvailableCheques,
      });
    } catch {
      toast.error('Failed to load purchase workspace');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const handleBusinessUpdate = () => {
      void load(true);
    };

    window.addEventListener(BUSINESS_DATA_UPDATED_EVENT, handleBusinessUpdate);
    return () => window.removeEventListener(BUSINESS_DATA_UPDATED_EVENT, handleBusinessUpdate);
  }, [load]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.vendorId || !form.weightKg || !form.ratePerKg) {
      toast.error('Please fill all required fields');
      return;
    }
    if (!form.driverId) {
      toast.error('Select a driver');
      return;
    }
    const purchaseAmountValue = Number(form.weightKg || 0) * Number(form.ratePerKg || 0);
    const usingExistingCheque = form.paymentMode === 'CHEQUE' && form.chequeSource === 'existing';
    const selectedCheque = availableCheques.find((cheque) => String(cheque.id) === form.existingChequeId);
    const selectedChequeAmount = Number(selectedCheque?.amount ?? 0);
    const effectiveSettledAmount = usingExistingCheque
      ? selectedChequeAmount
      : form.settledAmount === ''
        ? (form.paymentMode === 'UDHAR' ? 0 : purchaseAmountValue)
        : Number(form.settledAmount);
    if (usingExistingCheque && !form.existingChequeId) {
      toast.error('Select an existing invoice cheque');
      return;
    }
    if (form.paymentMode === 'CHEQUE' && !usingExistingCheque && (!form.chequeNo || !form.bankName || !form.chequeDate)) {
      toast.error('Cheque details required');
      return;
    }
    if (form.paymentMode === 'ONLINE' && !form.paymentReference) {
      toast.error('Payment reference required');
      return;
    }
    if (effectiveSettledAmount > purchaseAmountValue) {
      toast.error('Paid amount cannot exceed purchase total');
      return;
    }
    if (form.paymentMode === 'UDHAR' && effectiveSettledAmount !== 0) {
      toast.error('Udhar purchases cannot include a paid amount');
      return;
    }
    
    setSaving(true);
    try {
      await api.post('/purchases', {
        vendorId: Number(form.vendorId),
        driverId: form.driverId ? Number(form.driverId) : undefined,
        driverCharge: form.driverId ? effectiveDriverCharge : undefined,
        date: new Date(form.date).toISOString(),
        weightKg: Number(form.weightKg),
        ratePerKg: Number(form.ratePerKg),
        paymentMode: form.paymentMode,
        paymentProvider: form.paymentMode === 'ONLINE' ? form.paymentProvider : undefined,
        paymentReference: form.paymentMode === 'ONLINE' ? form.paymentReference : undefined,
        settledAmount: effectiveSettledAmount,
        chequeNo: form.paymentMode === 'CHEQUE' && !usingExistingCheque ? form.chequeNo : undefined,
        bankName: form.paymentMode === 'CHEQUE' && !usingExistingCheque ? form.bankName : undefined,
        chequeDate: form.paymentMode === 'CHEQUE' && !usingExistingCheque ? new Date(form.chequeDate).toISOString() : undefined,
        existingChequeId: usingExistingCheque ? Number(form.existingChequeId) : undefined,
        notes: form.notes || undefined,
      });
      toast.success('Purchase recorded!');
      setOpen(false);
      setForm(getEmptyForm());
      notifyBusinessDataUpdated();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const paymentMode = form.paymentMode;
  const showCheque = paymentMode === 'CHEQUE';
  const showOnline = paymentMode === 'ONLINE';
  const usingExistingCheque = showCheque && form.chequeSource === 'existing';
  const purchaseAmountValue = Number(amount || 0);
  const selectedCheque = availableCheques.find((cheque) => String(cheque.id) === form.existingChequeId);
  const selectedChequeAmount = Number(selectedCheque?.amount ?? 0);
  const effectiveSettledAmount = usingExistingCheque
    ? selectedChequeAmount
    : form.settledAmount === ''
      ? (form.paymentMode === 'UDHAR' ? 0 : purchaseAmountValue)
      : Number(form.settledAmount || 0);
  const balanceAfterPayment = purchaseAmountValue - effectiveSettledAmount;

  return (
    <AppLayout>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight mb-2">Register</h1>
          <p className="text-slate-500 font-medium tracking-tight">Monitor live inventory and record new vendor intake.</p>
        </div>
        <div className="flex items-center gap-3 self-start">
          <button
            type="button"
            onClick={() => setSellingOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-bold text-sm shadow-lg shadow-slate-200 transition-all active:scale-95"
          >
            <ShoppingCart size={18} /> Selling
          </button>
          <button
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold text-sm shadow-lg shadow-emerald-200 transition-all active:scale-95"
            onClick={() => setOpen(true)}
          >
            <Plus size={18} /> New Purchase
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.3fr,0.7fr] gap-6 mb-8">
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-lg font-black text-slate-900 tracking-tight">Current Inventory</h2>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Live stock snapshot</p>
            </div>
            <button onClick={() => load(true)} className="p-2 rounded-xl text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all shrink-0" title="Refresh inventory">
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {([
              { label: 'Available Stock', value: stock.availableWeight, color: 'blue', icon: Scale },
              { label: 'Purchased Weight', value: stock.purchasedWeight, color: 'emerald', icon: ShoppingCart },
              { label: 'Sold Weight', value: stock.soldWeight, color: 'amber', icon: DollarSign },
            ] as const).map((item) => {
              const Icon = item.icon;
              const palettes = {
                blue: 'bg-blue-50 text-blue-600 border-blue-100',
                emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
                amber: 'bg-amber-50 text-amber-600 border-amber-100',
              } as const;

              return (
                <div key={item.label} className={`rounded-2xl border p-4 ${palettes[item.color]} shadow-sm`}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-[10px] font-black uppercase tracking-widest opacity-70">{item.label}</div>
                    <Icon size={16} />
                  </div>
                  <div className="text-2xl font-black tracking-tight leading-none">
                    {item.value.toFixed(2)} kg
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-emerald-900 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-emerald-800 rounded-full -mr-20 -mt-20 blur-3xl opacity-60" />
          <div className="relative z-10">
            <div className="text-[10px] font-black uppercase tracking-[0.35em] text-emerald-400 mb-2">Fast Entry</div>
            <h3 className="text-2xl font-black text-white tracking-tight mb-3">New Purchase</h3>
            <p className="text-sm text-emerald-100/80 leading-relaxed mb-6">Use the button below to open the purchase entry form and post a fresh inventory lot.</p>
            <button
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-emerald-700 rounded-2xl font-black text-sm shadow-lg shadow-black/10 transition-all active:scale-95"
              onClick={() => setOpen(true)}
            >
              <Plus size={18} /> New Purchase
            </button>
          </div>
        </div>
      </div>

      <SalesInvoiceModal
        open={sellingOpen}
        onClose={() => setSellingOpen(false)}
        onCreated={() => void load(true)}
      />

      {/* Entry Modal */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Record New Purchase"
        size="lg"
        footer={(
          <>
            <button className="px-5 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors" onClick={() => setOpen(false)}>Cancel</button>
            <button 
              className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-emerald-100 transition-all disabled:opacity-50 flex items-center gap-2" 
              onClick={handleSubmit} 
              disabled={saving}
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <ShoppingCart size={16} />}
              Save Purchase
            </button>
          </>
        )}
      >
        <div className="space-y-8 max-h-[70vh] overflow-y-auto pr-2 no-scrollbar">
          {/* Section: Basic Info */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded bg-emerald-50 flex items-center justify-center text-emerald-600">
                <Info size={14} />
              </div>
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Basic Information</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1">Vendor / Farmer *</label>
                <select 
                  name="vendorId" 
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all" 
                  value={form.vendorId} 
                  onChange={handleChange}
                >
                  <option value="">Select vendor</option>
                  {activeVendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Vendor Balance</div>
                  <div className="mt-1 text-sm font-bold text-slate-900">
                    {selectedVendor?.name ?? 'No vendor selected'}
                  </div>
                  <div className={`text-sm font-medium ${Number(selectedVendor?.currentBalance ?? 0) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {selectedVendor ? fmt(selectedVendor.currentBalance ?? 0) : 'Rs. 0'}
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1">Record Date</label>
                <DatePicker
                  value={form.date}
                  onChange={(date) => setForm((prev) => ({ ...prev, date }))}
                  className="!py-2.5 text-sm font-bold"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1 flex items-center gap-1.5">
                  <Truck size={12} /> Truck / Driver *
                </label>
                <select
                  name="driverId"
                  required
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all"
                  value={form.driverId}
                  onChange={(e) => {
                    const d = drivers.find((v) => v.id === Number(e.target.value));
                    setForm(p => ({ ...p, driverId: e.target.value, driverCharge: String(d?.defaultCharge ?? 0) }));
                  }}
                >
                  <option value="">Select truck / driver</option>
                  {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1">Driver Fare (Rs.)</label>
                <input
                  name="driverCharge"
                  type="number"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all"
                  value={form.driverCharge}
                  onChange={handleChange}
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* Section: Weight & Rates */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded bg-emerald-50 flex items-center justify-center text-emerald-600">
                <Scale size={14} />
              </div>
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Measurements & Cost</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1">Net Weight (kg) *</label>
                  <input 
                    name="weightKg" 
                    type="number" 
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all" 
                    value={form.weightKg} 
                    onChange={handleChange} 
                    placeholder="0.000" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1">Rate / kg *</label>
                  <input 
                    name="ratePerKg" 
                    type="number" 
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all" 
                    value={form.ratePerKg} 
                    onChange={handleChange} 
                  />
                </div>
              </div>

              {/* Amount Display */}
              <div className="bg-emerald-900 rounded-2xl p-5 flex flex-col justify-center relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-800 rounded-full -mr-12 -mt-12 blur-2xl opacity-50 transition-opacity group-hover:opacity-100" />
                <div className="relative z-10 flex flex-col">
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-1">Total Purchase Amount</span>
                  <span className="text-2xl font-black text-white leading-none tracking-tight">
                    Rs. {Number(amount).toLocaleString('en-PK')}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* Section: Payment */}
          <div className="space-y-4 pb-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded bg-emerald-50 flex items-center justify-center text-emerald-600">
                <CreditCard size={14} />
              </div>
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Payment Settlement</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1">Payment Mode *</label>
                <div className="grid grid-cols-2 gap-2">
                  {['CASH', 'UDHAR', 'CHEQUE', 'ONLINE'].map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setForm(p => ({ ...p, paymentMode: mode as any, settledAmount: mode === 'UDHAR' ? '0' : p.settledAmount }))}
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

              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <label className="text-[11px] font-black uppercase tracking-widest text-slate-400">Settled Amount (Rs.)</label>
                  {!usingExistingCheque && form.paymentMode !== 'UDHAR' && (
                    <button 
                      type="button" 
                      onClick={() => setForm(p => ({ ...p, settledAmount: String(purchaseAmountValue) }))}
                      className="text-[10px] font-black text-emerald-600 hover:text-emerald-700 uppercase tracking-widest"
                    >
                      Clear as Full
                    </button>
                  )}
                </div>
                <input
                  name="settledAmount"
                  type="number"
                  min="0"
                  max={usingExistingCheque || form.paymentMode === 'UDHAR' ? (usingExistingCheque ? selectedChequeAmount || 0 : 0) : purchaseAmountValue || undefined}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all disabled:opacity-50"
                  value={usingExistingCheque || form.paymentMode === 'UDHAR' ? String(usingExistingCheque ? selectedChequeAmount || 0 : 0) : form.settledAmount}
                  onChange={handleChange}
                  disabled={usingExistingCheque || form.paymentMode === 'UDHAR'}
                  placeholder={purchaseAmountValue ? purchaseAmountValue.toFixed(2) : '0.00'}
                />
                <div className={`text-[10px] font-bold uppercase tracking-wide px-1 ${
                  balanceAfterPayment > 0 ? 'text-amber-600' : balanceAfterPayment < 0 ? 'text-blue-600' : 'text-emerald-600'
                }`}>
                  {balanceAfterPayment === 0 ? 'Fully Settled' : balanceAfterPayment > 0 ? `Rs. ${balanceAfterPayment.toLocaleString('en-PK')} remains as Udhar` : `Rs. ${Math.abs(balanceAfterPayment).toLocaleString('en-PK')} as extra credit`}
                </div>
              </div>
            </div>

            {/* Dynamic Payment Fields */}
            {showCheque && (
              <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 space-y-4 animate-in slide-in-from-top-2">
                <div className="space-y-2">
                  <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1">Cheque Selection Strategy</label>
                  <select
                    className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:ring-4 focus:ring-emerald-500/10 outline-none"
                    value={form.chequeSource}
                    onChange={(e) => setForm((prev) => ({ ...prev, chequeSource: e.target.value as any }))}
                  >
                    <option value="new">Issue New Cheque</option>
                    <option value="existing">Re-use Received Invoice Cheque</option>
                  </select>
                </div>

                {usingExistingCheque ? (
                  <div className="space-y-3">
                    <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1 block">Pending Invoice Cheques</label>
                    <select
                      className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:ring-4 focus:ring-emerald-500/10 outline-none"
                      value={form.existingChequeId}
                      onChange={(e) => setForm((prev) => ({ ...prev, existingChequeId: e.target.value }))}
                    >
                    <option value="">Select a cheque in hand</option>
                    {availableCheques.map((cheque) => (
                      <option key={cheque.id} value={cheque.id}>
                          {cheque.chequeNo} - {cheque.bankName} (Rs. {Number(cheque.amount).toLocaleString('en-PK')})
                      </option>
                    ))}
                  </select>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cheque No</label>
                      <input name="chequeNo" className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold" value={form.chequeNo} onChange={handleChange} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Bank Name</label>
                      <select name="bankName" className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold" value={form.bankName} onChange={handleChange}>
                        <option value="">Select bank</option>
                        {BANK_OPTIONS.map((bank) => <option key={bank} value={bank}>{bank}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Maturity Date</label>
                      <DatePicker value={form.chequeDate} onChange={(d) => setForm(p => ({ ...p, chequeDate: d }))} className="!py-2 !text-xs font-bold" />
                    </div>
                  </div>
                )}
              </div>
            )}

            {showOnline && (
              <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in slide-in-from-top-2">
                <div className="space-y-2">
                  <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1">Platform / Provider</label>
                  <select name="paymentProvider" className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold" value={form.paymentProvider} onChange={handleChange}>
                    {ONLINE_PROVIDER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1">Reference Number</label>
                  <input name="paymentReference" className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold" value={form.paymentReference} onChange={handleChange} placeholder="Txn ID..." />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1">Remarks / Internal Notes</label>
              <textarea 
                name="notes" 
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all resize-none h-20" 
                value={form.notes} 
                onChange={handleChange} 
                placeholder="Optionally add details about the lot, quality, or vendor arrangements..." 
              />
            </div>
          </div>
        </div>
      </Modal>
    </AppLayout>
  );
}
