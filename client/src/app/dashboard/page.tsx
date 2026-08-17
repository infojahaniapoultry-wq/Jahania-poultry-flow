'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import StatCard from '@/components/StatCard';
import api from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { toast } from 'react-hot-toast';
import { BUSINESS_DATA_UPDATED_EVENT } from '@/lib/business-events';
import { getCachedPageData, setCachedPageData } from '@/lib/page-cache';
import { BarChart3, TrendingUp, Scale, Package, DollarSign, ShoppingCart, FileText, Users, ShieldCheck, Truck, ArrowRight, Activity } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line } from 'recharts';

interface PnL { date: string; purchaseWt: number; soldWt: number; purchaseAmt: number; salesAmt: number; grossProfit: number; totalExpenses: number; dailyProfit: number; remainShort: number; purchaseCount: number; invoiceCount: number; }
interface StockSummary { purchasedWeight: number; soldWeight: number; availableWeight: number; }
interface DashboardSummaryResponse { stock: StockSummary; customers: { currentBalance: number }[]; vendors: { currentBalance: number }[]; todayPnl: PnL; weekPnl: PnL[]; }
type ChartTooltipPayload = { name?: string; color?: string; value?: number };
type ChartTooltipProps = { active?: boolean; payload?: ChartTooltipPayload[]; label?: string };

const fmt = (n: number) => 'Rs. ' + (n ?? 0).toLocaleString('en-PK', { maximumFractionDigits: 0 });
const fmtKg = (n: number) => (n ?? 0).toFixed(1) + ' kg';
const emptyPnl: PnL = { date: '', purchaseWt: 0, soldWt: 0, purchaseAmt: 0, salesAmt: 0, grossProfit: 0, totalExpenses: 0, dailyProfit: 0, remainShort: 0, purchaseCount: 0, invoiceCount: 0 };
const emptyStock: StockSummary = { purchasedWeight: 0, soldWeight: 0, availableWeight: 0 };
const CACHE_KEY = 'dashboard-page';

function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return <div className="animate-fade-in rounded-2xl border-2 border-emerald-700 bg-white p-3 shadow-xl ring-1 ring-black/5"><p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p><div className="space-y-1.5">{payload.map((item) => <div key={item.name} className="flex items-center justify-between gap-4"><div className="flex items-center gap-1.5"><div className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} /><span className="text-xs font-bold text-slate-700">{item.name}</span></div><span className="text-xs font-black text-slate-900">{fmt(item.value ?? 0)}</span></div>)}</div></div>;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const today = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [pnl, setPnl] = useState<PnL | null>(null);
  const [stock, setStock] = useState<StockSummary | null>(null);
  const [weekData, setWeekData] = useState<PnL[]>([]);
  const [customers, setCustomers] = useState<{ currentBalance: number }[]>([]);
  const [vendors, setVendors] = useState<{ currentBalance: number }[]>([]);
  const [loading, setLoading] = useState(true);

  const totals = useMemo(() => {
    const rec = customers.reduce((sum, c) => sum + Math.max(0, Number(c.currentBalance || 0)), 0);
    const pay = vendors.reduce((sum, v) => sum + Math.max(0, Number(v.currentBalance || 0)), 0);
    return { rec, pay, net: rec - pay };
  }, [customers, vendors]);

  const load = useCallback(async (force = false) => {
    if (!force) {
      const cached = getCachedPageData<DashboardSummaryResponse>(CACHE_KEY);
      if (cached) { setStock(cached.stock ?? emptyStock); setCustomers(cached.customers ?? []); setVendors(cached.vendors ?? []); setPnl(cached.todayPnl ?? emptyPnl); setWeekData(cached.weekPnl ?? []); setLoading(false); return; }
    }
    setLoading(true);
    try {
      const res = await api.get<DashboardSummaryResponse>(`/reports/dashboard?date=${today}`);
      const next = { stock: res.data.stock ?? emptyStock, customers: res.data.customers ?? [], vendors: res.data.vendors ?? [], todayPnl: res.data.todayPnl ?? emptyPnl, weekPnl: res.data.weekPnl ?? [] };
      setStock(next.stock); setCustomers(next.customers); setVendors(next.vendors); setPnl(next.todayPnl); setWeekData(next.weekPnl); setCachedPageData(CACHE_KEY, next);
    } catch (err) {
      setStock(emptyStock); setCustomers([]); setVendors([]); setPnl(emptyPnl); setWeekData([]); toast.error('Dashboard data could not be loaded.'); console.error('Failed to load dashboard data', err);
    } finally { setLoading(false); }
  }, [today]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const handleBusinessDataUpdated = () => { void load(true); }; window.addEventListener(BUSINESS_DATA_UPDATED_EVENT, handleBusinessDataUpdated); return () => window.removeEventListener(BUSINESS_DATA_UPDATED_EVENT, handleBusinessDataUpdated); }, [load]);

  const chartData = weekData.map((d) => ({ day: d.date.slice(5), Sales: Number(d.salesAmt), Purchase: Number(d.purchaseAmt), Profit: Number(d.dailyProfit) }));
  const quickActions = user?.role === 'ADMIN'
    ? [
        { href: '/purchases', label: 'Register', icon: ShoppingCart, color: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
        { href: '/invoices', label: 'Invoices', icon: FileText, color: 'bg-blue-50 text-blue-700 border-blue-100' },
        { href: '/customers', label: 'Customers', icon: Users, color: 'bg-amber-50 text-amber-700 border-amber-100' },
        { href: '/reports', label: 'Reports', icon: BarChart3, color: 'bg-violet-50 text-violet-700 border-violet-100' },
        { href: '/users', label: 'Users', icon: ShieldCheck, color: 'bg-slate-50 text-slate-700 border-slate-100' },
      ]
    : [
        { href: '/purchases', label: 'Register', icon: ShoppingCart, color: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
        { href: '/invoices', label: 'New Invoice', icon: FileText, color: 'bg-blue-50 text-blue-700 border-blue-100' },
        { href: '/customers', label: 'Customers', icon: Users, color: 'bg-amber-50 text-amber-700 border-amber-100' },
        { href: '/vendors', label: 'Vendors', icon: Package, color: 'bg-orange-50 text-orange-700 border-orange-100' },
        { href: '/drivers', label: 'Transport', icon: Truck, color: 'bg-indigo-50 text-indigo-700 border-indigo-100' },
      ];

  return (
    <AppLayout>
      <section className="relative mb-8 overflow-hidden rounded-[1.75rem] border border-[#dce9dc] bg-[#edf5ed] p-6 shadow-[var(--shadow-soft)] sm:p-8 lg:p-10">
        <div className="pointer-events-none absolute -right-20 -top-28 h-80 w-80 rounded-full bg-[#b8d5b2]/45 blur-3xl" />
        <div className="pointer-events-none absolute bottom-[-8rem] right-[18%] h-64 w-64 rounded-full bg-[#e8c28c]/25 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#cfe2d0] bg-white/70 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.18em] text-[#38633f]"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#547b5a]" />Live operations <span className="text-[#9aae9b]">/</span> {today}</div>
            <h1 className="max-w-2xl text-3xl font-black leading-[1.03] tracking-[-.055em] text-[#17261f] sm:text-5xl">{user?.role === 'ADMIN' ? <>Good morning, <span className="text-[#547b5a]">Admin.</span></> : <>Welcome to your <span className="text-[#547b5a]">workbench.</span></>}</h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-[#5d7162]">A clear pulse of stock, money, and movement across your poultry business. Everything important, in one calm view.</p>
          </div>
          <div className="flex shrink-0 flex-col gap-3 sm:flex-row lg:flex-col lg:items-end">
            <div className="rounded-2xl border border-white/80 bg-white/65 px-4 py-3 text-left lg:text-right"><div className="section-label text-[#8a9c8b]">Workspace status</div><div className="mt-1 flex items-center gap-2 text-sm font-black text-[#294c31] lg:justify-end"><span className="h-2 w-2 rounded-full bg-[#7fae70] shadow-[0_0_0_4px_rgba(127,174,112,.16)]" />All systems healthy</div></div>
            <Link href="/purchases" className="btn btn-primary self-start lg:self-auto"><ShoppingCart size={17} />New transaction</Link>
          </div>
        </div>
      </section>

      <div className="mb-9 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard loading={loading} title="Stock on Hand" value={fmtKg(stock?.availableWeight ?? 0)} icon={<Scale size={20} />} color="blue" subtitle="live inventory" />
        <StatCard loading={loading} title="Net Receivables" value={fmt(totals.rec)} icon={<DollarSign size={20} />} color="amber" subtitle="from customers" />
        <StatCard loading={loading} title="Net Payables" value={fmt(totals.pay)} icon={<TrendingUp size={20} />} color="red" subtitle="to vendors" />
        <StatCard loading={loading} title="Financial Position" value={fmt(totals.net)} icon={<ShieldCheck size={20} />} color={totals.net >= 0 ? 'green' : 'red'} subtitle="receivables - payables" />
      </div>

      <section className="mb-9"><div className="mb-3 flex items-center justify-between"><div><h2 className="eyebrow">Common actions</h2><p className="mt-1 text-xs font-medium text-slate-400">Your most-used workflows, one tap away</p></div><span className="hidden rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400 sm:inline-flex">Quick launch</span></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">{quickActions.map((item) => { const Icon = item.icon; return <Link key={item.href} href={item.href} className="group relative flex min-h-[138px] flex-col justify-between overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 text-left shadow-[var(--shadow)] transition-all duration-300 hover:-translate-y-1 hover:border-emerald-300 hover:shadow-[var(--shadow-lg)] dark:bg-[var(--bg-card)]"><div className="absolute -right-6 -top-8 h-24 w-24 rounded-full bg-emerald-50 opacity-0 blur-2xl transition-opacity group-hover:opacity-100" /><div className="relative flex items-start justify-between"><div className={`flex h-11 w-11 items-center justify-center rounded-[14px] border ${item.color} transition-transform duration-300 group-hover:scale-110`}><Icon size={20} /></div><ArrowRight size={15} className="text-slate-300 transition-all group-hover:translate-x-0.5 group-hover:text-emerald-600" /></div><span className="relative text-sm font-black tracking-tight text-slate-800 transition-colors group-hover:text-emerald-700 dark:text-slate-100">{item.label}</span></Link>; })}</div></section>

      <div className="mb-9 grid grid-cols-1 gap-6 xl:grid-cols-[1.25fr_1fr]">
        <div className="surface-card overflow-hidden p-5 sm:p-7"><div className="mb-5 flex items-start justify-between"><div><div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-700"><Activity size={12} /> Operating rhythm</div><h3 className="text-lg font-black tracking-tight text-slate-900 dark:text-white">Business pulse</h3><p className="mt-1 text-xs font-bold uppercase tracking-widest text-slate-400">Sales vs purchases · 7 days</p></div><div className="hidden items-center gap-3 sm:flex"><div className="flex items-center gap-1.5"><div className="h-2 w-2 rounded-full bg-emerald-500" /><span className="text-[10px] font-bold text-slate-500">Sales</span></div><div className="flex items-center gap-1.5"><div className="h-2 w-2 rounded-full bg-amber-500" /><span className="text-[10px] font-bold text-slate-500">Purchases</span></div></div></div><ResponsiveContainer width="100%" height={290}><BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e9eee9" /><XAxis dataKey="day" tick={{ fill: '#89958c', fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} dy={10} /><YAxis tick={{ fill: '#89958c', fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} /><Tooltip content={<ChartTooltip />} cursor={{ fill: '#f1f5ef' }} /><Bar dataKey="Sales" fill="#547b5a" radius={[7, 7, 2, 2]} barSize={18} /><Bar dataKey="Purchase" fill="#d7923e" radius={[7, 7, 2, 2]} barSize={18} /></BarChart></ResponsiveContainer></div>
        <div className="relative overflow-hidden rounded-2xl border border-[#315f3b] bg-[#23452b] p-6 text-white shadow-[var(--shadow-lg)] sm:p-7"><div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-[#4d7b55]/40 blur-3xl" /><div className="absolute -bottom-20 -left-20 h-52 w-52 rounded-full bg-[#d7923e]/10 blur-3xl" /><div className="relative z-10"><div className="mb-6 flex items-start justify-between"><div><div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-100"><span className="h-1.5 w-1.5 rounded-full bg-[#9bbf78]" />Today</div><h3 className="text-lg font-black tracking-tight">A healthy day at a glance</h3><p className="mt-1 text-xs font-bold uppercase tracking-widest text-emerald-200/70">Live transaction breakdown</p></div><div className="rounded-xl bg-white/10 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-emerald-100">{pnl?.invoiceCount ?? 0} invoices</div></div><div className="grid grid-cols-2 gap-x-6 gap-y-6">{[{ label: 'Purchases', value: fmt(pnl?.purchaseAmt ?? 0), sub: `${fmtKg(pnl?.purchaseWt ?? 0)} moved` }, { label: 'Revenue', value: fmt(pnl?.salesAmt ?? 0), sub: `${pnl?.invoiceCount ?? 0} invoices` }, { label: 'Gross margin', value: fmt(pnl?.grossProfit ?? 0), sub: 'before expenses' }, { label: 'Overheads', value: fmt(pnl?.totalExpenses ?? 0), sub: 'daily costs' }].map((item) => <div key={item.label}><div className="mb-1 text-[10px] font-black uppercase tracking-widest text-emerald-200/65">{item.label}</div><div className="text-xl font-black tracking-tight">{loading ? '—' : item.value}</div><div className="mt-1 text-[10px] font-bold uppercase text-emerald-200/55">{item.sub}</div></div>)}</div><div className="mt-7 border-t border-white/10 pt-5"><Link href="/reports" className="inline-flex items-center gap-2 text-xs font-black text-emerald-100 transition hover:text-white">Open daily report <ArrowRight size={14} /></Link></div></div></div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1.25fr]">
        <div className="surface-card p-5 sm:p-7"><div className="mb-5 flex items-start justify-between"><div><h3 className="text-lg font-black tracking-tight text-slate-900 dark:text-white">Growth velocity</h3><p className="mt-1 text-xs font-bold uppercase tracking-widest text-slate-400">Net profit trend · 7 days</p></div><div className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">{fmt(pnl?.dailyProfit ?? 0)} today</div></div><ResponsiveContainer width="100%" height={260}><LineChart data={chartData} margin={{ top: 8, right: 10, left: -20, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e9eee9" /><XAxis dataKey="day" tick={{ fill: '#89958c', fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} dy={10} /><YAxis tick={{ fill: '#89958c', fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} /><Tooltip content={<ChartTooltip />} /><Line type="monotone" dataKey="Profit" stroke="#547b5a" strokeWidth={4} dot={{ fill: '#547b5a', strokeWidth: 2, r: 4, stroke: '#fff' }} activeDot={{ r: 6, strokeWidth: 0 }} /></LineChart></ResponsiveContainer></div>
        <div className="surface-card p-5 sm:p-7"><div className="mb-5 flex items-center justify-between"><div><h3 className="text-lg font-black tracking-tight text-slate-900 dark:text-white">Operational signals</h3><p className="mt-1 text-xs font-bold uppercase tracking-widest text-slate-400">What needs your attention</p></div><Activity size={19} className="text-emerald-700" /></div><div className="grid gap-3 sm:grid-cols-3"><Link href="/purchases" className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4 transition hover:-translate-y-0.5 hover:shadow-md"><div className="mb-4 flex items-center justify-between"><Scale size={19} className="text-amber-700" /><ArrowRight size={14} className="text-amber-400" /></div><div className="text-2xl font-black text-amber-900">{fmtKg(stock?.availableWeight ?? 0)}</div><div className="mt-1 text-xs font-bold text-amber-800/70">Available stock</div></Link><Link href="/customers" className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4 transition hover:-translate-y-0.5 hover:shadow-md"><div className="mb-4 flex items-center justify-between"><Users size={19} className="text-blue-700" /><ArrowRight size={14} className="text-blue-400" /></div><div className="text-2xl font-black text-blue-900">{customers.length}</div><div className="mt-1 text-xs font-bold text-blue-800/70">Active customers</div></Link><Link href="/vendors" className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 transition hover:-translate-y-0.5 hover:shadow-md"><div className="mb-4 flex items-center justify-between"><Package size={19} className="text-emerald-700" /><ArrowRight size={14} className="text-emerald-400" /></div><div className="text-2xl font-black text-emerald-900">{vendors.length}</div><div className="mt-1 text-xs font-bold text-emerald-800/70">Active vendors</div></Link></div></div>
      </div>
    </AppLayout>
  );
}
