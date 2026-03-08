# LEGO Inventory Tool — Architecture Reference

_Last updated: 2026-03-07_

---

## System Overview

```
[ Phone / Browser ]
        |  HTTPS
        v
[ Next.js — Vercel ]
   ├── /app (React pages)
   │     ├── /login
   │     ├── /dashboard          (inventory overview)
   │     ├── /upload             (photo capture + OCR confirmation)
   │     ├── /sets/[id]          (set detail + price history)
   │     └── /alerts             (notification feed)
   │
   └── /app/api (API routes — server-side)
         ├── /api/ocr
         ├── /api/sets
         ├── /api/lego-status
         ├── /api/prices/fetch
         └── /api/alerts/run

[ Supabase QA ]                   [ Supabase Prod ]
  ├── PostgreSQL                    ├── PostgreSQL
  ├── Auth                          ├── Auth
  └── Storage (photos)              └── Storage (photos)

[ External Services ]
  ├── Google Cloud Vision API       (OCR)
  ├── Rebrickable API               (set metadata, retirement status)
  └── BrickLink                     (resale prices, demand data)
```

---

## Environments

| Environment | Supabase Project | Config File | Purpose |
|---|---|---|---|
| QA | Separate project | `.env.local` (QA values) | Development, testing, seeding |
| Production | Separate project | `.env.local` (prod values) | Live data |

Promotion from QA to prod = swap environment variables. No code changes.

---

## API Routes

| Route | Method | Purpose | Manually Testable |
|---|---|---|---|
| `/api/ocr` | POST | Upload photo, return detected set numbers | Yes — POST with any image |
| `/api/sets` | GET/POST/PUT/DELETE | Inventory CRUD | Yes |
| `/api/lego-status` | GET `?set_number=` | Fetch set metadata from Rebrickable | Yes |
| `/api/prices/fetch` | GET `?set_number=` | Fetch resale prices, write snapshot | Yes |
| `/api/alerts/run` | POST | Run alert logic, write new alerts | Yes |

---

## Data Flow

### Adding Sets via Photo
```
User uploads photo
  → /api/ocr → Google Cloud Vision → detected set numbers
  → User confirms selection in UI
  → /api/lego-status → Rebrickable → set metadata written to `sets`
  → inventory_item row created in `inventory_items`
  → photo stored in Supabase Storage
```

### Price Tracking
```
Scheduled job (or manual trigger) calls /api/prices/fetch
  → BrickLink / eBay queried per set
  → New row appended to `price_snapshots`
  → /api/alerts/run checks for spikes / retirement events
  → New rows written to `alerts` if thresholds crossed
  → Users see alerts in /alerts page
```

---

## Database Tables

| Table | Description |
|---|---|
| `users` | Managed by Supabase Auth; extended with `role` |
| `user_settings` | Per-user configurable alert thresholds (spike %, drop %, demand drop, retirement toggle) |
| `sets` | LEGO set reference data (shared, cached from Rebrickable) |
| `inventory_items` | Your physical boxes (one row per box, even duplicates); includes sold fields for sale tracking and profit/loss |
| `price_snapshots` | Historical resale market data (append-only) |
| `alerts` | Per-user notification events |

Full schema: see [design doc](./plans/2026-03-07-lego-inventory-design.md).

---

## Secret Management

All secrets in `.env.local` (gitignored). Required variables documented in `.env.example`:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GOOGLE_CLOUD_VISION_API_KEY=
REBRICKABLE_API_KEY=
BRICKLINK_API_KEY=
BRICKLINK_API_SECRET=
```

Never hardcode credentials. Never commit `.env.local`.

---

## Key Design Decisions

**Why Next.js + Supabase?**
Single codebase for frontend and backend API routes. Supabase provides PostgreSQL, auth with invite-based access control, and file storage in one platform. Clean QA/prod separation via separate Supabase projects.

**Why append-only price snapshots?**
Preserves full price history for trend analysis and charting. As a data analyst, you can query this table directly in Supabase's SQL editor for ad-hoc analysis.

**Why separate `sets` from `inventory_items`?**
`sets` is shared reference data (one row per LEGO set number). `inventory_items` represents physical boxes — you can own multiple copies of the same set, each with its own purchase record. Sold sets stay in `inventory_items` with `sold = true` and sale details filled in, enabling full profit/loss history without a separate table.

**Why manual trigger endpoints for scheduled jobs?**
Every component must be testable in QA without waiting for a cron schedule. `/api/prices/fetch` and `/api/alerts/run` can be called on demand.
