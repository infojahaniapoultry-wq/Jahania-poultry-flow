# Shared UI components

## `src/components/StatCard.tsx`

Reusable KPI card for dashboard totals. Props: `title`, `value`, `subtitle`, `trend`, `trendValue`, `icon`, `color`, `loading`.

```tsx
'use client';
import { ReactNode } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface StatCardProps {
  title: string; value: string | number; subtitle?: string;
  trend?: 'up' | 'down' | 'neutral'; trendValue?: string; icon?: ReactNode;
  color?: 'green' | 'amber' | 'red' | 'blue'; loading?: boolean;
}

export default function StatCard({ title, value, subtitle, trend, trendValue, icon, color = 'green', loading }: StatCardProps) {
  if (loading) return <div className="surface-card p-5"><div className="skeleton mb-4 h-3 w-1/3" /><div className="skeleton mb-4 h-8 w-1/2" /><div className="skeleton h-3 w-2/3" /></div>;
  return <div className="surface-card group relative overflow-hidden p-5"><p className="eyebrow">{title}</p><div className="text-2xl font-black">{value}</div>{subtitle && <span>{subtitle}</span>}{icon}</div>;
}
```

## `src/components/DataTable.tsx`

Sortable, searchable, paginated data table. Props include `columns`, `data`, `loading`, `emptyMessage`, `keyField`, `searchPlaceholder`, `pageSizeOptions`, and sorting defaults.

## `src/components/DatePicker.tsx`

Theme-aware date field used by pricing and reports.

## `src/components/Modal.tsx`

Shared dialog surface for create/edit workflows.
