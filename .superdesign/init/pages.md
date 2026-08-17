# Page Dependency Context

## `/transactions`

Entry: `client/src/app/transactions/page.tsx`

Dependencies:
- `client/src/components/AppLayout.tsx`
- `client/src/components/DataTable.tsx`
- `client/src/components/Modal.tsx`
- `client/src/components/DatePicker.tsx`
- `client/src/lib/api.ts`
- `client/src/lib/business-events.ts`
- `client/src/lib/page-cache.ts`

This is the closest existing page for the new expense workspace: it has a date filter, unified ledger table, manual expense modal, expense-account creation, payment modes, and driver transport entry.

## `/reports`

Entry: `client/src/app/reports/page.tsx`

Dependencies:
- `client/src/components/AppLayout.tsx`
- `client/src/components/DataTable.tsx`
- `client/src/components/DatePicker.tsx`
- `client/src/lib/api.ts`
- `client/src/lib/branding.ts`

This page is the visual and information-architecture anchor for date-based expense reporting.
