# Shared UI Components

The app is a Next.js React app using Tailwind CSS and lucide-react icons.

## `client/src/components/DataTable.tsx`

Shared sortable/searchable table used by reports, drivers, invoices, and registers. It receives `columns`, `data`, `loading`, `emptyMessage`, and optional `hideSearch` props and renders responsive table rows with a footer.

## `client/src/components/Modal.tsx`

Shared modal primitive used for data-entry forms. It receives `open`, `onClose`, `title`, `children`, `footer`, and optional `size`; it renders a centered card with a dimmed backdrop and sticky footer.

## `client/src/components/DatePicker.tsx`

Shared date input wrapper used by invoice, purchase, transaction, and report flows. It accepts `value`, `onChange`, and optional `className`, and keeps date input styling consistent.

## `client/src/components/StatCard.tsx`

Reusable metric card for dashboard summaries with label, value, icon, color, and supporting text.
