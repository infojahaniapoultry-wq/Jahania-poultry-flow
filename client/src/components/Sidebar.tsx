'use client';
import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import {
  type LucideIcon,
  LayoutDashboard,
  ShoppingCart,
  FileText,
  Users,
  Package2,
  Car,
  BarChart3,
  LogOut,
  ShieldCheck,
  ArrowLeftRight,
  X,
  CreditCard,
  SlidersHorizontal,
  Activity,
  Sparkles,
} from 'lucide-react';

type NavItem = { href: string; label: string; icon: LucideIcon };
type NavSection = { title: string; items: NavItem[] };

const coreSections: NavSection[] = [
  { title: 'Overview', items: [{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }] },
  { title: 'Operations', items: [{ href: '/purchases', label: 'Register', icon: ShoppingCart }, { href: '/invoices', label: 'Invoices', icon: FileText }] },
  { title: 'Parties', items: [{ href: '/customers', label: 'Customers', icon: Users }, { href: '/vendors', label: 'Vendors', icon: Package2 }, { href: '/drivers', label: 'Drivers', icon: Car }] },
  { title: 'Finance', items: [{ href: '/transactions', label: 'Transactions', icon: ArrowLeftRight }, { href: '/finance/credit', label: 'Credit Management', icon: CreditCard }, { href: '/finance/cheques', label: 'Cheque Registry', icon: FileText }, { href: '/finance/online', label: 'Online Payments', icon: ArrowLeftRight }] },
];

const adminSections: NavSection[] = [
  { title: 'Insights', items: [{ href: '/reports', label: 'System Reports', icon: BarChart3 }] },
  { title: 'Admin', items: [{ href: '/pricing', label: 'Market Pricing', icon: SlidersHorizontal }, { href: '/users', label: 'User Controls', icon: ShieldCheck }] },
];

export default function Sidebar({ isOpen = true, onClose, isMobile = false }: { isOpen?: boolean; onClose?: () => void; isMobile?: boolean }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const activeRef = useRef<HTMLAnchorElement>(null);
  const navSections = user?.role === 'ADMIN' ? [...coreSections, ...adminSections] : coreSections;

  useEffect(() => { activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [pathname]);

  return (
    <>
      {isMobile && isOpen && <div onClick={onClose} className="fixed inset-0 z-[45] animate-fade-in bg-[#101c15]/55 backdrop-blur-sm" />}
      <aside className={`no-print fixed bottom-0 left-0 top-0 z-50 flex w-[280px] flex-col border-r border-white/10 bg-[#17261f] text-white shadow-2xl transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="relative grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#d7923e] text-[#17261f] shadow-lg shadow-black/20"><Activity size={22} strokeWidth={2.5} /><span className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-[#17261f] bg-[#9bbf78]" /></div>
            <div><div className="text-lg font-black tracking-tight">PoultryFlow</div><div className="text-[10px] font-bold uppercase tracking-[.22em] text-[#b9d7ad]">Jahania Poultry</div></div>
          </div>
          {isMobile && <button onClick={onClose} className="rounded-xl p-2 text-white/60 transition hover:bg-white/10 hover:text-white"><X size={19} /></button>}
        </div>

        <div className="mx-4 my-5 rounded-2xl border border-white/10 bg-white/[.07] p-4">
          <div className="mb-3 flex items-center justify-between"><span className="text-[10px] font-black uppercase tracking-[.16em] text-[#b9d7ad]">Farm pulse</span><span className="flex items-center gap-1.5 text-[10px] font-bold text-[#d7e9c9]"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#9bbf78]" />Live</span></div>
          <div className="mb-2 flex items-end justify-between"><span className="text-sm font-bold text-white/90">Operations healthy</span><span className="text-xs font-black text-[#d7923e]">92%</span></div>
          <div className="h-1.5 overflow-hidden rounded-full bg-black/20"><div className="h-full w-[92%] rounded-full bg-gradient-to-r from-[#9bbf78] to-[#d7e9c9]" /></div>
          <div className="mt-3 flex items-center gap-1.5 text-[10px] text-white/50"><Sparkles size={12} className="text-[#d7923e]" />Inventory and ledgers synced</div>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-4 pb-6">
          {navSections.map((section) => (
            <div key={section.title}>
              <div className="mb-2 px-3 text-[10px] font-black uppercase tracking-[.2em] text-white/35">{section.title}</div>
              <div className="space-y-1">
                {section.items.map(({ href, label, icon: Icon }) => {
                  const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
                  return <Link key={href} href={href} ref={active ? activeRef : null} onClick={() => { if (isMobile) onClose?.(); }} className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200 ${active ? 'bg-[#d9eadb] font-black text-[#294c31] shadow-lg shadow-black/10' : 'font-medium text-white/65 hover:bg-white/[.08] hover:text-white'}`}><Icon size={18} className={active ? 'text-[#38633f]' : 'text-white/40 group-hover:text-[#d7e9c9]'} /><span className="flex-1">{label}</span>{active && <span className="h-1.5 w-1.5 rounded-full bg-[#38633f]" />}</Link>;
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-white/10 p-4"><div className="mb-3 flex items-center gap-3 px-2"><div className="grid h-9 w-9 place-items-center rounded-full bg-[#d9eadb] text-xs font-black text-[#38633f]">{user?.name?.slice(0, 2).toUpperCase() ?? 'PF'}</div><div className="min-w-0"><div className="truncate text-xs font-bold text-white/90">{user?.name ?? 'Anonymous'}</div><div className="text-[10px] font-bold uppercase tracking-wider text-white/40">{user?.role ?? 'Guest'}</div></div></div><button onClick={logout} className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2.5 text-sm font-bold text-white/65 transition hover:border-red-300/30 hover:bg-red-400/10 hover:text-red-200"><LogOut size={16} />Sign out</button></div>
      </aside>
    </>
  );
}
