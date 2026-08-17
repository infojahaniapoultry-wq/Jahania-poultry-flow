# Extractable components

## AppLayout
- Source: `src/components/AppLayout.tsx`
- Category: layout
- Description: Responsive authenticated shell with sticky toolbar and sidebar offset.
- Extractable props: none; route and user state are internal.

## Sidebar
- Source: `src/components/Sidebar.tsx`
- Category: layout
- Description: Dark pine navigation with grouped links, farm pulse, and profile footer.
- Extractable props: `isOpen` (boolean), `isMobile` (boolean), `onClose` (function)

## StatCard
- Source: `src/components/StatCard.tsx`
- Category: basic
- Description: Dashboard KPI card with status color, icon, loading state, and optional trend.
- Extractable props: `title`, `value`, `subtitle`, `trend`, `trendValue`, `icon`, `color`, `loading`

## DataTable
- Source: `src/components/DataTable.tsx`
- Category: basic
- Description: Searchable, sortable, paginated table for operational records.
- Extractable props: `columns`, `data`, `loading`, `emptyMessage`, `searchPlaceholder`, `defaultPageSize`
