'use client';
import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import api from '@/lib/api';
import {
  formatNotificationAmount,
  notificationCategoryMeta,
  type PendingNotificationCategory,
  type PendingNotificationsResponse,
} from '@/lib/notifications';
import Sidebar from './Sidebar';
import { BUSINESS_DATA_UPDATED_EVENT } from '@/lib/business-events';
import { Menu, Bell, User, Sun, Moon, ChevronRight, CircleHelp, ArrowUpRight, X } from 'lucide-react';

const adminOnlyRoutes = ['/reports', '/pricing', '/users'];

const notificationMiniClasses: Record<PendingNotificationCategory, string> = {
  CHEQUE: 'bg-amber-50 text-amber-700',
  CUSTOMER_UDHAAR: 'bg-rose-50 text-rose-700',
  VENDOR_UDHAAR: 'bg-blue-50 text-blue-700',
  DRIVER_EXPENSE: 'bg-violet-50 text-violet-700',
  ONLINE_PAYMENT: 'bg-emerald-50 text-emerald-700',
};

const pageMeta: Record<string, { label: string; section: string }> = {
  '/dashboard': { label: 'Dashboard', section: 'Overview' },
  '/purchases': { label: 'Register', section: 'Operations' },
  '/invoices': { label: 'Invoices', section: 'Operations' },
  '/customers': { label: 'Customers', section: 'Parties' },
  '/vendors': { label: 'Vendors', section: 'Parties' },
  '/drivers': { label: 'Drivers', section: 'Parties' },
  '/transactions': { label: 'Transactions', section: 'Finance' },
  '/expenses': { label: 'Expense Management', section: 'Finance' },
  '/reports': { label: 'System Reports', section: 'Insights' },
  '/pricing': { label: 'Market Pricing', section: 'Admin' },
  '/users': { label: 'User Controls', section: 'Admin' },
  '/notifications': { label: 'Pending Work', section: 'Workspace' },
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [notifications, setNotifications] = useState<PendingNotificationsResponse | null>(null);
  const [welcomeOpen, setWelcomeOpen] = useState(false);

  const loadNotifications = useCallback(async (includeItems = false) => {
    try {
      const response = await api.get<PendingNotificationsResponse>('/notifications', {
        params: includeItems ? undefined : { summary: 'true' },
      });
      setNotifications(response.data);
      return response.data;
    } catch {
      return null;
    }
  }, []);

  const playNotificationSound = useCallback(() => {
    try {
      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      const context = new AudioContextClass();
      const now = context.currentTime;
      [659.25, 783.99].forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, now + index * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.08, now + index * 0.12 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.12 + 0.22);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(now + index * 0.12);
        oscillator.stop(now + index * 0.12 + 0.24);
      });
      window.setTimeout(() => { void context.close(); }, 600);
    } catch {
      // Browsers can block sound until a user gesture; the visual alert still works.
    }
  }, []);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem('poultryflow-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const dark = savedTheme ? savedTheme === 'dark' : prefersDark;
    setIsDark(dark);
    document.documentElement.classList.toggle('dark', dark);
  }, []);

  const toggleTheme = () => {
    setIsDark((current) => {
      const next = !current;
      document.documentElement.classList.toggle('dark', next);
      window.localStorage.setItem('poultryflow-theme', next ? 'dark' : 'light');
      return next;
    });
  };

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setIsMobile(true);
        setIsSidebarOpen(false);
      } else {
        setIsMobile(false);
        setIsSidebarOpen(true);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (isMobile) {
      setIsSidebarOpen(false);
    }
  }, [pathname, isMobile]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const showWelcomeAlert = window.sessionStorage.getItem('poultryflow-login-alert') === '1';
    if (showWelcomeAlert) window.sessionStorage.removeItem('poultryflow-login-alert');

    void loadNotifications(showWelcomeAlert).then((data) => {
      if (cancelled || !data || !showWelcomeAlert || data.totalCount === 0) return;
      setWelcomeOpen(true);
      playNotificationSound();
    });

    const refreshNotifications = () => { void loadNotifications(); };
    window.addEventListener(BUSINESS_DATA_UPDATED_EVENT, refreshNotifications);
    return () => {
      cancelled = true;
      window.removeEventListener(BUSINESS_DATA_UPDATED_EVENT, refreshNotifications);
    };
  }, [loadNotifications, playNotificationSound, user]);

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
      return;
    }

    if (user?.role === 'DATA_ENTRY') {
      const blocked = adminOnlyRoutes.some(
        (route) => pathname === route || pathname.startsWith(`${route}/`),
      );
      if (blocked) {
        router.replace('/dashboard');
      }
    }
  }, [loading, pathname, router, user]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: 'var(--bg-secondary)' }}>
          <div className="text-center">
          <div className="mb-4 mx-auto h-12 w-12 rounded-2xl border-4 border-emerald-100 border-t-emerald-700 animate-spin" />
          <p className="text-sm font-medium animate-pulse" style={{ color: 'var(--text-secondary)' }}>
            Initializing PoultryFlow...
          </p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const currentPage = pageMeta[pathname] ?? { label: 'Workspace', section: 'Jahania Poultry' };

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-secondary)' }}>
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} isMobile={isMobile} />
      
      <main
        className={`transition-all duration-300 ease-in-out min-h-screen flex flex-col ${
          isMobile ? 'ml-0' : (isSidebarOpen ? 'ml-[280px]' : 'ml-0')
        }`}
      >
        {/* Top Header */}
        <header className="no-print sticky top-0 z-40 flex min-h-[76px] items-center justify-between border-b px-4 py-3 backdrop-blur-xl sm:px-6 lg:px-8" style={{ background: 'color-mix(in srgb, var(--bg-card) 88%, transparent)', borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="rounded-xl p-2.5 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
              style={{ color: 'var(--text-secondary)' }}
              aria-label="Toggle Sidebar"
            >
              <Menu size={20} />
            </button>

            <div className="hidden items-center gap-2 text-xs font-bold sm:flex" style={{ color: 'var(--text-muted)' }}>
              <span>Workspace</span><ChevronRight size={13} /><span style={{ color: 'var(--text-primary)' }}>{currentPage.label}</span>
            </div>
            {(!isSidebarOpen || isMobile) && <div className="block font-black tracking-tight sm:hidden" style={{ color: 'var(--text-primary)' }}>{currentPage.label}</div>}
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <button onClick={() => router.push('/notifications')} className="relative rounded-xl p-2.5 transition-colors hover:bg-black/5 dark:hover:bg-white/10" style={{ color: notifications?.totalCount ? 'var(--text-primary)' : 'var(--text-muted)' }} title={notifications?.totalCount ? `${notifications.totalCount} pending items` : 'Notifications'} aria-label="Open notifications">
              <Bell size={20} />
              {Boolean(notifications?.totalCount) && <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-amber-500 px-1 text-center text-[9px] font-black leading-5 text-white ring-2 ring-[var(--bg-card)]">{notifications?.totalCount && notifications.totalCount > 99 ? '99+' : notifications?.totalCount}</span>}
            </button>

            <button className="hidden rounded-xl p-2.5 transition-colors hover:bg-black/5 dark:hover:bg-white/10 sm:block" style={{ color: 'var(--text-muted)' }} title="Help"><CircleHelp size={18} /></button>

            <button onClick={toggleTheme} className="rounded-xl p-2.5 transition-colors hover:bg-black/5 dark:hover:bg-white/10" style={{ color: 'var(--text-secondary)' }} title={isDark ? 'Use light theme' : 'Use dark theme'} aria-label="Toggle color theme">
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            
            <div className="mx-1 h-8 w-px" style={{ background: 'var(--border)' }}></div>
            
            <div className="flex items-center gap-2">
              <div className="hidden text-right sm:block">
                <div className="text-xs font-black" style={{ color: 'var(--text-primary)' }}>{user.name}</div>
                <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{user.role}</div>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 font-black text-emerald-800 ring-4 ring-emerald-50 dark:ring-emerald-950">
                <User size={18} />
              </div>
            </div>
          </div>
        </header>

        {welcomeOpen && notifications && (
          <div className="fixed right-4 top-[86px] z-[60] w-[min(390px,calc(100vw-2rem))] overflow-hidden rounded-3xl border shadow-2xl" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', boxShadow: '0 24px 70px rgba(23,38,31,.2)' }}>
            <div className="flex items-start justify-between border-b px-5 py-4" style={{ borderColor: 'var(--border)' }}>
              <div><div className="mb-1 text-[10px] font-black uppercase tracking-[.18em] text-amber-600">PoultryFlow alert</div><h2 className="text-lg font-black" style={{ color: 'var(--text-primary)' }}>Pending work needs attention</h2><p className="mt-1 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{notifications.totalCount} open item{notifications.totalCount === 1 ? '' : 's'} across your operation.</p></div>
              <button onClick={() => setWelcomeOpen(false)} className="rounded-xl p-2 transition hover:bg-black/5 dark:hover:bg-white/10" style={{ color: 'var(--text-muted)' }} aria-label="Close alert"><X size={17} /></button>
            </div>
            <div className="space-y-2 p-3">
              {notifications.items.slice(0, 4).map((notification) => {
                const meta = notificationCategoryMeta[notification.category];
                return <button key={notification.id} onClick={() => { setWelcomeOpen(false); router.push(notification.href); }} className="flex w-full items-center gap-3 rounded-2xl p-3 text-left transition hover:bg-black/[.04] dark:hover:bg-white/[.06]"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[10px] font-black ${notificationMiniClasses[notification.category]}`}>{meta.label.slice(0, 1)}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-black" style={{ color: 'var(--text-primary)' }}>{notification.title}</span><span className="block truncate text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>{notification.description}</span></span><span className="shrink-0 text-xs font-black text-red-600">{formatNotificationAmount(notification.amount)}</span></button>;
              })}
            </div>
            <div className="flex items-center justify-between border-t px-5 py-3" style={{ borderColor: 'var(--border)' }}><span className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>Total pending: {formatNotificationAmount(notifications.totalAmount)}</span><button onClick={() => { setWelcomeOpen(false); router.push('/notifications'); }} className="inline-flex items-center gap-1 text-xs font-black text-emerald-700">View all <ArrowUpRight size={14} /></button></div>
          </div>
        )}

        {/* Content Area */}
        <div className="mx-auto w-full max-w-[1600px] flex-1 p-4 sm:p-6 lg:p-8">
          <div className="animate-fade-in">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
