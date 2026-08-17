# Routes

- `/login` → `src/app/login/page.tsx` (public auth)
- `/dashboard` → `src/app/dashboard/page.tsx` (authenticated overview)
- `/purchases` → `src/app/purchases/page.tsx` (operations/register)
- `/invoices` → `src/app/invoices/page.tsx` (sales)
- `/customers` → `src/app/customers/page.tsx` (party management)
- `/vendors` → `src/app/vendors/page.tsx` (party management)
- `/drivers` → `src/app/drivers/page.tsx` (transport)
- `/transactions` → `src/app/transactions/page.tsx` (finance)
- `/finance/credit`, `/finance/cheques`, `/finance/online` → finance pages
- `/reports` → `src/app/reports/page.tsx` (admin insights)
- `/pricing` → `src/app/pricing/page.tsx` (admin pricing)
- `/users` → `src/app/users/page.tsx` (admin controls)

The root route redirects to `/dashboard`. Authenticated routes use `AppLayout` directly in each page.
