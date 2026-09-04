'use client';
import { ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg' | 'xl';
}

export default function Modal({ open, onClose, title, children, footer, size = 'md' }: ModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (open) {
      document.addEventListener('keydown', handler);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = 'unset';
    };
  }, [open, onClose]);

  if (!open) return null;

  const sizeClasses = {
    md: 'max-w-xl',
    lg: 'max-w-3xl',
    xl: 'max-w-5xl',
  };

  return (
    <div 
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 animate-fade-in"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal Content */}
      <div
        className={`relative w-full ${sizeClasses[size]} rounded-2xl shadow-2xl border flex flex-col max-h-[90vh] animate-slide-up`}
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        {/* Header */}
        <div
          className="px-6 py-4 border-b flex items-center justify-between sticky top-0 backdrop-blur-md rounded-t-2xl z-10"
          style={{ background: 'color-mix(in srgb, var(--bg-card) 92%, transparent)', borderColor: 'var(--border)' }}
        >
          <h2 className="text-lg font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>{title}</h2>
          <button 
            onClick={onClose} 
            className="p-2 rounded-xl transition-all hover:bg-black/5 dark:hover:bg-white/10"
            style={{ color: 'var(--text-muted)' }}
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 px-6 py-6 overflow-y-auto custom-scrollbar">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div
            className="px-6 py-4 border-t flex justify-end gap-3 rounded-b-2xl"
            style={{ background: 'color-mix(in srgb, var(--bg-muted) 55%, transparent)', borderColor: 'var(--border)' }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
