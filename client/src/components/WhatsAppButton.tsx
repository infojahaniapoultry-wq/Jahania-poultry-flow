'use client';

import { MessageCircle } from 'lucide-react';

interface WhatsAppButtonProps {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  label?: string;
  title?: string;
  className?: string;
}

export default function WhatsAppButton({
  onClick,
  disabled = false,
  loading = false,
  label = 'WhatsApp',
  title = 'Share on WhatsApp',
  className = '',
}: WhatsAppButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      title={title}
      aria-label={title}
      className={`inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      <MessageCircle size={15} />
      {loading ? 'Opening…' : label}
    </button>
  );
}
