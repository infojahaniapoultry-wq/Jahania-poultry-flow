# Vercel deployment

This repository is a monorepo and should be deployed as two Vercel projects:

- `client/` — Next.js frontend
- `server/` — NestJS API as a Vercel Function

Vercel project settings are scoped to each project, so set the Root Directory to
the matching folder when importing the same Git repository twice.

## 1. Prepare Neon PostgreSQL

This project is Prisma/PostgreSQL based and does not require a database SDK in
the frontend. Create or select a Neon project, then copy the connection URLs
from the Neon dashboard:

- `DATABASE_URL`: pooled Neon connection for the Vercel API. Add
  `connection_limit=1` and `sslmode=require` to keep serverless connections
  bounded.
- `DIRECT_URL`: direct Neon connection for Prisma migrations.

The checked-in template is in [`server/.env.example`](./server/.env.example).

Run the production migration from a trusted terminal before using the API:

```bash
cd server
DATABASE_URL="<neon-pooled-url>" \
DIRECT_URL="<neon-direct-url>" \
npx prisma migrate deploy
```

Do not commit either connection string.

### Move existing PostgreSQL data to Neon

If the Neon database is empty, migrate the existing PostgreSQL data with
`pg_dump` and `pg_restore`. Use the Neon pooled or direct URL for restore:

```bash
export OLD_DATABASE_URL="<old-postgresql-url>"
export NEON_DATABASE_URL="<neon-url>"

pg_dump --format=custom --no-owner --no-privileges \
  "$OLD_DATABASE_URL" > poultryflow.dump

pg_restore --no-owner --no-privileges \
  --dbname="$NEON_DATABASE_URL" poultryflow.dump
```

Validate the restored records before switching production traffic. Keep the
dump private and delete it after verification. Do not use `--clean --if-exists`
unless you have explicitly confirmed that the Neon database may be overwritten.

For a new empty database with no existing records, use the Prisma migrations:

```bash
cd server
DATABASE_URL="<neon-pooled-url>" \
DIRECT_URL="<neon-direct-url>" \
npx prisma migrate deploy
```

## 2. Deploy the backend first

In Vercel:

1. Select **Add New → Project** and import this repository.
2. Set **Root Directory** to `server`.
3. Keep the detected framework/build settings, or use the checked-in
   `server/vercel.json` configuration.
4. Add these Production environment variables:

   ```text
   DATABASE_URL=<Neon pooled URL>
   DIRECT_URL=<Neon direct URL>
   JWT_SECRET=<long random secret>
   JWT_EXPIRES_IN=7d
   FRONTEND_URL=https://your-frontend.vercel.app
   ```

5. Deploy the project.

The API base URL will be similar to:

```text
https://your-backend.vercel.app/api
```

The public health check is `https://your-backend.vercel.app/api/health`. It
checks both the NestJS function and the Neon database and helps confirm that a
sleeping database has woken up.

### Avoiding Neon cold starts

Neon Free suspends an idle compute after five minutes. The first query wakes it
again, so a short delay is expected. For a production workspace that must stay
responsive, open Neon **Branches → your branch → Computes → Edit** and disable
**Scale to zero** on a paid plan. The application also shows a database-waking
indicator and retries safe read requests; it never retries invoice, purchase,
payment, or other write requests.

The server entrypoint is `server/api/index.ts`; it initializes Nest once and
serves requests through Vercel's Node runtime.

## 3. Deploy the frontend

Create a second Vercel project from the same repository:

1. Select **Add New → Project** and import the repository again.
2. Set **Root Directory** to `client`.
3. Add this Production environment variable:

   ```text
   NEXT_PUBLIC_API_URL=https://your-backend.vercel.app/api
   ```

4. Deploy the project.

The frontend reads `NEXT_PUBLIC_API_URL` at build time, so redeploy the
frontend after changing the backend URL.

## 4. Finish CORS configuration

Copy the final frontend URL into the backend project's Production variable:

```text
FRONTEND_URL=https://your-frontend.vercel.app
```

Redeploy the backend after saving this variable. Then test login, customer
registration, invoice creation, payment recording, expense recording, and PDF
export from the deployed frontend.

## 5. Optional Vercel CLI flow

The dashboard is recommended because it makes environment variables easier to
review. If using the CLI, run it separately inside each root directory:

```bash
cd server
npx vercel link
npx vercel --prod

cd ../client
npx vercel link
npx vercel --prod
```

Add the same environment variables in the Vercel dashboard or with
`vercel env add` before the production deploy.

## Local verification

```bash
cd server
npm ci
npm run vercel-build

cd ../client
npm ci
npm run lint
npx tsc --noEmit
```

Never commit `.env`, `.env.local`, database URLs, or JWT secrets. Use
`server/.env.example` as the safe variable-name reference.
