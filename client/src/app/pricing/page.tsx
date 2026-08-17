'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import DatePicker from '@/components/DatePicker';
import { useAuth } from '@/lib/auth';
import api from '@/lib/api';
import { notifyBusinessDataUpdated } from '@/lib/business-events';
import { toast } from 'react-hot-toast';
import { ArrowRight, CalendarDays, Info, Loader2, Save, Search, SlidersHorizontal, Users } from 'lucide-react';

interface MarketRate {
  id: number;
  effectiveDate: string;
  farmRate: number | string;
  finalRate: number | string;
  updatedAt?: string;
}

type PricingBaseRateType = 'FARM' | 'FINAL';
type PricingOffsetDirection = 'PLUS' | 'MINUS';
type CustomerRuleMode = 'ADJUSTMENT' | 'TOTAL';

interface Customer {
  id: number;
  shopName: string;
  contact?: string | null;
  isActive?: boolean;
  pricingBaseRateType?: PricingBaseRateType | null;
  pricingOffsetDirection?: PricingOffsetDirection | null;
  pricingOffsetValue?: number | string | null;
}

const calculateCustomerRate = (customer: Customer, farmRate: number, finalRate: number) => {
  if (!customer.pricingBaseRateType || !customer.pricingOffsetDirection || customer.pricingOffsetValue == null) return null;
  const baseRate = customer.pricingBaseRateType === 'FARM' ? farmRate : finalRate;
  const offset = Number(customer.pricingOffsetValue);
  const rate = customer.pricingOffsetDirection === 'MINUS' ? baseRate - offset : baseRate + offset;
  return Number.isFinite(rate) && rate > 0 ? rate : null;
};

const getPKTDate = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
};

const formatRate = (value: number | string) => `Rs. ${Number(value).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PricingPage() {
  const { user } = useAuth();
  const [marketRateForm, setMarketRateForm] = useState({ effectiveDate: getPKTDate(), farmRate: '', finalRate: '' });
  const [effectiveMarketRate, setEffectiveMarketRate] = useState<MarketRate | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerRuleMode, setCustomerRuleMode] = useState<CustomerRuleMode>('ADJUSTMENT');
  const [customerSaving, setCustomerSaving] = useState(false);
  const [customerRuleForm, setCustomerRuleForm] = useState({
    baseRateType: 'FARM' as PricingBaseRateType,
    offsetDirection: 'MINUS' as PricingOffsetDirection,
    offsetValue: '0',
    targetRate: '',
  });

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === Number(selectedCustomerId)) ?? null,
    [customers, selectedCustomerId],
  );
  const filteredCustomers = useMemo(() => {
    const query = customerSearch.trim().toLowerCase();
    return customers.filter((customer) => !query || customer.shopName.toLowerCase().includes(query) || customer.contact?.toLowerCase().includes(query));
  }, [customerSearch, customers]);
  const selectedBaseRate = customerRuleForm.baseRateType === 'FARM' ? Number(marketRateForm.farmRate) : Number(marketRateForm.finalRate);
  const previewCustomerRate = customerRuleMode === 'TOTAL'
    ? Number(customerRuleForm.targetRate)
    : customerRuleForm.offsetDirection === 'MINUS'
      ? selectedBaseRate - Number(customerRuleForm.offsetValue || 0)
      : selectedBaseRate + Number(customerRuleForm.offsetValue || 0);

  const loadMarketRate = useCallback(async (date: string) => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get<MarketRate>(`/market-rates/effective?date=${date}`);
      setEffectiveMarketRate(response.data);
      setMarketRateForm((previous) => ({
        ...previous,
        farmRate: String(response.data.farmRate),
        finalRate: String(response.data.finalRate),
      }));
    } catch (requestError: any) {
      setEffectiveMarketRate(null);
      setMarketRateForm((previous) => ({ ...previous, farmRate: '', finalRate: '' }));
      setError(requestError.response?.data?.message || 'No market rates are available for this date');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === 'ADMIN') void loadMarketRate(marketRateForm.effectiveDate);
  }, [loadMarketRate, marketRateForm.effectiveDate, user?.role]);

  useEffect(() => {
    if (user?.role !== 'ADMIN') return;
    api.get<Customer[]>('/customers')
      .then((response) => setCustomers(response.data.filter((customer) => customer.isActive !== false)))
      .catch(() => toast.error('Failed to load customers'));
  }, [user?.role]);

  useEffect(() => {
    if (!selectedCustomer) return;
    const rate = calculateCustomerRate(selectedCustomer, Number(marketRateForm.farmRate), Number(marketRateForm.finalRate));
    setCustomerRuleForm({
      baseRateType: selectedCustomer.pricingBaseRateType ?? 'FARM',
      offsetDirection: selectedCustomer.pricingOffsetDirection ?? 'MINUS',
      offsetValue: String(selectedCustomer.pricingOffsetValue ?? 0),
      targetRate: rate == null ? '' : rate.toFixed(2),
    });
    setCustomerRuleMode('ADJUSTMENT');
  }, [marketRateForm.farmRate, marketRateForm.finalRate, selectedCustomer]);

  const saveCustomerRule = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedCustomer) {
      toast.error('Select a customer first');
      return;
    }
    if (!Number.isFinite(selectedBaseRate) || selectedBaseRate <= 0) {
      toast.error('Save the daily benchmark rates first');
      return;
    }

    let pricingOffsetDirection = customerRuleForm.offsetDirection;
    let pricingOffsetValue = Number(customerRuleForm.offsetValue || 0);
    if (customerRuleMode === 'TOTAL') {
      const targetRate = Number(customerRuleForm.targetRate);
      if (!Number.isFinite(targetRate) || targetRate <= 0) {
        toast.error('Enter a valid total customer rate');
        return;
      }
      const difference = targetRate - selectedBaseRate;
      pricingOffsetDirection = difference < 0 ? 'MINUS' : 'PLUS';
      pricingOffsetValue = Math.abs(difference);
    }
    if (!Number.isFinite(pricingOffsetValue) || pricingOffsetValue < 0) {
      toast.error('Enter a valid adjustment');
      return;
    }

    setCustomerSaving(true);
    try {
      const response = await api.patch<Customer>(`/customers/${selectedCustomer.id}`, {
        pricingBaseRateType: customerRuleForm.baseRateType,
        pricingOffsetDirection,
        pricingOffsetValue,
      });
      setCustomers((previous) => previous.map((customer) => customer.id === response.data.id ? { ...customer, ...response.data } : customer));
      setCustomerRuleForm((previous) => ({ ...previous, offsetDirection: pricingOffsetDirection, offsetValue: String(pricingOffsetValue), targetRate: previewCustomerRate.toFixed(2) }));
      notifyBusinessDataUpdated();
      toast.success(`${selectedCustomer.shopName} pricing rule saved`);
    } catch (requestError: any) {
      toast.error(requestError.response?.data?.message || 'Failed to save customer pricing rule');
    } finally {
      setCustomerSaving(false);
    }
  };

  const saveMarketRates = async (event: React.FormEvent) => {
    event.preventDefault();
    const farmRate = Number(marketRateForm.farmRate);
    const finalRate = Number(marketRateForm.finalRate);
    if (!marketRateForm.effectiveDate || !Number.isFinite(farmRate) || !Number.isFinite(finalRate) || farmRate < 0 || finalRate < 0) {
      toast.error('Enter valid Farm and Final rates');
      return;
    }

    setSaving(true);
    try {
      const response = await api.put<MarketRate>('/market-rates', {
        effectiveDate: marketRateForm.effectiveDate,
        farmRate,
        finalRate,
      });
      setEffectiveMarketRate(response.data);
      setMarketRateForm((previous) => ({
        ...previous,
        farmRate: String(response.data.farmRate),
        finalRate: String(response.data.finalRate),
      }));
      setError('');
      toast.success('Daily benchmark rates saved');
      notifyBusinessDataUpdated();
    } catch (requestError: any) {
      toast.error(requestError.response?.data?.message || 'Failed to save daily rates');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-700">
              <SlidersHorizontal size={13} /> Pricing controls
            </div>
            <h1 className="text-3xl font-black tracking-tight text-slate-900">Market Pricing</h1>
            <p className="mt-2 max-w-2xl font-medium tracking-tight text-slate-500">
              Maintain the two daily benchmark rates used by customer pricing rules. The latest saved rates carry forward until a newer date is entered.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-right shadow-sm">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Access</div>
            <div className="mt-1 text-sm font-black text-amber-700">Administrators only</div>
          </div>
        </div>

        {user?.role !== 'ADMIN' ? (
          <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-sm font-semibold text-amber-800">
            This page is restricted to administrators.
          </section>
        ) : (
          <>
            <form onSubmit={saveMarketRates} className="rounded-3xl border border-emerald-100 bg-emerald-50/60 p-5 shadow-sm sm:p-7">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-700">Daily benchmark rates</div>
                  <h2 className="mt-1 text-2xl font-black text-slate-900">Set Farm and Final rates</h2>
                  <p className="mt-2 max-w-2xl text-xs font-medium leading-5 text-slate-600">
                    Customers can be configured against either benchmark and an individual plus or minus adjustment on the Customers page.
                  </p>
                </div>
                {effectiveMarketRate && (
                  <div className="inline-flex items-center gap-2 text-xs font-bold text-emerald-800">
                    <CalendarDays size={15} />
                    Effective from {new Date(effectiveMarketRate.effectiveDate).toLocaleDateString('en-PK')}
                  </div>
                )}
              </div>

              <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-[1fr,1fr,1fr,auto] lg:items-end">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Effective date</label>
                  <DatePicker
                    value={marketRateForm.effectiveDate}
                    onChange={(date) => setMarketRateForm((previous) => ({ ...previous, effectiveDate: date }))}
                    className="mt-1 !bg-white !py-3 text-sm font-bold"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Farm rate / kg</label>
                  <div className="relative mt-1">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">Rs.</span>
                    <input type="number" min="0" step="0.01" required value={marketRateForm.farmRate} onChange={(event) => setMarketRateForm((previous) => ({ ...previous, farmRate: event.target.value }))} className="w-full rounded-xl border border-emerald-100 bg-white py-3 pl-11 pr-3 text-sm font-bold outline-none transition-colors focus:border-emerald-500" placeholder="320.00" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Final rate / kg</label>
                  <div className="relative mt-1">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">Rs.</span>
                    <input type="number" min="0" step="0.01" required value={marketRateForm.finalRate} onChange={(event) => setMarketRateForm((previous) => ({ ...previous, finalRate: event.target.value }))} className="w-full rounded-xl border border-emerald-100 bg-white py-3 pl-11 pr-3 text-sm font-bold outline-none transition-colors focus:border-emerald-500" placeholder="322.00" />
                  </div>
                </div>
                <button type="submit" disabled={loading || saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-black text-white shadow-md shadow-emerald-200 transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  {saving ? 'Saving...' : 'Save rates'}
                </button>
              </div>

              {loading && <div className="mt-4 text-xs font-bold text-slate-500">Loading the effective rates for this date...</div>}
              {!loading && error && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800">{error}. Save the first benchmark record for this date to enable invoice pricing.</div>}
            </form>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-emerald-700"><Users size={14} /> Customer selling rates</div>
                  <h2 className="mt-1 text-2xl font-black text-slate-900">Set each customer’s automatic rate</h2>
                  <p className="mt-2 max-w-3xl text-xs font-medium leading-5 text-slate-600">Choose a customer, then save a Farm/Final plus or minus rule—or enter the exact total rate you want. New sales invoices will apply the saved rule automatically.</p>
                </div>
                <div className="rounded-xl bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500">{customers.length} active customers</div>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,0.85fr),minmax(0,1.15fr)]">
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Search customer</label>
                    <div className="relative mt-1">
                      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm font-bold outline-none focus:border-emerald-500 focus:bg-white" placeholder="Search by shop name or contact" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Select customer</label>
                    <select value={selectedCustomerId} onChange={(event) => setSelectedCustomerId(event.target.value)} className="mt-1 w-full rounded-xl border border-emerald-100 bg-white px-3 py-3 text-sm font-bold outline-none focus:border-emerald-500">
                      <option value="">Choose a customer...</option>
                      {filteredCustomers.map((customer) => <option key={customer.id} value={customer.id}>{customer.shopName}</option>)}
                    </select>
                  </div>
                  <div className="max-h-64 space-y-2 overflow-y-auto rounded-2xl border border-slate-100 bg-slate-50 p-2">
                    {filteredCustomers.map((customer) => {
                      const rate = calculateCustomerRate(customer, Number(marketRateForm.farmRate), Number(marketRateForm.finalRate));
                      return <button type="button" key={customer.id} onClick={() => setSelectedCustomerId(String(customer.id))} className={`flex w-full items-center justify-between rounded-xl px-3 py-3 text-left transition-colors ${selectedCustomerId === String(customer.id) ? 'bg-emerald-100 text-emerald-900' : 'bg-white hover:bg-emerald-50'}`}><span><span className="block text-sm font-black">{customer.shopName}</span><span className="block text-[10px] font-semibold text-slate-500">{customer.pricingBaseRateType ? `${customer.pricingBaseRateType} ${customer.pricingOffsetDirection === 'MINUS' ? '-' : '+'} Rs. ${Number(customer.pricingOffsetValue).toLocaleString('en-PK')}` : 'Rule not configured'}</span></span><span className="text-xs font-black text-slate-700">{rate == null ? '—' : `${formatRate(rate)}/kg`}</span></button>;
                    })}
                    {!filteredCustomers.length && <div className="px-3 py-8 text-center text-xs font-bold text-slate-400">No customers match your search.</div>}
                  </div>
                </div>

                <form onSubmit={saveCustomerRule} className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-5">
                  {!selectedCustomer ? <div className="flex min-h-64 items-center justify-center text-center text-sm font-bold text-slate-400">Select a customer to edit their selling rate.</div> : <>
                    <div className="flex items-start justify-between gap-4 border-b border-emerald-100 pb-4"><div><div className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Editing customer</div><h3 className="mt-1 text-xl font-black text-slate-900">{selectedCustomer.shopName}</h3></div><div className="text-right text-xs font-bold text-slate-500">Contact<br /><span className="text-sm font-black text-slate-900">{selectedCustomer.contact || 'No contact'}</span></div></div>
                    <div className="mt-5"><label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Pricing method</label><select value={customerRuleMode} onChange={(event) => setCustomerRuleMode(event.target.value as CustomerRuleMode)} className="mt-1 w-full rounded-xl border border-emerald-100 bg-white px-3 py-3 text-sm font-bold outline-none focus:border-emerald-500"><option value="ADJUSTMENT">Benchmark plus / minus adjustment</option><option value="TOTAL">Set exact total customer rate</option></select></div>
                    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3"><div><label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Base rate</label><select value={customerRuleForm.baseRateType} onChange={(event) => setCustomerRuleForm((previous) => ({ ...previous, baseRateType: event.target.value as PricingBaseRateType }))} className="mt-1 w-full rounded-xl border border-emerald-100 bg-white px-3 py-3 text-sm font-bold"><option value="FARM">Farm</option><option value="FINAL">Final</option></select></div>{customerRuleMode === 'ADJUSTMENT' ? <><div><label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Adjustment</label><select value={customerRuleForm.offsetDirection} onChange={(event) => setCustomerRuleForm((previous) => ({ ...previous, offsetDirection: event.target.value as PricingOffsetDirection }))} className="mt-1 w-full rounded-xl border border-emerald-100 bg-white px-3 py-3 text-sm font-bold"><option value="MINUS">Minus (−)</option><option value="PLUS">Plus (+)</option></select></div><div><label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Amount / kg</label><input type="number" min="0" step="0.01" value={customerRuleForm.offsetValue} onChange={(event) => setCustomerRuleForm((previous) => ({ ...previous, offsetValue: event.target.value }))} className="mt-1 w-full rounded-xl border border-emerald-100 bg-white px-3 py-3 text-sm font-bold" /></div></> : <div className="sm:col-span-2"><label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Exact selling rate / kg</label><input type="number" min="0.01" step="0.01" value={customerRuleForm.targetRate} onChange={(event) => setCustomerRuleForm((previous) => ({ ...previous, targetRate: event.target.value }))} className="mt-1 w-full rounded-xl border border-emerald-100 bg-white px-3 py-3 text-sm font-bold" placeholder="316.00" /></div>}</div>
                    <div className="mt-5 flex flex-col gap-4 rounded-2xl bg-white p-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Invoice rate preview</div><div className="mt-1 text-xs font-semibold text-slate-500">{formatRate(selectedBaseRate)} {customerRuleMode === 'TOTAL' ? '→ exact customer rate' : `${customerRuleForm.offsetDirection === 'MINUS' ? '−' : '+'} ${formatRate(Number(customerRuleForm.offsetValue || 0))}`}</div></div><div className={`text-2xl font-black ${previewCustomerRate > 0 ? 'text-emerald-700' : 'text-red-600'}`}>{previewCustomerRate > 0 ? `${formatRate(previewCustomerRate)} / kg` : 'Enter valid rate'}</div></div>
                    <button type="submit" disabled={customerSaving || previewCustomerRate <= 0} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-black text-white shadow-md shadow-emerald-200 transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">{customerSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}{customerSaving ? 'Saving customer rule...' : 'Save customer selling rate'}</button>
                  </>}
                </form>
              </div>
            </section>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Benchmark one</div>
                <div className="mt-2 flex items-end justify-between gap-4">
                  <h2 className="text-xl font-black text-slate-900">Farm Rate</h2>
                  <span className="text-2xl font-black text-emerald-700">{marketRateForm.farmRate ? formatRate(marketRateForm.farmRate) : '—'}</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-500">Customers configured with Farm use this rate as their starting benchmark before their individual adjustment is applied.</p>
              </section>
              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Benchmark two</div>
                <div className="mt-2 flex items-end justify-between gap-4">
                  <h2 className="text-xl font-black text-slate-900">Final Rate</h2>
                  <span className="text-2xl font-black text-emerald-700">{marketRateForm.finalRate ? formatRate(marketRateForm.finalRate) : '—'}</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-500">Customers configured with Final use this rate as their starting benchmark before their individual adjustment is applied.</p>
              </section>
            </div>

            <section className="rounded-3xl border border-slate-200 bg-slate-900 p-6 text-white shadow-lg shadow-slate-200 sm:p-7">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-white/10 p-2 text-emerald-300"><Info size={18} /></div>
                <div>
                  <h2 className="text-lg font-black">How customer rates are calculated</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-300">The customer’s configured benchmark and adjustment are applied when a new invoice is created. Existing invoice rates remain unchanged.</p>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-1 gap-3 text-sm font-bold sm:grid-cols-3 sm:items-center">
                <div className="rounded-xl bg-white/10 px-4 py-3">Farm or Final benchmark</div>
                <ArrowRight className="hidden text-emerald-300 sm:block" size={18} />
                <div className="rounded-xl bg-emerald-500/20 px-4 py-3 text-emerald-100">Customer benchmark ± adjustment = invoice rate</div>
              </div>
            </section>
          </>
        )}
      </div>
    </AppLayout>
  );
}
