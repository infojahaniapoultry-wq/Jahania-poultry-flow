# Shared layouts

## `src/components/AppLayout.tsx`

Authenticated app shell with responsive sidebar drawer, sticky top header, search affordance, theme toggle, user identity, and padded centered content area.

```tsx
'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import Sidebar from './Sidebar';
import { Menu, Bell, Search, User, Sun, Moon, Command } from 'lucide-react';

const adminOnlyRoutes = ['/reports', '/pricing', '/users'];
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth(); const router = useRouter(); const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true); const [isMobile, setIsMobile] = useState(false); const [isDark, setIsDark] = useState(false);
  useEffect(() => { const savedTheme = window.localStorage.getItem('poultryflow-theme'); const dark = savedTheme ? savedTheme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches; setIsDark(dark); document.documentElement.classList.toggle('dark', dark); }, []);
  useEffect(() => { const handleResize = () => { const mobile = window.innerWidth < 1024; setIsMobile(mobile); setIsSidebarOpen(!mobile); }; handleResize(); window.addEventListener('resize', handleResize); return () => window.removeEventListener('resize', handleResize); }, []);
  useEffect(() => { if (isMobile) setIsSidebarOpen(false); }, [pathname, isMobile]);
  useEffect(() => { if (!loading && !user) router.replace('/login'); if (user?.role === 'DATA_ENTRY' && adminOnlyRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`))) router.replace('/dashboard'); }, [loading, pathname, router, user]);
  if (loading) return <div className="flex min-h-screen items-center justify-center" style={{ background: 'var(--bg-secondary)' }}>Loading PoultryFlow…</div>;
  if (!user) return null;
  return <div className="min-h-screen" style={{ background: 'var(--bg-secondary)' }}><Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} isMobile={isMobile} /><main className={`${isMobile ? 'ml-0' : isSidebarOpen ? 'ml-[280px]' : 'ml-0'} min-h-screen transition-all`}><header className="no-print sticky top-0 z-40 flex items-center justify-between border-b px-4 py-3 backdrop-blur-xl sm:px-6" style={{ background: 'color-mix(in srgb, var(--bg-card) 88%, transparent)', borderColor: 'var(--border)' }}><button onClick={() => setIsSidebarOpen(!isSidebarOpen)} aria-label="Toggle Sidebar"><Menu size={20} /></button><div className="flex items-center gap-2"><div className="hidden items-center gap-2 rounded-xl border px-3 py-2 text-sm md:flex" style={{ background: 'var(--bg-muted)', borderColor: 'var(--border)' }}><Search size={16} /><span>Search records…</span><Command size={11} /></div><Bell size={20} /><button onClick={() => { const next = !isDark; setIsDark(next); document.documentElement.classList.toggle('dark', next); window.localStorage.setItem('poultryflow-theme', next ? 'dark' : 'light'); }}>{isDark ? <Sun size={18} /> : <Moon size={18} />}</button><div className="h-8 w-px" style={{ background: 'var(--border)' }} /><User size={18} /><span className="hidden text-xs font-black sm:inline">{user.name}</span></div></header><div className="mx-auto w-full max-w-[1600px] p-4 sm:p-6 lg:p-8"><div className="animate-fade-in">{children}</div></div></main></div>;
}
```

## `src/components/Sidebar.tsx`

Fixed dark pine navigation grouped into Overview, Operations, Parties, Finance, Insights, and Admin sections. Active item uses a pale sage pill. Includes Farm pulse status, current user, and sign out.
