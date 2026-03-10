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
| Resale Prices | eBay Browse API (completed/sold listings) |
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
Managed by Supabase Auth. Extended with a `role` field (`admin` / `member`). New users are invited by an admin via email and default to `member` on first login. All authenticated users can view and manage all inventory — roles only gate user management features.

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

### Phase 1 — Core Inventory (build now)
Tasks 1–7 plus user management. Fully usable without price data. Any UI element that would show price data displays a clean "coming soon" placeholder instead of breaking.

### Phase 2 — Prices & Alerts (when eBay API is approved)
Tasks 8–9. Adds resale price tracking, demand scores, price history charts, sell recommendations, and configurable alerts.

### 1. Auth & User Management
Supabase Auth with invite-based access. All routes require login — unauthenticated visitors are immediately redirected to `/login`, and all API routes return `401` without a valid session.

**Roles:**
- `admin` — full access to everything including `/admin/users` (invite users, change roles, remove users)
- `member` — full access to all inventory data (view, add, edit, delete any set); cannot manage users

**Shared inventory:** All authenticated users see the same inventory. The `added_by` field records who entered each item for reference, but there is no per-user data isolation.

**User management flow:** Admin visits `/admin/users` → enters an email → Supabase sends an invite email → user sets password and lands on dashboard as `member` → admin can promote to `admin` or remove from the same page.

Fully testable before any inventory features exist.

### 2. Photo Upload & OCR
Mobile-friendly upload page with three entry methods:
- **Photo upload** — image sent to Google Cloud Vision API, detected set numbers presented for confirmation
- **Manual entry** — text input to type a set number directly (skips OCR entirely)
- **CSV upload** — user uploads a CSV file with columns `set_number, purchased_from, purchase_price, purchase_date, condition, notes`; app shows a preview/review table before bulk-saving

All three flows converge at the same confirmation step before any data is written. Testable independently: OCR via `/api/ocr`, CSV parsing via `/api/inventory/import`.

### 3. Set Data Fetcher
`/api/lego-status?set_number=75192` — fetches metadata from Rebrickable, writes to `sets` table. Testable in isolation via direct API call.

### 3b. CSV Import API
`/api/inventory/import` — accepts a CSV file, parses and validates each row, returns a preview payload. On confirmation, bulk-inserts into `inventory_items` (running the duplicate guard per set). Testable by POSTing a CSV file directly.

**Expected CSV format:**

The first row must be a header row with these exact column names (case-insensitive):

```
set_number,purchased_from,purchase_price,purchase_date,condition,notes
```

| Column | Required? | Format | Example |
|---|---|---|---|
| `set_number` | Required | 4–6 digit LEGO set number | `75192` |
| `purchased_from` | Optional | Any text | `Target` |
| `purchase_price` | Optional | Number, no currency symbol | `849.99` |
| `purchase_date` | Optional | YYYY-MM-DD | `2023-12-01` |
| `condition` | Optional | `sealed`, `open`, or `complete` (defaults to `sealed`) | `sealed` |
| `notes` | Optional | Any text | `Christmas gift` |

**Rules:**
- Leave optional columns blank — do not remove the column itself
- `set_number` is the only column that will cause a row to be rejected if missing or blank
- `purchase_price` must be a plain number (no `$`, no commas) — invalid values will reject the row
- `purchase_date` must be in `YYYY-MM-DD` format — invalid dates will be ignored and saved as blank
- `condition` values other than `sealed`, `open`, or `complete` default to `sealed` silently

**Minimal valid CSV (set number only):**
```
set_number
75192
10294
21325
```

**Full example:**
```
set_number,purchased_from,purchase_price,purchase_date,condition,notes
75192,Target,849.99,2023-12-01,sealed,Christmas gift
10294,Amazon,679.99,,sealed,
21325,LEGO Store,179.99,2022-06-15,sealed,Bought before retirement
42154,,,,,Still looking for receipt
```

The app will display a preview table showing valid rows and any errors before anything is saved. A downloadable CSV template will be provided on the upload page.

### 4. Inventory Management
Full CRUD for `inventory_items`. Dashboard has two views: **Active Inventory** (unsold sets, grouped by set number with total invested and combined resale potential) and **Sold History** (sold sets with profit/loss per item and overall return). Marking a set as sold captures sale price, date, and platform. Depends on components 2 & 3.

**Editing data:**
- All manually entered fields on `inventory_items` (store, price, date, condition, notes, sold info, photo) are editable via an edit form on the set detail page
- `sets` data is sourced from Rebrickable but can be corrected via manual override fields (retail price, retirement status, retirement date); overrides take precedence over API values when displaying data
- Alert thresholds are editable per user on a dedicated `/settings` page

**Duplicate quantity guard:** When adding a new inventory item, the API checks how many unsold copies of that set already exist. If the new addition would bring the count to 4 or more, the UI shows a confirmation prompt: _"You already own N copies of [Set Name]. Are you sure you want to add another?"_ The user must explicitly confirm before the item is saved. This catches accidental re-scans and data entry errors.

---

> **Phase 2 — requires eBay API approval before starting**

### 5. Price & Demand Fetcher
`/api/prices/fetch?set_number=75192` — fetches resale data from BrickLink/eBay, appends to `price_snapshots`. Manually triggerable in QA. QA database seeded with fake historical snapshots covering multiple months for trend testing.

### 6. Alerts & Recommendations (Phase 2)
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

## UX & Visual Design

### Navigation
- **Mobile:** bottom tab bar with four items — Dashboard, Add Sets, Alerts, Settings
- **Desktop:** left sidebar with the same items plus Admin (visible to admins only)

### Color Scheme — Dark mode, LEGO-branded
| Token | Value | Usage |
|---|---|---|
| Background | `#1A1A1A` | Page background |
| Card | `#2A2A2A` | Set cards, panels |
| Primary | `#DA291C` | Buttons, active states (LEGO red) |
| Accent | `#F5C400` | Highlights, badges (LEGO yellow) |
| Text | `#FFFFFF` / `#A0A0A0` | Primary / secondary text |

### Key Screens

**Dashboard** — sets grouped by set number (not by physical copy). Each card shows set name, number, theme, total copies owned, amount paid across all copies, current resale avg, and a trend indicator. Two tabs: Active Inventory / Sold History.

**Set Detail** — box photo, set metadata, list of individual copies with edit/sell actions per copy, resale price line chart (last 90 days), and any active alerts for that set.

**Add Sets** — three-tab page: Photo (OCR), Manual Entry (type set number), CSV Upload (bulk import with preview table and downloadable template).

**Alerts** — chronological feed of alert events (price spike, price drop, demand drop, retirement) with set name, alert type, message, and date.

**Settings** — four configurable alert thresholds (price spike %, price drop %, demand drop points, retirement toggle).

**Admin → Users** — table of all users with role, invite date, and a role dropdown. Invite form at the top. Admin-only, redirects members to dashboard.

### Route Protection
Every route except `/login` requires an authenticated session. Unauthenticated requests are redirected to `/login`. All API routes return `401` without a valid session. `/admin/users` additionally requires `admin` role.

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
