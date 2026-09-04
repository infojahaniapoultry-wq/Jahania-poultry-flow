# 🐔 Poultry Business Management System

A full-stack business management system built for **Jahania Poultry Service** to manage invoices, purchases, customers, vendors, ledgers, transactions, and financial reports

---

## 🛠️ Tech Stack
| Layer | Technology |
|-------|-----------|
| **Backend** | NestJS (Node.js) + TypeScript |
| **Database** | PostgreSQL via Prisma ORM |
| **Frontend** | Next.js 16 + TailwindCSS |
| **Auth** | JWT (Passport.js) |
| **Deployment** | Vercel (backend & frontend) |
---

## 📁 Project Structure.

```
Poultry-Business-Management-System/
├── client/        # Next.js frontend
└── server/        # NestJS backend + Prisma
```

---

## 🚀 Getting Started

## ☁️ Deploy to Vercel

The repository is prepared as two Vercel projects: `client` for the Next.js
frontend and `server` for the NestJS API. Follow the complete deployment guide
in [DEPLOYMENT.md](./DEPLOYMENT.md).

### Prerequisites

- Node.js v18+
- PostgreSQL database
- npm

---

### ⚙️ Backend Setup (NestJS)

```bash
# Navigate to server directory
cd server

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your DATABASE_URL and JWT_SECRET

# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate dev

# (Optional) Seed the database
npm run seed

# Start in development mode (with hot reload)
npm run dev
```

> Backend runs at: `http://localhost:3010`

---

### 🌐 Frontend Setup (Next.js)

```bash
# Navigate to client directory
cd client

# Install dependencies
npm install

# Set up environment variables
# Create client/.env.local and add:
# NEXT_PUBLIC_API_URL=http://localhost:3010/api

# Start in development mode
npm run dev
```

> Frontend runs at: `http://localhost:3000`

---

## 🧩 Key Features

- **Invoices** — Create, manage, void, and track customer invoices
- **Purchases** — Record and manage vendor purchase entries
- **Customers & Vendors** — Ledger-based balance tracking
- **Transactions** — CASH, CHEQUE, ONLINE (EasyPaisa, JazzCash, Bank Transfer) payment support
- **Reports** — Daily P&L, cash book, ledger reports
- **Auth** — Secure JWT-based login system

---

## 📜 Available Scripts

### Backend (`/server`)

| Command | Description |
|---------|-------------|
| `npm run dev` | Start in watch/dev mode |
| `npm run start` | Start normally |
| `npm run build` | Build for production |
| `npm run seed` | Seed the database |
| `npm run test` | Run unit tests |

### Frontend (`/client`)

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Build for production |
| `npm run start` | Start production server |

---

## 🔐 Environment Variables

### Server (`server/.env`)

```env
DATABASE_URL=your_postgresql_connection_string
JWT_SECRET=your_jwt_secret
PORT=3010
FRONTEND_URL=http://localhost:3000
```

### Client (`client/.env.local`)

```env
NEXT_PUBLIC_API_URL=http://localhost:3010/api
```

---

## 📄 License

This project is private and proprietary.
