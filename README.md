# LEGO Inventory Manager

A private web app for tracking a personal LEGO set collection — including purchase history, retirement status, resale value, and sold records.

Live at: **https://lego-inventory-psi.vercel.app**

---

## What it does

### Inventory tracking
- Add sets via **photo upload** (OCR detects set numbers from box photos), **manual set number entry**, or **CSV bulk import**
- Automatically fetches set metadata from [Rebrickable](https://rebrickable.com) — name, theme, piece count, retirement status, and cover image
- Track purchase details per copy: store, price paid, date, condition, and notes
- Support for owning multiple copies of the same set
- Duplicate guard — warns if you try to add a 4th+ unsold copy of the same set

### Sell tracking
- Mark individual copies as sold with sale price, date, and platform (eBay, Facebook Marketplace, etc.)
- Dashboard shows profit/loss across all sold sets

### Dashboard
- Inventory grouped by set with photos, themes, piece counts, and retired status
- Stats bar: active set count, total amount invested, overall P&L on sold sets
- Sold history with per-item profit/loss

### User management
- Admin and Member roles
- Admins can invite new users, change roles, and remove users
- All members share and can modify the full inventory

### Settings
- Configurable alert thresholds for price gain and demand drop (Phase 2)

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend & API | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| Database & Auth | Supabase (PostgreSQL + Row Level Security) |
| Set data | Rebrickable API |
| Photo OCR | Google Cloud Vision API |
| Resale prices | eBay Finding API *(Phase 2 — pending approval)* |
| Hosting | Vercel |

---

## Environment variables

Copy `.env.example` to `.env.local` and fill in your keys:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GOOGLE_CLOUD_VISION_API_KEY=
REBRICKABLE_API_KEY=
EBAY_APP_ID=
NEXT_PUBLIC_SITE_URL=
```

---

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm test   # run unit tests
```

---

## Database setup

Run the migration in your Supabase SQL Editor:

```
supabase/migrations/20260307000001_initial_schema.sql
```

This creates all tables (`sets`, `inventory_items`, `price_snapshots`, `alerts`, `user_settings`) and sets up Row Level Security policies.

---

## CSV import format

Only `set_number` is required. Leave optional columns blank but keep the headers.

```
set_number,purchased_from,purchase_price,purchase_date,condition,notes
75192,Target,849.99,2023-12-01,sealed,Gift
10294,,,,,
```

- `purchase_price` — number only, no `$`
- `purchase_date` — `YYYY-MM-DD`
- `condition` — `sealed`, `open`, or `complete`

---

## Roadmap

- **Phase 1** ✅ Core inventory (add, edit, sell, dashboard)
- **Phase 2** 🔜 Live eBay resale prices, price alerts, sell recommendations
