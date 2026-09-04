'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { toast } from 'react-hot-toast';
import { Egg, Eye, EyeOff, Loader2, Lock, Mail, ArrowUpRight, Activity, ShieldCheck } from 'lucide-react';

export default function LoginPage() {
  const { login, user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (!authLoading && user) router.replace('/dashboard'); }, [user, authLoading, router]);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('reason') !== 'session-expired') return;
    toast.error('Your session expired. Please sign in again.');
    window.history.replaceState({}, '', '/login');
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { toast.error('Please enter your email and password.'); return; }
    setLoading(true);
    try { await login(email, password); toast.success('Welcome back'); router.replace('/dashboard'); }
    catch (error) {
      const hasResponse = Boolean(error && typeof error === 'object' && 'response' in error);
      toast.error(hasResponse ? 'Those credentials do not match our records.' : 'Unable to reach PoultryFlow. Check the API connection.');
    } finally { setLoading(false); }
  };

  return (
    <main className="min-h-screen bg-[#f6f4ef] p-4 text-[#17231d] sm:p-6 lg:p-8">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-7xl overflow-hidden rounded-[2rem] border border-[#e5e2da] bg-[#fffdf9] shadow-[0_24px_80px_rgba(48,57,48,.12)] lg:grid-cols-[1.08fr_.92fr]">
        <section className="relative hidden overflow-hidden bg-[#17261f] p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
          <div className="absolute -right-32 -top-32 h-[30rem] w-[30rem] rounded-full bg-[#547b5a]/30 blur-3xl" />
          <div className="absolute -bottom-44 -left-24 h-[24rem] w-[24rem] rounded-full bg-[#d7923e]/20 blur-3xl" />
          <div className="relative z-10"><div className="mb-16 flex items-center gap-3"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#d7923e] text-[#17261f] shadow-lg shadow-black/25"><Egg size={26} strokeWidth={2.5} /></div><div><div className="text-xl font-black tracking-tight">PoultryFlow</div><div className="text-[10px] font-bold uppercase tracking-[.24em] text-[#b9d7ad]">Jahania Poultry</div></div></div><div className="max-w-xl"><div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[.07] px-3 py-1.5 text-[10px] font-black uppercase tracking-[.18em] text-[#d7e9c9]"><span className="h-1.5 w-1.5 rounded-full bg-[#9bbf78]" />Operations, in rhythm</div><h1 className="text-5xl font-black leading-[1.02] tracking-[-.06em] xl:text-6xl">Run the farm<br /><span className="text-[#d7923e]">with clarity.</span></h1><p className="mt-6 max-w-md text-sm leading-7 text-white/60">One calm workspace for stock, purchases, invoices, relationships, and the decisions that keep Jahania Poultry moving.</p></div></div>
          <div className="relative z-10 grid max-w-xl grid-cols-3 gap-3"><div className="rounded-2xl border border-white/10 bg-white/[.06] p-4"><Activity size={17} className="mb-6 text-[#d7e9c9]" /><div className="text-lg font-black">Live</div><div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-white/40">ledger pulse</div></div><div className="rounded-2xl border border-white/10 bg-white/[.06] p-4"><ShieldCheck size={17} className="mb-6 text-[#d7e9c9]" /><div className="text-lg font-black">Secure</div><div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-white/40">role-based access</div></div><div className="rounded-2xl border border-white/10 bg-white/[.06] p-4"><ArrowUpRight size={17} className="mb-6 text-[#d7e9c9]" /><div className="text-lg font-black">Ready</div><div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-white/40">for today&apos;s work</div></div></div>
        </section>

        <section className="flex items-center justify-center p-6 sm:p-10 lg:p-14"><div className="w-full max-w-md"><div className="mb-10 flex items-center gap-3 lg:hidden"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#38633f] text-white"><Egg size={24} /></div><div><div className="text-lg font-black tracking-tight">PoultryFlow</div><div className="text-[10px] font-bold uppercase tracking-[.2em] text-[#547b5a]">Jahania Poultry</div></div></div><div className="mb-9"><div className="mb-3 text-[10px] font-black uppercase tracking-[.2em] text-[#87958b]">Team workspace</div><h2 className="text-3xl font-black tracking-[-.04em] text-[#17231d]">Welcome back.</h2><p className="mt-2 text-sm leading-6 text-[#69766d]">Sign in to pick up where your operation left off.</p></div><form onSubmit={handleSubmit} className="space-y-5"><div><label className="mb-2 ml-1 block text-[10px] font-black uppercase tracking-[.18em] text-[#87958b]">Email address</label><div className="group relative"><Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9aa59d] transition-colors group-focus-within:text-[#547b5a]" size={18} /><input type="email" className="field-control h-14 pl-11" placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></div></div><div><div className="mb-2 flex items-center justify-between"><label className="ml-1 block text-[10px] font-black uppercase tracking-[.18em] text-[#87958b]">Password</label><button type="button" className="text-[10px] font-black uppercase tracking-wider text-[#547b5a]">Need help?</button></div><div className="group relative"><Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9aa59d] transition-colors group-focus-within:text-[#547b5a]" size={18} /><input type={showPwd ? 'text' : 'password'} className="field-control h-14 pl-11 pr-12" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /><button type="button" onClick={() => setShowPwd((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-[#9aa59d] transition hover:bg-[#f1eee7] hover:text-[#38633f]">{showPwd ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></div><button type="submit" disabled={loading} className="mt-3 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#38633f] text-sm font-black text-white shadow-lg shadow-[#38633f]/20 transition hover:bg-[#2c5334] active:scale-[.99] disabled:opacity-60">{loading ? <><Loader2 size={18} className="animate-spin" />Checking your workspace...</> : <>Sign in to dashboard <ArrowUpRight size={17} /></>}</button></form><div className="mt-8 flex items-center gap-3 rounded-2xl border border-[#e5e2da] bg-[#f6f4ef] p-4"><ShieldCheck size={18} className="shrink-0 text-[#547b5a]" /><p className="text-xs leading-5 text-[#69766d]">Your workspace is protected with role-based access and secure sessions.</p></div><p className="mt-10 text-center text-[10px] font-bold uppercase tracking-[.18em] text-[#a0aaa2]">© 2026 Jahania Poultry Service</p></div></section>
      </div>
    </main>
  );
}
