# Findings

- The sales invoice modal lives in `client/src/components/SalesInvoiceModal.tsx`.
- `client/src/app/invoices/page.tsx` now reuses the shared sales modal instead of keeping a second inline copy.
- The current modal layout is intentionally plain: a compact intro strip, stacked form sections, and a small summary footer.
- The simplified design preserves the existing invoice workflow while reducing visual noise and click depth.
- `server/src/purchases/purchases.controller.ts` already exposes `GET /purchases/:id`, so purchase detail routing is a frontend-only change.
- The invoices register now links purchase rows to `/purchases/[id]` instead of sending users back to the purchase workspace.
- Purchase and invoice settlement logs were only flipping `paymentStatus`; the source row's `settledAmount` also needed to advance when CHEQUE or ONLINE clears the remaining balance.
- The transactions page was showing `Partial` before `COMPLETED`, so stale rows could keep the partial badge even after the payment status had been finalized

## Ledger Synchronization and Detail Findings

- `InvoicesService.create()` only calls `postCustomerLedger()` when `totalAmount - settledAmount !== 0`; a fully paid cash invoice therefore has an invoice and cashbook row but no customer-ledger row.
- `InvoiceItem` already stores `netWeight`, `ratePerKg`, `amount`, and optional description.
- `PurchaseEntry` already stores commodity weight and purchase pricing; ledger responses can enrich linked purchase rows without changing ledger schemas.
- Customer, vendor, and driver pages each render their own ledger `DataTable`; all three need matching Weight and Rate columns and typed response fields.
- Payment, voucher, settlement, and reversal rows may not have commodity data and should return/display `null` or `—`.
- Fully paid invoices now create a debit sale row plus a credit payment row; the pair leaves the customer balance unchanged while preserving audit visibility.
- Invoice void logic reverses both rows and remains compatible with legacy invoices that only posted the outstanding balance.
- The idempotent `backfill:paid-invoice-ledgers` script repairs historical fully paid cash invoices and recalculates customer running balances, but the current environment cannot connect to the configured database because its TLS credential is unavailable.

## Vehicle Entry Date and Export Review

- The vendor vehicle-entry workflow is the purchase page at `client/src/app/purchases/page.tsx`.
- Its form already stores and submits `form.date`, but the date control is rendered as a read-only value with a `Today` badge, so yesterday and future dates cannot be selected.
- The purchase API DTO and service already accept and normalize an arbitrary ISO date, and vendor/driver ledger rows use that normalized purchase date; no server date-lock was found.
- The payment credit-settlement form uses the shared editable `DatePicker`, which is the existing pattern to align with.
- The report PDF currently exports ledger rows with Date, Narration, Type, Amount, and Balance only; the on-screen report already has Weight and Rate, so the PDF ledger table needs the same two fields for parity.

## Rule-Based Pricing Findings

- `Customer` currently has no pricing-rule fields; customer create/update DTOs and the customer modal are the correct extension points.
- `InvoiceItem.ratePerKg` is currently required in the DTO and entered manually in `SalesInvoiceModal`; invoice creation already persists the value on each item, so the pricing engine can replace the source of that value without changing historical rows.
- `InvoicesController` is guarded by JWT and role guards but does not currently inject the authenticated user; admin-only overrides require passing the current role into invoice creation.
- The seeder creates one sample customer and no market-rate rows; it can be extended with the approved sample rule and current effective market rates.
- The approved UI placement is an admin-only global market-rate panel on the Vendors page, while per-customer rule fields belong on customer registration/edit forms.
