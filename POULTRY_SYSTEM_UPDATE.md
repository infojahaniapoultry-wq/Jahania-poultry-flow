# Poultry Business Management System — Full Audit & Update Log

> **Date**: 2026-06-04  
> **System**: PoultryFlow / Jahania Poultry Service  
> **Stack**: NestJS + Prisma + PostgreSQL (Backend) | Next.js 16 + TailwindCSS (Frontend)

---

## Issues Found — Grouped by Severity

### 🔴 CRITICAL BUGS (Will Cause Data Corruption or App Crashes)

#### 1. Invoice Void — Missing Balance Reversal on Customer Ledger
- **File**: `server/src/invoices/invoices.service.ts` — `voidInvoice()`
- **Bug**: Voiding a fully-paid cash invoice doesn't restore customer balance (`balanceDelta == 0` so no ledger entry is posted, but customer was DEBIT'd at creation).
- **Impact**: Customer balances become permanently incorrect after voiding fully paid invoices.
- **Fix**: Always post a full CREDIT reversal of `totalAmount` to customer on void.

#### 2. Purchase Void — Same Pattern as Invoice Void
- **File**: `server/src/purchases/purchases.service.ts` — `voidPurchase()`
- **Bug**: Identical to #1 but for vendor ledger. Fully-paid cash purchases don't restore vendor balance on void.
- **Impact**: Vendor balances permanently wrong after voiding paid purchases.

#### 3. Invoice Items — `firstWeight`/`secondWeight` Always Set Wrong
- **File**: `server/src/invoices/invoices.service.ts` — `create()` (~line 148-149)
- **Bug**: `firstWeight` is always set equal to `netWeight`, and `secondWeight` is always `0`, losing the crate-weight deduction data.
- **Impact**: Invoice breakdown data is incorrect; crate-weight tracking is broken.

#### 4. VoucherNo Race Condition
- **File**: `server/src/vouchers/vouchers.service.ts` — `generateVoucherNo()`
- **Bug**: Voucher number is generated OUTSIDE the database transaction using `count + 1`. Two concurrent requests will get the same number and one will crash with a unique constraint error.
- **Fix**: Generate the number inside the transaction, or use post-insert ID-based numbering.

#### 5. `dayRange()` Uses Server Local Timezone, Not PKT
- **File**: `server/src/shared/ledger-posting.ts` — `dayRange()`
- **Bug**: `setHours(0,0,0,0)` uses the server's local timezone (UTC in Docker). Since Pakistan is UTC+5, early morning PKT transactions are stored with the previous UTC day and are missed by date filters.
- **Fix**: Use `new Date(\`\${date}T00:00:00+05:00\`)` for PKT-correct ranges.

#### 6. Purchase Hard-Delete — Incomplete Ledger Reversal
- **File**: `server/src/purchases/purchases.service.ts` — `remove()`
- **Bug**: Hard delete only reverses ledger for UDHAR mode. CHEQUE and ONLINE payment deletions have no ledger reversal.
- **Impact**: Vendor balance permanently wrong after deleting a purchase.

---

### 🟡 SIGNIFICANT BUGS (Wrong Behavior, Bad UX)

#### 7. Port Mismatch Between `.env` Files
- Root `.env`: `PORT=3011` → Wrong
- `server/.env`: `PORT=3010` → Correct
- `client/.env.local`: `NEXT_PUBLIC_API_URL=http://localhost:3010/api` → Correct
- **Fix**: Change root `.env` PORT to `3010`.

#### 8. 🔐 SECURITY — Production Neon DB Credentials in Root `.env`
- **File**: `/Poultry-Business-Management-System/.env` line 8
- Real Neon DB password is in plain text. If committed to git, credentials are exposed.
- **Action Required**: Rotate Neon password immediately. Add `.env` to root `.gitignore`.

#### 9. Auth Token Not Validated on Session Restore
- **File**: `client/src/lib/auth.tsx`
- JWT is restored from localStorage without checking expiry. Expired tokens show user as "logged in" until first 401.
- **Fix**: Decode JWT and check `exp` field, or call `/auth/me` on mount.

#### 10. Missing `FRONTEND_URL` in Server `.env`
- **File**: `server/.env`
- `CORS` in `main.ts` reads `process.env.FRONTEND_URL` but it's not set, so CORS falls back to `origin: true` (allow all).
- **Fix**: Add `FRONTEND_URL=http://localhost:3000` to `server/.env`.

#### 11. JazzCash Void — No Ledger Reversal
- **Files**: `invoices.service.ts` and `purchases.service.ts` void logic
- Void handling only accounts for `EASYPAISA` and `BANK_TRANSFER`. JazzCash (`JAZZCASH`) and `OTHER` online payments are never reversed on void.
- **Fix**: Add `JAZZCASH` and `OTHER` cases to all void handlers.

#### 12. Duplicate Functions in Reports Service
- **File**: `server/src/reports/reports.service.ts`
- `buildOptionalDateFilter()` and `buildDateRange()` are 100% identical.
- **Fix**: Remove one, use the other throughout.

#### 13. `DailyPnL` Type Has Duplicate Fields
- **File**: `server/src/reports/reports.service.ts`
- Fields like `purchaseWt`/`purchasedWeight`, `salesAmt`/`salesAmount`, `dailyProfit`/`netProfit` are set to identical values. Doubles the response payload for no reason.
- **Fix**: Pick one naming convention, remove duplicates.

#### 14. Non-Functional Search Bar in Header
- **File**: `client/src/components/AppLayout.tsx`
- Search input has no state, handler, or functionality. Looks interactive but does nothing.
- **Fix**: Remove until implemented, or add `disabled` styling.

#### 15. Fake Notification Badge
- **File**: `client/src/components/AppLayout.tsx`
- Bell icon always shows a red "unread" dot with no notification system.
- **Fix**: Remove the dot until notifications are implemented.

---

### 🟢 IMPROVEMENTS & CODE QUALITY

#### 16. No Database Indexes on High-Query Fields
- `CustomerLedger`, `VendorLedger`, `Invoice`, `PurchaseEntry`, `CashBook` lack composite indexes on `(date, isVoided)`, `(customerId, date)`, etc.
- **Fix**: Add `@@index` directives in `schema.prisma` + run migration.

#### 17. `TxClient` Typed as `any` in Shared Utilities
- **File**: `server/src/shared/ledger-posting.ts` line 3: `type TxClient = any;`
- **Fix**: Use `Prisma.TransactionClient` for type safety.

#### 18. No Date String Validation on API Query Params
- Controllers accept raw date strings without `@IsDateString()` validation.
- Malformed dates produce silent invalid DB queries.

#### 19. Fragile `getPKTDate()` in Client
- **File**: `client/src/app/invoices/page.tsx`
- Uses `toLocaleString('en-US', { timeZone: 'Asia/Karachi' })` which is browser-inconsistent.
- **Fix**: Use `Intl.DateTimeFormat`.

#### 20. Empty `service/` Directory
- `/service/` only contains a `.env` and `node_modules/` — no actual code.
- **Fix**: Remove from repo if unused.

---

## Fixes Applied

| # | Issue | Status |
|---|-------|--------|
| 1 | Invoice void balance reversal | ✅ Fixed |
| 2 | Purchase void balance reversal | ✅ Fixed |
| 3 | Invoice item firstWeight/secondWeight | ✅ Fixed |
| 4 | VoucherNo race condition | ✅ Fixed |
| 5 | dayRange() PKT timezone | ✅ Fixed |
| 6 | Purchase remove() ledger reversal | ✅ Fixed |
| 7 | Port mismatch root .env | ✅ Fixed |
| 8 | SECURITY - credentials exposure | ⚠️ Manual action needed (rotate Neon password) |
| 9 | Auth token expiry check | ✅ Fixed |
| 10 | Missing FRONTEND_URL | ✅ Fixed |
| 11 | JazzCash void no reversal | ✅ Fixed |
| 12 | Duplicate buildDateRange function | ✅ Fixed |
| 13 | DailyPnL duplicate fields | ✅ Fixed |
| 14 | Non-functional search bar | ✅ Fixed |
| 15 | Fake notification badge | ✅ Fixed |
| 16 | Missing DB indexes | ✅ Fixed |
| 17 | TxClient typed as any | ✅ Fixed |
| 18 | No date validation | ✅ Fixed |
| 19 | Fragile getPKTDate() | ✅ Fixed |
| 20 | Empty service/ directory | ⚠️ Review needed |
