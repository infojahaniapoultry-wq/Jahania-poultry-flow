'use client';
import { ReactNode } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  icon?: ReactNode;
  color?: 'green' | 'amber' | 'red' | 'blue';
  loading?: boolean;
}

const colorStyles = {
  green: { 
    bg: 'bg-emerald-50', 
    text: 'text-emerald-700', 
    border: 'border-emerald-100', 
    iconBg: 'bg-emerald-100/50',
    trendText: 'text-emerald-600'
  },
  amber: { 
    bg: 'bg-amber-50', 
    text: 'text-amber-700', 
    border: 'border-amber-100', 
    iconBg: 'bg-amber-100/50',
    trendText: 'text-amber-600'
  },
  red: { 
    bg: 'bg-red-50', 
    text: 'text-red-700', 
    border: 'border-red-100', 
    iconBg: 'bg-red-100/50',
    trendText: 'text-red-600'
  },
  blue: { 
    bg: 'bg-blue-50', 
    text: 'text-blue-700', 
    border: 'border-blue-100', 
    iconBg: 'bg-blue-100/50',
    trendText: 'text-blue-600'
  },
};

export default function StatCard({ title, value, subtitle, trend, trendValue, icon, color = 'green', loading }: StatCardProps) {
  const s = colorStyles[color];

  if (loading) {
    return (
      <div className="rounded-2xl border p-5 shadow-[var(--shadow)]" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="skeleton mb-4 h-3 w-1/3" />
        <div className="skeleton mb-4 h-8 w-1/2" />
        <div className="skeleton h-3 w-2/3" />
      </div>
    );
  }

  return (
    <div className="group relative overflow-hidden rounded-2xl border p-5 shadow-[var(--shadow-soft)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-lg)]" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
      <div className={`absolute -right-8 -top-8 h-28 w-28 rounded-full opacity-30 blur-2xl transition-opacity duration-300 group-hover:opacity-60 ${s.bg}`} />
      <div className={`absolute inset-x-0 top-0 h-1 ${s.bg.replace('bg-', 'bg-')}`} />
      
      <div className="flex justify-between items-start relative z-10">
        <div>
          <p className="eyebrow mb-1">{title}</p>
          <div className="mb-2 text-[1.7rem] font-black tracking-[-.04em]" style={{ color: 'var(--text-primary)' }}>
            {value}
          </div>
          
          <div className="flex items-center gap-1.5 min-h-[1.25rem]">
            {trend === 'up' && <TrendingUp size={14} className="text-emerald-500" />}
            {trend === 'down' && <TrendingDown size={14} className="text-red-500" />}
            {trend === 'neutral' && <Minus size={14} className="text-slate-400" />}
            
            {trendValue && (
              <span className={`text-xs font-bold ${
                trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-red-600' : 'text-slate-500'
              }`}>
                {trendValue}
              </span>
            )}
            
            {subtitle && (
              <span className="text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}>{subtitle}</span>
            )}
          </div>
        </div>

        {icon && (
          <div className={`rounded-2xl p-3 ${s.bg} ${s.text} shadow-sm transition-transform duration-300 group-hover:scale-110`}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
