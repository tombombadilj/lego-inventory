# LEGO Inventory Tool — Design Document

**Date:** 2026-03-07  
**Status:** Approved  

---

## Overview

A mobile-friendly web application to inventory sealed LEGO sets stored in a personal storage space. The tool supports photo-based set detection, market price tracking, retirement monitoring, sell recommendations, and user alerts — backed by a PostgreSQL database with separate QA and production environments.

---

## Goals

- Photograph one or more LEGO set boxes and automatically detect set numbers via OCR
- Store personal inventory with purchase details (store, price, date, condition)
- Fetch and cache official LEGO set metadata (name, theme, piece count, retail price, retirement status)
- Track resale market prices and demand over time
- Surface sell recommendations and trigger alerts on value spikes or retirement events
- Support a small group of approved users, each with their own alert feed
- Maintain strict QA / production environment separation throughout

---

## Non-Goals

- Building a native iOS/Android app (a responsive web app covers mobile needs)
- Public marketplace or multi-tenant SaaS
- Real-time price streaming (periodic snapshot fetching is sufficient)

---

## Architecture

### Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js (React) — responsive, mobile-first |
| Backend | Next.js API Routes (same codebase) |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (invite-based, admin-approved users) |
| File Storage | Supabase Storage (uploaded box photos) |
| OCR | Google Cloud Vision API |
| Set Metadata | Rebrickable API |
| Resale Prices | BrickLink (API or scraping) + eBay |
| Hosting | Vercel |
| Secrets | `.env.local` files (never committed); `.env.example` for documentation |

### Environment Separation

QA and production are two completely separate Supabase projects. Switching between them requires only swapping environment variables — no code changes. Each environment has its own database, storage bucket, and auth configuration.

```
[ Phone / Browser ]
        |
        v
[ Next.js on Vercel ]
   ├── React pages (upload, dashboard, set detail, alerts)
   └── API Routes
         ├── /api/ocr              → Google Cloud Vision
         ├── /api/sets             → Supabase DB (CRUD)
         ├── /api/prices/fetch     → BrickLink / eBay
         ├── /api/lego-status      → Rebrickable API
         └── /api/alerts/run       → Alert logic (manual trigger + scheduled)

[ Supabase — QA ]          [ Supabase — Prod ]
  PostgreSQL DB               PostgreSQL DB
  Auth                        Auth
  Storage (photos)            Storage (photos)
```

---

## Database Schema

### `users`
Managed by Supabase Auth. Extended with a `role` field (`admin` / `viewer`). New users require admin approval before accessing the app.

### `sets`
Shared LEGO set reference data, fetched from Rebrickable and cached. One row per LEGO set number, regardless of how many copies you own.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| set_number | text | e.g. "75192" |
| name | text | e.g. "Millennium Falcon" |
| theme | text | e.g. "Star Wars" |
| piece_count | integer | |
| retail_price_usd | numeric | Original MSRP |
| retired | boolean | |
| retirement_date | date | Nullable |
| image_url | text | Official LEGO box image |
| last_fetched_at | timestamptz | For cache invalidation |
| override_retail_price_usd | numeric | Nullable; manually set, takes precedence over API value |
| override_retired | boolean | Nullable; manually set, takes precedence over API value |
| override_retirement_date | date | Nullable; manually set, takes precedence over API value |

### `inventory_items`
Each physical box you own. Multiple rows for duplicate sets.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| set_id | uuid | FK → sets |
| purchased_from | text | Store name (manual) |
| purchase_price_usd | numeric | What you paid (manual) |
| purchase_date | date | Nullable |
| condition | text | "sealed" / "open" / "complete" |
| notes | text | Free text |
| photo_url | text | Supabase Storage path |
| added_by | uuid | FK → users |
| sold | boolean | Default false |
| sold_date | date | Nullable |
| sold_price_usd | numeric | Nullable; actual sale price |
| sold_via | text | "eBay", "BrickLink", "Facebook Marketplace", etc. |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `price_snapshots`
Historical resale market data. Appended periodically, never overwritten, enabling trend analysis.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| set_id | uuid | FK → sets |
| source | text | "bricklink", "ebay" |
| avg_price_usd | numeric | |
| min_price_usd | numeric | |
| max_price_usd | numeric | |
| demand_score | integer | 0–100, normalized from sales volume |
| listings_count | integer | |
| fetched_at | timestamptz | |

### `user_settings`
Per-user configurable alert thresholds. A row is created with defaults when a user is first approved.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| user_id | uuid | FK → users (unique) |
| price_spike_pct | integer | Alert when price rises by this % (default: 10) |
| price_drop_pct | integer | Alert when price drops by this % (default: 10) |
| demand_drop_pts | integer | Alert when demand score drops by this many points (default: 20) |
| retirement_alerts | boolean | Alert when a set retires (default: true) |
| updated_at | timestamptz | |

### `alerts`
Per-user notification events.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| set_id | uuid | FK → sets |
| user_id | uuid | FK → users |
| type | text | "retirement", "price_spike", "price_drop" |
| message | text | Human-readable description |
| seen | boolean | Default false |
| created_at | timestamptz | |

---

## Components & Build Order

Each component is independently testable before the next is started.

### 1. Auth & User Management
Supabase Auth with invite-based access. Admin users approve new members. Fully testable before any inventory features exist.

### 2. Photo Upload & OCR
Mobile-friendly upload page. Image sent to Google Cloud Vision API. Detected set numbers presented for user confirmation before any data is saved. Testable with dummy images using a standalone `/api/ocr` endpoint.

### 3. Set Data Fetcher
`/api/lego-status?set_number=75192` — fetches metadata from Rebrickable, writes to `sets` table. Testable in isolation via direct API call.

### 4. Inventory Management
Full CRUD for `inventory_items`. Dashboard has two views: **Active Inventory** (unsold sets, grouped by set number with total invested and combined resale potential) and **Sold History** (sold sets with profit/loss per item and overall return). Marking a set as sold captures sale price, date, and platform. Depends on components 2 & 3.

**Editing data:**
- All manually entered fields on `inventory_items` (store, price, date, condition, notes, sold info, photo) are editable via an edit form on the set detail page
- `sets` data is sourced from Rebrickable but can be corrected via manual override fields (retail price, retirement status, retirement date); overrides take precedence over API values when displaying data
- Alert thresholds are editable per user on a dedicated `/settings` page

**Duplicate quantity guard:** When adding a new inventory item, the API checks how many unsold copies of that set already exist. If the new addition would bring the count to 4 or more, the UI shows a confirmation prompt: _"You already own N copies of [Set Name]. Are you sure you want to add another?"_ The user must explicitly confirm before the item is saved. This catches accidental re-scans and data entry errors.

### 5. Price & Demand Fetcher
`/api/prices/fetch?set_number=75192` — fetches resale data from BrickLink/eBay, appends to `price_snapshots`. Manually triggerable in QA. QA database seeded with fake historical snapshots covering multiple months for trend testing.

### 6. Alerts & Recommendations
`/api/alerts/run` — manually triggerable logic that scans `price_snapshots` and `sets` for alert conditions, writes to `alerts`. QA seed data includes pre-built scenarios for each alert type (price spike, retirement, demand drop). Surfaces recommendations in the dashboard UI.

### 7. QA → Prod Promotion
After each component is verified in QA, environment variables are pointed at the prod Supabase project. No code changes required.

---

## Secret Management

All secrets stored in `.env.local` (gitignored). A committed `.env.example` documents required variables with placeholder values:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GOOGLE_CLOUD_VISION_API_KEY=
REBRICKABLE_API_KEY=
BRICKLINK_API_KEY=
BRICKLINK_API_SECRET=
```

QA and prod each have their own `.env.local` pointing to separate Supabase projects.

---

## Security

**SQL Injection**
SQL injection risk is minimal by design:
- User login is handled entirely by Supabase Auth — no custom SQL queries touch credentials
- All application database queries use the Supabase JS client, which issues parameterized queries internally (never raw string concatenation)
- Any hand-written SQL (seed scripts, migrations) must use `$1, $2` placeholder syntax — never interpolated user input

**Row Level Security (RLS)**
Supabase RLS policies are enabled on all tables. Each policy enforces at the database level that users can only read and write their own data. This is a last line of defense independent of application logic.

**Auth & Access Control**
- New users require admin approval before accessing any data (invite-based flow)
- JWTs issued by Supabase Auth are verified on every API route server-side
- No credentials, API keys, or database URLs are ever committed to git

---

## Testing Strategy

- Every API route is directly callable (Postman or browser) without going through the UI
- QA Supabase project is a disposable sandbox — can be wiped and re-seeded at any time
- A seed script (`scripts/seed-qa.ts`) populates the QA database with representative data for each component
- Manual trigger endpoints (`/api/prices/fetch`, `/api/alerts/run`) allow scheduled jobs to be tested on demand
