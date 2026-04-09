# Retirement Integration Design

## Goal

Surface accurate LEGO set retirement status (Retired / Retiring Soon / Active) in the inventory dashboard by integrating the Brickset API as a supplementary data source, and give admins manual override controls for edge cases.

## Background

The `sets` table already has `retired`, `retirement_date`, and `override_retired` columns, but `retirement_date` is never populated — Rebrickable's API only returns `is_retired` as a boolean, not a date. Brickset's API returns an `exitDate` field (confirmed via test call) which maps directly to retirement date. The fix requires adding Brickset as a supplementary fetch alongside Rebrickable.

## Architecture

Two data sources, each with a clear responsibility:
- **Rebrickable** — primary source for set metadata (name, theme, piece count, image)
- **Brickset** — supplementary source for `exitDate` (retirement date) only

Both are called when a set is first added. The Brickset call is non-blocking — if it fails or returns no `exitDate`, the set is stored with `retirement_date = null` and updated later via admin refresh.

## Components

### 1. `src/lib/brickset.ts` (new)

Single exported function: `fetchRetirementDate(setNumber: string): Promise<Date | null>`

- Tries `setNumber-1` first, then bare `setNumber` (mirrors Rebrickable's fallback pattern)
- Calls `https://brickset.com/api/v3.asmx/getSets?apiKey=...&userHash=&params={"setNumber":"XXXXX-1"}`
- Extracts `sets[0].exitDate`
- Returns parsed `Date` or `null` if not found / API error / empty response
- Uses `BRICKSET_API_KEY` env var
- 8-second timeout (same pattern as Rebrickable)

### 2. `src/app/api/lego-status/route.ts` (update)

After the existing Rebrickable upsert, call `fetchRetirementDate()` and issue a second targeted `UPDATE sets SET retirement_date = $1 WHERE set_number = $2` — do not re-run the full upsert to avoid overwriting Rebrickable fields. If Brickset returns null, skip the update and leave `retirement_date` unchanged. The `retired` flag is set by Rebrickable's `is_retired` in this path. No change to the 24-hour cache logic.

### 3. `src/app/api/admin/sets/refresh/route.ts` (update)

- Skip sets where `retired = true` OR `override_retired = true` (permanent — no need to re-fetch)
- For all other sets: call `fetchRetirementDate()` and update `retirement_date` and `retired` (derived from whether `exitDate` is in the past)
- Return counts: `{ total, skipped_retired, refreshed, failed }`

### 4. Database migration

Add one column to `sets`:
```sql
ALTER TABLE sets ADD COLUMN retiring_soon_override BOOLEAN DEFAULT false;
```

No other schema changes needed — `retirement_date` and `override_retired` and `override_retirement_date` already exist.

The `retiring_soon_override` field must also be added to the `SetRow` and `GroupedSet` TypeScript types in `src/types/inventory.ts`.

### 5. `src/lib/recommendations.ts` (update)

Add pure function `getRetirementStatus(set: SetRow): "Retired" | "Retiring Soon" | "Active"`:

```
Retired:        (retirement_date <= today) OR (override_retired = true)
Retiring Soon:  (retirement_date > today AND retirement_date <= today + 6 months) OR (retiring_soon_override = true)
Active:         everything else
```

Override fields take precedence over computed values.

### 6. Dashboard UI (update)

In `src/components/SearchableInventory.tsx`, add the retirement badge to the existing tag row (inline with SELL/HOLD recommendation and price).

- `Retired` → red badge (`bg-red-600`)
- `Retiring Soon` → amber badge (`bg-amber-600`)
- `Active` → no badge shown

### 7. Admin override UI (update)

On `src/app/(dashboard)/sets/[id]/page.tsx`, add an admin-only section:
- Toggle for `retiring_soon_override` (checkbox: "Mark as Retiring Soon")
- Date picker for `override_retirement_date`
- Toggle for `override_retired` (already exists conceptually, wire it up)

Calls a new `PATCH /api/sets/[id]` field: `retiring_soon_override`.

## Data Flow

```
User adds set
  → Rebrickable fetch (name, theme, pieces, image, is_retired)
  → Brickset fetch (exitDate → retirement_date)
  → Upsert to sets table

Admin runs refresh
  → For each non-retired set: Brickset fetch → update retirement_date + retired flag
  → Skip already-retired sets

Dashboard renders
  → getRetirementStatus(set) → "Retired" | "Retiring Soon" | "Active"
  → Badge shown inline with recommendation tag
```

## Retirement Status Logic Detail

| Condition | Status |
|---|---|
| `override_retired = true` | Retired (manual) |
| `retirement_date` exists and is in the past | Retired (auto) |
| `retiring_soon_override = true` | Retiring Soon (manual) |
| `retirement_date` exists, future, within 6 months | Retiring Soon (auto) |
| None of the above | Active |

Manual overrides always win. Auto-computed from `retirement_date` when available.

## Error Handling

- **Brickset API down / timeout**: log warning, continue without `retirement_date`. Set is still added successfully via Rebrickable.
- **No `exitDate` returned**: leave `retirement_date = null`. Admin refresh will retry next time.
- **Admin refresh partial failure**: return which set numbers failed so admin can investigate.

## Environment Variables

- `BRICKSET_API_KEY` — already added to `.env.local`, needs to be added to Vercel env vars after implementation.

## Out of Scope

- Scheduled/automatic refresh (user chose manual admin trigger)
- "Retiring Soon" window is fixed at 6 months (not configurable)
- Email notifications for retirement status changes
- Brickset as replacement for Rebrickable (supplementary only)
