# Task Plan

## Goal
Redesign the Generate Sales Invoice modal into a simple, easy-to-use layout while preserving the existing invoice flow and behavior.

## Phases
1. Inspect current modal structure and identify layout constraints.
2. Redesign the modal markup and styling in a focused way.
3. Verify the updated UI still renders and the form flow is intact.

## Status
- Phase 1 completed.
- Phase 2 completed.
- Phase 3 in progress.

## Key Questions
- What parts of the current modal should remain functionally identical?
- Which visual direction best fits this product without changing the broader app language?

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| `tsconfig.tsbuildinfo` EPERM during client type-check | 1 | Re-ran `tsc` with `--incremental false` to verify the new route without writing the build info file |

---

# Ledger Synchronization and Detail Enhancement

## Goal
Ensure fully paid cash invoices appear in the customer ledger and expose consistent Weight and Rate columns across customer, vendor, and driver ledger views.

## Phases
1. Add failing server regression coverage for fully paid invoice ledger posting and enriched ledger detail.
2. Implement invoice synchronization and server-side commodity enrichment for customer, vendor, and driver ledgers.
3. Update all three ledger UIs and verify server tests, client lint, and type-check.

## Status
- Phase 1 completed.
- Phase 2 completed.
- Phase 3 completed.

## Decisions
- Customer ledger: full invoice amount is recorded as the sale debit; the settled cash amount is recorded as a matching credit so the balance remains correct.
- Weight uses invoice `netWeight` and purchase `weightKg`.
- Rate uses invoice `ratePerKg` and the purchase's stored purchase rate.
- Non-commodity rows show an em dash; no fake values are introduced.
- Ledger detail is API enrichment from linked invoice/purchase records, not duplicated columns on every ledger table.

## Verification
- Server Jest: 12 suites, 41 tests passed.
- Server TypeScript check: passed with `--incremental false`.
- Client TypeScript check: passed with `--incremental false`.
- Client lint: passed with four pre-existing warnings.
- Server production build: passed.
- Client production build: compiled successfully, then failed in the environment during Next.js TypeScript worker startup with `spawn EPERM` in both default and Webpack modes; standalone type-check passed.
- Database backfill: not executed because the configured database rejected the TLS connection due unavailable local credentials.

---

# Vehicle Entry Date and Ledger Export Parity

## Goal
Allow vendor vehicle/purchase entries to use historical or future dates, preserve date alignment in vendor ledgers, and include Weight and Rate in statement PDFs.

## Status
- Investigation completed.
- Implementation completed.
- Verification completed.

## Decisions
- Use the existing shared editable `DatePicker` pattern from payment settlement.
- Keep the backend date handling unchanged because it already accepts and posts the selected purchase date.
- Add Weight and Rate only to statement PDF tables; other invoice/purchase print layouts already include the relevant commodity fields.

## Verification
- Purchase service focused tests: 6 passed.
- Full server Jest: 12 suites, 42 tests passed.
- Client TypeScript check: passed with `--incremental false`.
- Client lint: passed with 0 errors and 4 existing warnings.
- `git diff --check`: passed; only line-ending normalization warnings.

## Dedicated Pricing Page Follow-up

- Added admin-only `/pricing` route and sidebar navigation.
- Moved daily Farm/Final benchmark administration off the Vendors page.
- Kept the PDF-defined customer rule model unchanged for now: customers may select Farm or Final and apply a plus/minus offset.
- Client TypeScript, lint, diff validation, and production build passed after the page move.

---

# Rule-Based Market Pricing

## Goal
Add Farm/Final market-rate history and customer-specific plus/minus pricing rules for new sales invoices, with admin-only market-rate updates and overrides.

## Phases
1. Add failing pricing, market-rate, customer-rule, and invoice-calculation tests.
2. Implement schema, migration, pricing services/APIs, invoice enforcement, and seed data.
3. Add customer/vendor/invoice UI workflows and verify all checks.

## Decisions
- Customer rule uses base type (`FARM`/`FINAL`), direction (`PLUS`/`MINUS`), and non-negative offset amount.
- Market rates are date-based and carry forward from the latest rate on or before the invoice date.
- Dates before the first market-rate record are rejected.
- Rules and rates affect new invoices only; existing invoice item rates remain immutable.
- Market-rate controls live on the Vendors page; customer rules live on customer create/edit forms.
- Admins may override per-item rates; data-entry users cannot.
- Seed values: sample customer Farm minus 6; Farm 320; Final 322.

## Status
- Investigation completed.
- Implementation completed.

## Verification
- Server Jest: 15 suites, 55 tests passed.
- Server TypeScript check: passed with `--incremental false`.
- Client TypeScript check: passed with `--incremental false`.
- Client lint: passed with 0 errors and 4 pre-existing warnings.
- Server and client production builds: passed.
- Prisma migration applied and development seed completed successfully.
- `git diff --check`: passed; only line-ending normalization warnings.
