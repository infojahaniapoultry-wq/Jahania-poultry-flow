'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import Sidebar from './Sidebar';
import { Menu, Bell, Search, User, Sun, Moon, Command } from 'lucide-react';

const adminOnlyRoutes = ['/reports', '/pricing', '/users'];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [isDark, setIsDark] = useState(false);

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

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-secondary)' }}>
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} isMobile={isMobile} />
      
      <main
        className={`transition-all duration-300 ease-in-out min-h-screen flex flex-col ${
          isMobile ? 'ml-0' : (isSidebarOpen ? 'ml-[280px]' : 'ml-0')
        }`}
      >
        {/* Top Header */}
        <header className="no-print sticky top-0 z-40 flex items-center justify-between border-b px-4 py-3 backdrop-blur-xl sm:px-6" style={{ background: 'color-mix(in srgb, var(--bg-card) 88%, transparent)', borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="rounded-xl p-2.5 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
              style={{ color: 'var(--text-secondary)' }}
              aria-label="Toggle Sidebar"
            >
              <Menu size={20} />
            </button>
            
            {/* Contextual Page Title (Mobile) */}
            {(!isSidebarOpen || isMobile) && (
              <div className="block font-black tracking-tight sm:hidden" style={{ color: 'var(--text-primary)' }}>
                PoultryFlow
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            {/* Search - Desktop only (not yet implemented) */}
            <div className="hidden items-center gap-2 rounded-xl border px-3.5 py-2 text-sm opacity-80 md:flex" style={{ background: 'var(--bg-muted)', borderColor: 'var(--border)', color: 'var(--text-muted)' }} title="Search coming soon">
              <Search size={16} />
              <span className="w-36 select-none lg:w-56">Search records...</span>
              <span className="ml-2 hidden items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold lg:flex" style={{ borderColor: 'var(--border)' }}><Command size={10} />K</span>
            </div>

            <button className="relative rounded-xl p-2.5 transition-colors hover:bg-black/5 dark:hover:bg-white/10" style={{ color: 'var(--text-muted)' }} title="Notifications (coming soon)" disabled>
              <Bell size={20} />
              <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-amber-500" />
            </button>

            <button onClick={toggleTheme} className="rounded-xl p-2.5 transition-colors hover:bg-black/5 dark:hover:bg-white/10" style={{ color: 'var(--text-secondary)' }} title={isDark ? 'Use light theme' : 'Use dark theme'} aria-label="Toggle color theme">
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            
            <div className="h-8 w-[1px] bg-slate-200 mx-1"></div>
            
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
