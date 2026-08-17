import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth';
import ToastProvider from '@/components/ToastProvider';

export const metadata: Metadata = {
  title: 'PoultryFlow — Jahania Poultry Management',
  description: 'Premium poultry business management system for purchases, sales, accounts & reports.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <AuthProvider>
          <ToastProvider />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
