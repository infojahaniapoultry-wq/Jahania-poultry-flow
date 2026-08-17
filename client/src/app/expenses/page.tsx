'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import DataTable, { Column } from '@/components/DataTable';
import DatePicker from '@/components/DatePicker';
import api from '@/lib/api';
import { toast } from 'react-hot-toast';
import { BUSINESS_DATA_UPDATED_EVENT, notifyBusinessDataUpdated } from '@/lib/business-events';
import { ArrowDownLeft, Banknote, Car, CheckCircle2, FileText, Lightbulb, Loader2, Plus, Printer, Receipt, Settings2, ShieldCheck, Sparkles, Wrench } from 'lucide-react';

interface ExpenseAccount {
  id: number;
  name: string;
  category?: string | null;
  isActive?: boolean;
}

interface ManualExpense {
  id: number;
  date: string;
  amount: string | number;
  narration?: string | null;
  voucherRef?: string | null;
  expenseAccount?: { name: string; category?: string | null };
}

interface DriverExpense {
  date: string;
  driver: string;
  source: string;
  reference: string;
  amount: number;
  narration: string;
}

interface ExpenseRecord {
  id: string;
  date: string;
  source: 'MANUAL' | 'DRIVER';
  category: string;
  party: string;
  reference: string;
  amount: number;
  narration: string;
}

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

const toRange = (date: string) => ({
  startDate: new Date(`${date}T00:00:00.000+05:00`).toISOString(),
  endDate: new Date(`${date}T23:59:59.999+05:00`).toISOString(),
});

const fmt = (value: string | number) => `Rs. ${Number(value ?? 0).toLocaleString('en-PK')}`;

const categoryOptions = [
  { value: 'Vehicle Repair', label: 'Vehicle Repair', hint: 'Workshop, tyres, oil service', icon: Wrench, color: 'text-amber-600 bg-amber-50' },
  { value: 'Petrol / Fuel', label: 'Petrol / Fuel', hint: 'Fuel and route running cost', icon: Car, color: 'text-blue-600 bg-blue-50' },
  { value: 'Accessories', label: 'Accessories', hint: 'Parts, tools, small equipment', icon: Settings2, color: 'text-violet-600 bg-violet-50' },
  { value: 'Electricity / Light', label: 'Electricity / Light', hint: 'Power and utility bills', icon: Lightbulb, color: 'text-yellow-600 bg-yellow-50' },
  { value: 'Rent', label: 'Rent', hint: 'Shop, office, or storage rent', icon: ShieldCheck, color: 'text-emerald-600 bg-emerald-50' },
  { value: 'Salaries', label: 'Salaries', hint: 'Staff and operational payroll', icon: Banknote, color: 'text-teal-600 bg-teal-50' },
  { value: 'Maintenance', label: 'Maintenance', hint: 'General upkeep and repairs', icon: Wrench, color: 'text-orange-600 bg-orange-50' },
  { value: 'CUSTOM', label: 'Other / Custom', hint: 'Create your own expense category', icon: Plus, color: 'text-slate-600 bg-slate-100' },
];

const emptyForm = (date: string) => ({
  date,
  category: 'Petrol / Fuel',
  customCategory: '',
  amount: '',
  narration: '',
});

const expenseColumns: Column<ExpenseRecord>[] = [
  {
    key: 'date',
    label: 'Date',
    render: (row) => <span className="font-medium text-slate-600">{new Date(row.date).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' })}</span>,
  },
  {
    key: 'source',
    label: 'Record',
    render: (row) => (
      <div className="flex items-center gap-2">
        <span className={`grid h-8 w-8 place-items-center rounded-lg ${row.source === 'DRIVER' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
          {row.source === 'DRIVER' ? <Car size={15} /> : <Receipt size={15} />}
        </span>
        <div>
          <div className="text-xs font-black uppercase tracking-wide text-slate-700">{row.source === 'DRIVER' ? 'Driver expense' : 'Manual expense'}</div>
          <div className="text-[10px] font-medium text-slate-400">{row.category}</div>
        </div>
      </div>
    ),
  },
  { key: 'party', label: 'Party / Driver', render: (row) => <span className="font-bold text-slate-900">{row.party}</span> },
  { key: 'reference', label: 'Reference', render: (row) => <span className="text-xs font-bold text-emerald-700">{row.reference || '—'}</span> },
  { key: 'amount', label: 'Amount', align: 'right', render: (row) => <span className="font-black text-red-600">{fmt(row.amount)}</span> },
];

export default function ExpenseManagementPage() {
  const today = getPKTDate();
  const [selectedDate, setSelectedDate] = useState(today);
  const [accounts, setAccounts] = useState<ExpenseAccount[]>([]);
  const [manualExpenses, setManualExpenses] = useState<ManualExpense[]>([]);
  const [driverExpenses, setDriverExpenses] = useState<DriverExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm(today));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const range = toRange(selectedDate);
      const query = `startDate=${encodeURIComponent(range.startDate)}&endDate=${encodeURIComponent(range.endDate)}`;
      const [accountsResponse, entriesResponse, reportResponse] = await Promise.all([
        api.get('/expenses/accounts'),
        api.get(`/expenses?${query}`),
        api.get(`/reports/expense-summary?${query}`),
      ]);
      setAccounts(accountsResponse.data ?? []);
      setManualExpenses(entriesResponse.data ?? []);
      setDriverExpenses(reportResponse.data?.driverRecords ?? []);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Could not load daily expenses');
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const refresh = () => { void load(); };
    window.addEventListener(BUSINESS_DATA_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(BUSINESS_DATA_UPDATED_EVENT, refresh);
  }, [load]);

  useEffect(() => {
    setForm((current) => ({ ...current, date: selectedDate }));
  }, [selectedDate]);

  const records = useMemo<ExpenseRecord[]>(() => [
    ...manualExpenses.map((expense) => ({
      id: `manual-${expense.id}`,
      date: expense.date,
      source: 'MANUAL' as const,
      category: expense.expenseAccount?.name ?? 'Expense',
      party: 'Business expense',
      reference: expense.voucherRef ?? '',
      amount: Number(expense.amount),
      narration: expense.narration ?? '',
    })),
    ...driverExpenses.map((expense, index) => ({
      id: `driver-${expense.source}-${expense.reference}-${index}`,
      date: expense.date,
      source: 'DRIVER' as const,
      category: 'Driver Transport',
      party: expense.driver,
      reference: expense.reference,
      amount: expense.amount,
      narration: expense.narration,
    })),
  ].sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime()), [driverExpenses, manualExpenses]);

  const manualTotal = useMemo(() => manualExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0), [manualExpenses]);
  const driverTotal = useMemo(() => driverExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0), [driverExpenses]);
  const total = manualTotal + driverTotal;

  const setField = (field: string, value: string) => setForm((current) => ({ ...current, [field]: value }));

  const saveExpense = async (event: React.FormEvent) => {
    event.preventDefault();
    const categoryName = form.category === 'CUSTOM' ? form.customCategory.trim() : form.category;
    const amount = Number(form.amount);
    if (!categoryName) { toast.error('Enter a custom expense category'); return; }
    if (!Number.isFinite(amount) || amount <= 0) { toast.error('Enter a valid expense amount'); return; }
    setSaving(true);
    try {
      let account = accounts.find((item) => item.name.toLowerCase() === categoryName.toLowerCase());
      if (!account) {
        const response = await api.post('/expenses/accounts', {
          name: categoryName,
          category: form.category === 'CUSTOM' ? 'General' : categoryName,
        });
        account = response.data;
        setAccounts((current) => [...current, account as ExpenseAccount]);
      }
      if (!account) {
        throw new Error('Expense account could not be prepared');
      }

      await api.post('/expenses', {
        date: new Date(`${form.date}T12:00:00+05:00`).toISOString(),
        expenseAccountId: account.id,
        amount,
        narration: form.narration.trim() || undefined,
      });
      toast.success(`Expense recorded for ${new Date(`${form.date}T12:00:00+05:00`).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' })}`);
      setForm(emptyForm(selectedDate));
      notifyBusinessDataUpdated();
      await load();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Expense could not be recorded');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-8">
        <div className="no-print flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[.22em] text-emerald-700"><Sparkles size={13} /> Daily finance workspace</div>
            <h1 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">Expense Management</h1>
            <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-slate-500">Record every operating cost by day, add useful notes, and see driver transport charges alongside manual expenses.</p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px]">
              <div className="mb-1.5 ml-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Report date</div>
              <DatePicker value={selectedDate} onChange={(value) => setSelectedDate(value || today)} />
            </div>
            <button type="button" onClick={() => window.print()} className="btn btn-ghost no-print"><Printer size={16} /> Print daily report</button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Total daily expenses', value: total, tone: 'bg-emerald-900 text-white', icon: Receipt, sub: 'Manual + driver costs' },
            { label: 'Manual expenses', value: manualTotal, tone: 'bg-white text-slate-900', icon: FileText, sub: `${manualExpenses.length} records entered` },
            { label: 'Driver transport', value: driverTotal, tone: 'bg-amber-50 text-amber-950', icon: Car, sub: `${driverExpenses.length} auto-linked records` },
            { label: 'Daily records', value: records.length, tone: 'bg-white text-slate-900', icon: CheckCircle2, sub: 'Selected business date' },
          ].map((card) => {
            const Icon = card.icon;
            return <div key={card.label} className={`rounded-3xl border border-slate-200 p-5 shadow-sm ${card.tone}`}><div className="mb-5 flex items-start justify-between"><div className="text-[10px] font-black uppercase tracking-[.18em] opacity-65">{card.label}</div><Icon size={18} className="opacity-70" /></div><div className="text-2xl font-black tracking-tight">{typeof card.value === 'number' && card.label !== 'Daily records' ? fmt(card.value) : card.value}</div><div className="mt-1 text-[10px] font-bold uppercase tracking-widest opacity-55">{card.sub}</div></div>;
          })}
        </div>

        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(360px,420px)_1fr]">
          <section className="surface-card no-print overflow-hidden">
            <div className="border-b border-slate-100 bg-gradient-to-br from-emerald-950 to-emerald-800 px-6 py-6 text-white">
              <div className="mb-1 flex items-center gap-2 text-[10px] font-black uppercase tracking-[.2em] text-emerald-200"><ArrowDownLeft size={14} /> New expense</div>
              <h2 className="text-xl font-black tracking-tight">Add a daily expense</h2>
              <p className="mt-1 text-xs font-medium leading-5 text-emerald-100/70">The selected date is used for this record and its daily report.</p>
            </div>
            <form onSubmit={saveExpense} className="space-y-5 p-6">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="eyebrow mb-1.5 block">Expense date</label>
                  <DatePicker value={form.date} onChange={(value) => { const next = value || selectedDate; setSelectedDate(next); setField('date', next); }} />
                </div>
              </div>

              <div>
                <label className="eyebrow mb-2 block">Choose expense type</label>
                <select aria-label="Expense category" className="field-control mb-3" value={form.category} onChange={(event) => setField('category', event.target.value)}>
                  {categoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  {categoryOptions.map((option) => {
                    const Icon = option.icon;
                    const active = form.category === option.value;
                    return <button key={option.value} type="button" onClick={() => setField('category', option.value)} className={`flex min-h-[78px] flex-col items-start justify-between rounded-2xl border p-3 text-left transition-all ${active ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/10' : 'border-slate-200 bg-slate-50 hover:border-emerald-200 hover:bg-white'}`}><span className={`grid h-7 w-7 place-items-center rounded-lg ${option.color}`}><Icon size={14} /></span><span><span className="block text-xs font-black text-slate-800">{option.label}</span><span className="mt-0.5 block text-[9px] font-medium leading-3 text-slate-400">{option.hint}</span></span></button>;
                  })}
                </div>
              </div>

              {form.category === 'CUSTOM' && <div><label className="eyebrow mb-1.5 block">Custom category name</label><input className="field-control" value={form.customCategory} onChange={(event) => setField('customCategory', event.target.value)} placeholder="e.g. Water delivery" /></div>}

              <div><label className="eyebrow mb-1.5 block">Amount (Rs.)</label><div className="relative"><span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">Rs.</span><input required type="number" min="0.01" step="0.01" className="field-control pl-11 text-lg font-black" value={form.amount} onChange={(event) => setField('amount', event.target.value)} placeholder="0" /></div></div>

              <div><label className="eyebrow mb-1.5 block">Notes / evidence</label><textarea rows={3} className="field-control resize-none" value={form.narration} onChange={(event) => setField('narration', event.target.value)} placeholder="What was this expense for?" /></div>

              <button type="submit" disabled={saving} className="btn btn-primary w-full">{saving ? <Loader2 size={17} className="animate-spin" /> : <Plus size={17} />} {saving ? 'Saving expense…' : 'Record expense'}</button>
            </form>
          </section>

          <section className="surface-card overflow-hidden">
            <div className="flex flex-col gap-4 border-b border-slate-100 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div><div className="eyebrow mb-1">Daily expense register</div><h2 className="text-xl font-black tracking-tight text-slate-900">{new Date(`${selectedDate}T12:00:00+05:00`).toLocaleDateString('en-PK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h2><p className="mt-1 text-xs font-medium text-slate-400">All manual and auto-generated driver records for this date.</p></div>
              <div className="rounded-2xl bg-red-50 px-4 py-3 text-right"><div className="text-[9px] font-black uppercase tracking-widest text-red-400">Total outflow</div><div className="text-lg font-black text-red-700">{fmt(total)}</div></div>
            </div>
            <div className="p-4 sm:p-6"><DataTable columns={expenseColumns} data={records} loading={loading} emptyMessage="No expenses recorded for this date." searchPlaceholder="Search expense, driver, or reference…" /></div>
          </section>
        </div>

        <section className="surface-card overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-5 sm:flex-row sm:items-center sm:justify-between"><div><div className="eyebrow mb-1">Daily control check</div><h2 className="text-xl font-black tracking-tight text-slate-900">Expense report for {selectedDate}</h2></div><div className="flex items-center gap-2 text-xs font-bold text-emerald-700"><CheckCircle2 size={16} /> Driver costs included automatically</div></div>
          <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-3"><div className="rounded-2xl bg-slate-50 p-4"><div className="eyebrow mb-2">Manual categories</div><div className="text-lg font-black text-slate-900">{new Set(manualExpenses.map((expense) => expense.expenseAccount?.name)).size}</div><div className="mt-1 text-xs font-medium text-slate-400">Selected expense types used</div></div><div className="rounded-2xl bg-amber-50 p-4"><div className="eyebrow mb-2 text-amber-700">Driver records</div><div className="text-lg font-black text-amber-950">{driverExpenses.length}</div><div className="mt-1 text-xs font-medium text-amber-800/60">From invoices and purchases</div></div><div className="rounded-2xl bg-emerald-50 p-4"><div className="eyebrow mb-2 text-emerald-700">Report status</div><div className="text-lg font-black text-emerald-950">Ready</div><div className="mt-1 text-xs font-medium text-emerald-800/60">Print this date’s report when needed</div></div></div>
        </section>
      </div>
    </AppLayout>
  );
}
