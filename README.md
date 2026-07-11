# MoneyMap App

Authenticated MoneyMap product: login wall, user pages, Postgres/Prisma, and Basiq ingest.

Public marketing lives in `moneymapV2`. This repo is the product.

## Setup

```bash
cp .env.example .env
# set DATABASE_URL, AUTH_SECRET, BASIQ_API_KEY
npm install
npx prisma migrate dev --name init
npm run dev
```

App runs at http://localhost:3001

## Routes

| Path | Access |
|------|--------|
| `/login`, `/signup` | Public |
| `/app` | Authenticated shell |
| `/api/auth/*` | Auth API |
| `/api/basiq/*` | Authenticated Basiq consent + callback |

## Database

Prisma schema includes `User`, `Session`, and Basiq landing tables (`basiq_accounts`, `basiq_transactions`) lifted from the cashcow prototype.
