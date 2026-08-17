# Routes

- `/login` — authentication screen
- `/dashboard` — daily operations dashboard
- `/purchases` — purchase entry register
- `/invoices` — sales invoice register
- `/customers` — customer accounts and pricing rules
- `/vendors` — vendor accounts
- `/drivers` — driver fleet and ledger
- `/transactions` — unified transaction register and manual expense/transport entry
- `/reports` — Daily P&L, ledgers, cash book, expense summary, and recovery
- `/pricing` — market rates (admin)
- `/users` — user controls (admin)

The requested new page is `/expenses`, a dedicated expense management workspace that reuses `AppLayout`, `DatePicker`, `Modal`, and `DataTable`.
