'use client';
import { Toaster } from 'react-hot-toast';
export default function ToastProvider() {
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        style: { background: '#1e293b', color: '#f1f5f9', border: '1px solid #334155', borderRadius: '0.75rem', fontSize: '0.875rem' },
        success: { iconTheme: { primary: '#22c55e', secondary: '#1e293b' } },
        error: { iconTheme: { primary: '#ef4444', secondary: '#1e293b' } },
      }}
    />
  );
}
