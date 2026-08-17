'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, FileText, Info, Scale, CreditCard, Trash2, Loader2 } from 'lucide-react';
import Modal from '@/components/Modal';
import DatePicker from '@/components/DatePicker';
import api from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { toast } from 'react-hot-toast';
import { BUSINESS_DATA_UPDATED_EVENT, notifyBusinessDataUpdated } from '@/lib/business-events';

type PaymentMode = 'CASH' | 'UDHAR' | 'CHEQUE' | 'ONLINE';
type OnlineProvider = 'JAZZCASH' | 'EASYPAISA' | 'BANK_TRANSFER' | 'OTHER';

interface Customer {
  id: number;
  shopName: string;
  currentBalance: string;
  isActive?: boolean;
  pricingBaseRateType?: 'FARM' | 'FINAL' | null;
  pricingOffsetDirection?: 'PLUS' | 'MINUS' | null;
  pricingOffsetValue?: string | number | null;
}

interface Driver {
  id: number;
  name: string;
  defaultCharge?: string;
}

interface Item {
  rowId: string;
  quantityKg: string;
  ratePerKg: string;
}

interface MarketRate {
  effectiveDate: string;
  farmRate: number | string;
  finalRate: number | string;
}

interface SalesInvoiceModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
  invoiceId?: number;
}

const getPKTDate = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
};

const emptyItem = (ratePerKg = ''): Item => ({
  rowId: crypto.randomUUID(),
  quantityKg: '',
  ratePerKg,
});

const fmt = (n: string | number) => 'Rs. ' + Number(n ?? 0).toLocaleString('en-PK');

export default function SalesInvoiceModal({ open, onClose, onCreated, invoiceId }: SalesInvoiceModalProps) {
  const { user } = useAuth();
  const today = getPKTDate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<Item[]>([emptyItem()]);
  const [manualRateOverride, setManualRateOverride] = useState(false);
  const [marketRate, setMarketRate] = useState<MarketRate | null>(null);
  const [rateLoading, setRateLoading] = useState(false);
  const [rateError, setRateError] = useState('');
  const [form, setForm] = useState({
    customerId: '',
    driverId: '',
    driverCharge: '',
    date: today,
    notes: '',
    paymentMode: 'CASH' as PaymentMode,
    paymentProvider: 'JAZZCASH' as OnlineProvider,
    paymentReference: '',
    chequeNo: '',
    bankName: '',
    chequeDate: today,
    settledAmount: '',
  });

  const activeCustomers = useMemo(
    () => customers.filter((customer) => customer.isActive !== false),
    [customers],
  );
  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === Number(form.customerId)),
    [customers, form.customerId],
  );
  const selectedDriver = useMemo(
    () => drivers.find((driver) => driver.id === Number(form.driverId)),
    [drivers, form.driverId],
  );
  const computedTotal = useMemo(
    () => items.reduce((sum, item) => sum + Number(item.quantityKg || 0) * Number(item.ratePerKg || 0), 0),
    [items],
  );
  const effectiveDriverCharge = Number(form.driverCharge || selectedDriver?.defaultCharge || 0);
  const effectiveSettledAmount = form.settledAmount === ''
    ? (form.paymentMode === 'UDHAR' ? 0 : computedTotal)
    : Number(form.settledAmount || 0);
  const balanceAfterPayment = computedTotal - effectiveSettledAmount;

  const resetForm = useCallback(() => {
    setForm({
      customerId: '',
      driverId: '',
      driverCharge: '',
      date: getPKTDate(),
      notes: '',
      paymentMode: 'CASH',
      paymentProvider: 'JAZZCASH',
      paymentReference: '',
      chequeNo: '',
      bankName: '',
      chequeDate: getPKTDate(),
      settledAmount: '',
    });
    setManualRateOverride(false);
    setMarketRate(null);
    setRateError('');
    setItems([emptyItem()]);
  }, []);

  const loadBasics = useCallback(async () => {
    setLoading(true);
    try {
      const [customerRes, driverRes] = await Promise.all([
        api.get('/customers'),
        api.get('/drivers'),
      ]);
      setCustomers(customerRes.data ?? []);
      setDrivers(driverRes.data ?? []);
    } catch {
      toast.error('Failed to load selling form');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadInvoice = useCallback(async (id: number) => {
    setLoading(true);
    try {
      const response = await api.get(`/invoices/${id}`);
      const invoice = response.data;
      const date = new Date(invoice.date).toISOString().slice(0, 10);
      const chequeDate = invoice.chequeLog?.chequeDate
        ? new Date(invoice.chequeLog.chequeDate).toISOString().slice(0, 10)
        : date;
      setForm({
        customerId: String(invoice.customerId),
        driverId: String(invoice.driverId),
        driverCharge: String(invoice.driverCharge ?? ''),
        date,
        notes: invoice.notes ?? '',
        paymentMode: invoice.paymentMode ?? 'CASH',
        paymentProvider: invoice.paymentProvider ?? invoice.onlinePaymentLog?.provider ?? 'JAZZCASH',
        paymentReference: invoice.paymentReference ?? invoice.onlinePaymentLog?.referenceNo ?? '',
        chequeNo: invoice.chequeLog?.chequeNo ?? '',
        bankName: invoice.chequeLog?.bankName ?? '',
        chequeDate,
        settledAmount: String(invoice.settledAmount ?? 0),
      });
      setItems((invoice.items ?? []).map((item: any) => ({
        rowId: crypto.randomUUID(),
        quantityKg: String(item.netWeight ?? 0),
        ratePerKg: String(item.ratePerKg ?? 0),
      })));
      // Existing item rates are already approved values. Only administrators
      // can preserve them as a manual override during an edit.
      setManualRateOverride(user?.role === 'ADMIN');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to load invoice');
      onClose();
    } finally {
      setLoading(false);
    }
  }, [onClose, user?.role]);

  const loadMarketRate = useCallback(async (date: string) => {
    setRateLoading(true);
    try {
      const response = await api.get<MarketRate>(`/market-rates/effective?date=${date}`);
      setMarketRate(response.data);
      setRateError('');
    } catch (error: any) {
      setMarketRate(null);
      setRateError(error.response?.data?.message || 'No market rates are available for this invoice date');
    } finally {
      setRateLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && form.date) void loadMarketRate(form.date);
  }, [form.date, loadMarketRate, open]);

  const calculatedRate = useMemo(() => {
    if (!selectedCustomer || !marketRate) return null;
    if (!selectedCustomer.pricingBaseRateType || !selectedCustomer.pricingOffsetDirection || selectedCustomer.pricingOffsetValue == null) return null;
    const baseRate = selectedCustomer.pricingBaseRateType === 'FARM' ? Number(marketRate.farmRate) : Number(marketRate.finalRate);
    const offset = Number(selectedCustomer.pricingOffsetValue);
    const value = selectedCustomer.pricingOffsetDirection === 'MINUS' ? baseRate - offset : baseRate + offset;
    return Number.isFinite(value) && value > 0 ? value : null;
  }, [marketRate, selectedCustomer]);

  useEffect(() => {
    if (manualRateOverride) return;
    const rate = calculatedRate == null ? '' : calculatedRate.toFixed(2);
    setItems((previous) => previous.map((item) => ({ ...item, ratePerKg: rate })));
  }, [calculatedRate, manualRateOverride]);

  useEffect(() => {
    if (!open) return;
    resetForm();
    void loadBasics();
    if (invoiceId) void loadInvoice(invoiceId);
  }, [invoiceId, loadBasics, loadInvoice, open, resetForm]);

  useEffect(() => {
    if (!open) return;
    const handleBusinessUpdate = () => {
      void loadBasics();
    };

    window.addEventListener(BUSINESS_DATA_UPDATED_EVENT, handleBusinessUpdate);
    return () => window.removeEventListener(BUSINESS_DATA_UPDATED_EVENT, handleBusinessUpdate);
  }, [loadBasics, open]);

  const updateItem = (rowId: string, field: keyof Omit<Item, 'rowId'>, value: string) => {
    setItems((prev) => prev.map((item) => (item.rowId === rowId ? { ...item, [field]: value } : item)));
  };

  const handleSubmit = async () => {
    if (!form.customerId || !form.driverId || items.some((item) => !item.quantityKg || !item.ratePerKg)) {
      toast.error('Please complete all required fields');
      return;
    }
    if (!manualRateOverride && (!calculatedRate || rateError)) {
      toast.error(rateError || 'A valid customer market rate is required');
      return;
    }
    if (form.paymentMode === 'CHEQUE' && (!form.chequeNo || !form.bankName || !form.chequeDate)) {
      toast.error('Cheque details are required');
      return;
    }
    if (form.paymentMode === 'ONLINE' && !form.paymentReference) {
      toast.error('Payment reference is required');
      return;
    }
    if (effectiveSettledAmount > computedTotal) {
      toast.error('Paid amount cannot exceed invoice total');
      return;
    }
    if (form.paymentMode === 'UDHAR' && effectiveSettledAmount !== 0) {
      toast.error('Udhar invoices cannot include a paid amount');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        customerId: Number(form.customerId),
        driverId: Number(form.driverId),
        driverCharge: effectiveDriverCharge || undefined,
        paymentMode: form.paymentMode,
        paymentProvider: form.paymentMode === 'ONLINE' ? form.paymentProvider : undefined,
        paymentReference: form.paymentMode === 'ONLINE' ? form.paymentReference : undefined,
        settledAmount: effectiveSettledAmount,
        manualRateOverride,
        chequeNo: form.paymentMode === 'CHEQUE' ? form.chequeNo : undefined,
        bankName: form.paymentMode === 'CHEQUE' ? form.bankName : undefined,
        chequeDate: form.paymentMode === 'CHEQUE' ? new Date(form.chequeDate).toISOString() : undefined,
        date: new Date(form.date).toISOString(),
        notes: form.notes || undefined,
        items: items.map((item) => ({
          quantityKg: Number(item.quantityKg),
          ratePerKg: Number(item.ratePerKg),
        })),
      };
      if (invoiceId) {
        await api.patch(`/invoices/${invoiceId}`, payload);
      } else {
        await api.post('/invoices', payload);
      }
      toast.success(invoiceId ? 'Invoice updated!' : 'Invoice created!');
      notifyBusinessDataUpdated();
      onCreated?.();
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Generate Sales Invoice"
      size="lg"
      footer={(
        <>
          <button className="px-5 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors" onClick={onClose}>Cancel</button>
          <button
            className="px-6 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-lg shadow-emerald-100 transition-all disabled:opacity-50 flex items-center gap-2"
            onClick={handleSubmit}
            disabled={saving || loading || rateLoading || (!manualRateOverride && (!calculatedRate || !!rateError))}
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
            {invoiceId ? 'Save Changes' : 'Create Invoice'}
          </button>
        </>
      )}
    >
      <div className="space-y-4 max-h-[72vh] overflow-y-auto pr-2 no-scrollbar">
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
              <Info size={14} />
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Party & Dispatch</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1">Customer / Shop *</label>
              <select
                className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all"
                value={form.customerId}
                onChange={(e) => setForm((prev) => ({ ...prev, customerId: e.target.value }))}
              >
                <option value="">Select customer</option>
                {activeCustomers.map((customer) => (
                  <option key={customer.id} value={customer.id}>{customer.shopName}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1">Assigned Driver *</label>
              <select
                className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all"
                required
                value={form.driverId}
                onChange={(e) => {
                  const driver = drivers.find((item) => item.id === Number(e.target.value));
                  setForm((prev) => ({
                    ...prev,
                    driverId: e.target.value,
                    driverCharge: driver?.defaultCharge ?? '',
                  }));
                }}
              >
                <option value="">Select driver</option>
                {drivers.map((driver) => (
                  <option key={driver.id} value={driver.id}>{driver.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1">Invoice Date</label>
              <DatePicker
                value={form.date}
                onChange={(value) => setForm((prev) => ({ ...prev, date: value }))}
              />
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1">Driver Charge</label>
              <input
                type="number"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all"
                value={form.driverCharge}
                onChange={(e) => setForm((prev) => ({ ...prev, driverCharge: e.target.value }))}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Customer Balance</div>
              <div className="mt-1 text-sm font-bold text-slate-900">{selectedCustomer?.shopName ?? 'No customer selected'}</div>
              <div className="text-sm text-slate-600">{selectedCustomer ? fmt(selectedCustomer.currentBalance) : 'Rs. 0'}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Driver Charge</div>
              <div className="mt-1 text-sm font-bold text-slate-900">{selectedDriver?.name ?? 'No driver selected'}</div>
              <div className="text-sm text-slate-600">{fmt(effectiveDriverCharge)}</div>
            </div>
          </div>

          <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-700">Market Pricing</div>
                {selectedCustomer && !selectedCustomer.pricingBaseRateType && (
                  <div className="mt-1 text-xs font-semibold text-rose-600">This customer does not have a pricing rule configured.</div>
                )}
                {rateLoading && <div className="mt-1 text-xs text-slate-500">Loading effective market rates...</div>}
                {!rateLoading && rateError && <div className="mt-1 text-xs font-semibold text-rose-600">{rateError}</div>}
                {!rateLoading && !rateError && calculatedRate != null && selectedCustomer && marketRate && (
                  <div className="mt-1 text-xs text-slate-600">
                    {selectedCustomer.pricingBaseRateType} rate {selectedCustomer.pricingOffsetDirection === 'MINUS' ? 'minus' : 'plus'} Rs. {Number(selectedCustomer.pricingOffsetValue).toFixed(2)} = <span className="font-black text-slate-900">{fmt(calculatedRate)} / kg</span>
                    <span className="ml-2 text-slate-400">Effective {marketRate.effectiveDate.slice(0, 10)}</span>
                  </div>
                )}
              </div>
              {user?.role === 'ADMIN' && (
                <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={manualRateOverride}
                    onChange={(event) => setManualRateOverride(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  Override item rates
                </label>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                <Scale size={14} />
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Inventory Allocation</div>
                <div className="text-xs text-slate-500">One row per batch.</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setItems((prev) => [...prev, emptyItem(!manualRateOverride && calculatedRate != null ? calculatedRate.toFixed(2) : '')])}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-white"
            >
              <Plus size={12} />
              Add Row
            </button>
          </div>

          <div className="space-y-3">
            {items.map((item, index) => (
              <div key={item.rowId} className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[1.15fr,1fr,auto] sm:items-center">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 border border-slate-200">
                    {String(index + 1).padStart(2, '0')}
                  </div>
                  <input
                    className="w-full rounded-xl border border-slate-100 bg-white px-3 py-2 text-xs font-bold outline-none transition-all focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                    type="number"
                    step="0.001"
                    placeholder="Chicken Quantity (Kg)"
                    value={item.quantityKg}
                    onChange={(e) => updateItem(item.rowId, 'quantityKg', e.target.value)}
                  />
                </div>
                <input
                  className="rounded-xl border border-slate-100 bg-white px-3 py-2 text-xs font-bold outline-none transition-all focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                  type="number"
                  step="0.01"
                  placeholder="Rate / Kg (Rs.)"
                  value={item.ratePerKg}
                  disabled={!manualRateOverride}
                  onChange={(e) => updateItem(item.rowId, 'ratePerKg', e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setItems((prev) => prev.filter((row) => row.rowId !== item.rowId))}
                  disabled={items.length === 1}
                  className="rounded-xl border border-transparent p-2 text-slate-300 transition-colors hover:bg-white hover:text-red-500 disabled:opacity-0"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Estimated Invoice Total</div>
            <div className="flex flex-wrap items-center gap-2 text-sm font-bold">
              <span className="rounded-full bg-white px-3 py-1 border border-slate-200 text-slate-700">{fmt(computedTotal)}</span>
              <span className="rounded-full bg-emerald-50 px-3 py-1 border border-emerald-100 text-emerald-700">
                {balanceAfterPayment === 0 ? 'Fully settled' : balanceAfterPayment > 0 ? `Remaining: ${fmt(balanceAfterPayment)}` : `Extra: ${fmt(Math.abs(balanceAfterPayment))}`}
              </span>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
              <CreditCard size={14} />
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Financial Settlement</div>
              <div className="text-xs text-slate-500">Settle now or leave it as udhar.</div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1">Payment Protocol *</label>
              <div className="grid grid-cols-2 gap-2">
                {(['CASH', 'UDHAR', 'CHEQUE', 'ONLINE'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setForm((prev) => ({
                      ...prev,
                      paymentMode: mode,
                      settledAmount: mode === 'UDHAR' ? '0' : prev.settledAmount,
                    }))}
                    className={`rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-[0.24em] transition-all ${
                      form.paymentMode === mode
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-emerald-200'
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
                {form.paymentMode !== 'UDHAR' && (
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, settledAmount: String(computedTotal) }))}
                    className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-600 hover:text-emerald-700"
                  >
                    Paid as Full
                  </button>
                )}
              </div>
              <input
                name="settledAmount"
                type="number"
                min="0"
                max={form.paymentMode === 'UDHAR' ? 0 : computedTotal || undefined}
                className="w-full rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold outline-none transition-all focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10 disabled:opacity-50"
                value={form.paymentMode === 'UDHAR' ? '0' : form.settledAmount}
                onChange={(e) => setForm((prev) => ({ ...prev, settledAmount: e.target.value }))}
                disabled={form.paymentMode === 'UDHAR'}
                placeholder={computedTotal ? computedTotal.toFixed(2) : '0.00'}
              />
              <div className={`text-[10px] font-black uppercase tracking-[0.2em] px-1 ${
                balanceAfterPayment > 0 ? 'text-amber-600' : balanceAfterPayment < 0 ? 'text-blue-600' : 'text-emerald-600'
              }`}>
                {balanceAfterPayment === 0
                  ? 'Fully Settled'
                  : balanceAfterPayment > 0
                    ? `Rs. ${balanceAfterPayment.toLocaleString('en-PK')} remains as Udhar`
                    : `Rs. ${Math.abs(balanceAfterPayment).toLocaleString('en-PK')} as extra credit`}
              </div>
            </div>
          </div>

          {form.paymentMode === 'CHEQUE' && (
            <div className="mt-4 grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cheque No</label>
                <input className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold outline-none" value={form.chequeNo} onChange={(e) => setForm((prev) => ({ ...prev, chequeNo: e.target.value }))} placeholder="CH-001" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Bank Name</label>
                <input className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold outline-none" value={form.bankName} onChange={(e) => setForm((prev) => ({ ...prev, bankName: e.target.value }))} placeholder="Main Bank" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cheque Date</label>
                <DatePicker value={form.chequeDate} onChange={(value) => setForm((prev) => ({ ...prev, chequeDate: value }))} />
              </div>
            </div>
          )}

          {form.paymentMode === 'ONLINE' && (
            <div className="mt-4 grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Provider</label>
                <select className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold outline-none" value={form.paymentProvider} onChange={(e) => setForm((prev) => ({ ...prev, paymentProvider: e.target.value as OnlineProvider }))}>
                  <option value="JAZZCASH">JazzCash</option>
                  <option value="EASYPAISA">Easypaisa</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Reference No</label>
                <input className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold outline-none" value={form.paymentReference} onChange={(e) => setForm((prev) => ({ ...prev, paymentReference: e.target.value }))} placeholder="Txn ID" />
              </div>
            </div>
          )}

          <div className="mt-4 space-y-2">
            <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1">Notes</label>
            <textarea
              className="min-h-20 w-full rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-medium outline-none transition-all focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10"
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Optional invoice notes"
            />
          </div>
        </section>
      </div>
    </Modal>
  );
}
