# Progress

- Started modal redesign task.
- Identified the invoice modal component and its page-level usage.
- Simplified the shared sales invoice modal into a plain stacked form with no sidebar or hero treatment.
- Replaced the invoices page inline modal with the shared sales modal component so the UI stays consistent and duplicated markup is gone.
- Verified lint passes for the modified frontend files.
- Added a purchase detail route at `client/src/app/purchases/[id]/page.tsx`.
- Updated the invoices register purchase eye action to open the purchase detail page.
- Verified client lint and type-check with `--incremental false` due a locked `tsbuildinfo` file.
- Fixed partial purchase settlement propagation so cleared CHEQUE/ONLINE payments now advance the source `settledAmount` and status to `COMPLETED`.
- Simplified the transaction status label so completed rows are no longer overridden by the partial heuristic.
- Added server regression tests covering cheque and online settlement completion for partially paid purchases.

## Ledger Enhancement Session

- Confirmed the missing fully-paid cash invoice ledger entry is a real code-path defect, not only a UI issue.
- Confirmed Weight and Rate data already exists on invoice items and purchase entries.
- Implementation started with test-first coverage; no production ledger changes made yet.
- Added invoice sale/payment ledger pairing and compatible void reversals.
- Added shared invoice/purchase ledger detail enrichment for customer, vendor, driver, and report statements.
- Added Weight and Rate columns to all customer, vendor, driver, and statement ledger tables.
- Added an idempotent historical backfill command: `npm run backfill:paid-invoice-ledgers --workspace server`.
- Verified 41 server tests, server/client TypeScript checks, and client lint; database backfill remains pending until a working database TLS credential is available.
- Server production build passes. Client production compilation passes, but Next.js TypeScript worker startup fails with Windows `spawn EPERM` in both Turbopack and Webpack modes; standalone client type-check remains green.

## Vehicle Entry Date and Export Follow-up

- Confirmed the purchase/vendor vehicle-entry date lock is frontend-only: the editable value is replaced by a read-only “Today” display.
- Confirmed the backend already supports historical/future purchase dates and uses that date for vendor and driver ledger posting.
- Confirmed the report PDF ledger export omits the newly displayed Weight and Rate fields; PDF parity is required.
- Replaced the read-only purchase “Today” display with the editable shared `DatePicker`.
- Added Weight and Rate to statement PDF exports using the same formatting as the on-screen ledger.
- Added a purchase-service regression test proving a backdated purchase and its vendor-ledger entry share the selected date.
- Re-ran focused and full server tests, client type-check, client lint, and diff validation successfully.

## Rule-Based Pricing Session

- Approved pricing behavior: date-based Farm/Final history with latest-prior carry-forward; new invoices only; admin-only per-item overrides.
- Approved UI placement: global market-rate fields on the Vendors page and customer pricing-rule fields on customer forms.
- Approved development seed values: Farm 320, Final 322, sample customer Farm minus 6.
- Implementation completed across schema, API, invoice enforcement, customer/vendor/invoice UI, migration, and seed data.
- Verification: 55 server Jest tests passed, server/client TypeScript checks passed, server/client production builds passed, client lint passed with four pre-existing warnings, and `git diff --check` passed.
- Database migration `20260729235000_market_pricing` applied successfully and the development seed completed successfully.
- Existing invoice rates remain stored on invoice items; later customer-rule or market-rate changes affect only new invoices.
- Added a dedicated admin-only `/pricing` page for Farm/Final benchmark administration; removed the global rate panel from Vendors while retaining the PDF-defined customer choice of either benchmark.
