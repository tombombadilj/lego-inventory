# Velocity Advisor + Smart Listing Assistant — Design Spec

## Goal

Upgrade the LEGO Inventory tool from a simple SELL/HOLD/WATCH advisor into a retirement-aware Velocity Advisor, and add a Gemini-powered Smart Listing Assistant that generates ready-to-post Facebook Marketplace copy per inventory item.

## Background

The tool already has:
- Retirement status (`Retired` / `Retiring Soon` / `Active`) derived from Brickset `exitDate`
- eBay active listing prices (`avg_price_usd`, `min_price_usd`, `max_price_usd`, `demand_score`, `listings_count`) via the Browse API
- Recommendation engine in `src/lib/recommendations.ts` with `SELL / HOLD / WATCH / NO_DATA` labels

This spec replaces the recommendation labels with retirement-aware ones and adds a per-item listing generator.

---

## Feature 1: New Recommendation Labels

### Label Definitions

| Condition | Label | Intent |
|---|---|---|
| Active + `demand_score ≥ demand_drop_pts` + price gain ≥ `sell_threshold_pct` | **SELL** | Strong active market — move now |
| Active + anything else | **HOLD** | No strong sell signal yet |
| Retiring Soon (effective retirement date within 6 months in the future) | **STRATEGIC HOLD** | Price about to spike — wait |
| Retired < 6 months ago + `demand_score < demand_drop_pts` | **STRATEGIC HOLD** | Just retired, demand not yet hot — wait for the spike |
| Retired < 6 months ago + `demand_score ≥ demand_drop_pts` | **VELOCITY SELL** | Recently retired and already in high demand — move now |
| Retired 6+ months + `demand_score ≥ demand_drop_pts` | **VELOCITY SELL** | Market is hot — move now for max return |
| Retired 6+ months + `demand_score < demand_drop_pts` | **LIQUIDATE** | Demand stagnated — recover capital before price softens further |
| No price snapshot or `avg_price_usd` is null | **NO_DATA** | Insufficient data |

`WATCH` label is removed. Active low-demand sets default to `HOLD`. `LIQUIDATE` applies only to retired sets (6+ months) with stagnated demand.

### Effective Retirement Date

The "< 6 months" and "6+ months" checks must use the **effective retirement date**, not the raw DB column directly:

```typescript
const effectiveRetirementDate = override_retirement_date ?? retirement_date
```

This ensures admin date overrides are respected in the recommendation logic.

### Priority Order

1. No data → `NO_DATA`
2. Retirement status checked first:
   - Retiring Soon (effective date in future, within 6 months) → `STRATEGIC HOLD`
   - Retired < 6 months ago + low demand → `STRATEGIC HOLD`
   - Retired < 6 months ago + high demand → `VELOCITY SELL`
   - Retired 6+ months + high demand → `VELOCITY SELL`
   - Retired 6+ months + low demand → `LIQUIDATE`
3. Active sets: demand + price gain → `SELL` or `HOLD`

### Implementation

**Modify `src/lib/recommendations.ts`:**
- Update `Recommendation` type: `'SELL' | 'HOLD' | 'STRATEGIC HOLD' | 'VELOCITY SELL' | 'LIQUIDATE' | 'NO_DATA'`
- Add `retirement_status: RetirementStatus`, `retirement_date: string | null`, and `override_retirement_date: string | null` to `InventoryContext`
- The existing `sell_threshold_pct` field name is kept as-is (no rename)
- Rewrite `getRecommendation()` to follow the priority table above
- All existing tests updated; new tests added for each new label

**Modify `src/app/(dashboard)/dashboard/page.tsx`:**
- Pass `retirement_status`, `retirement_date`, and `override_retirement_date` into `getRecommendation()` call in the `enrichedSets` mapping

**Modify `src/app/(dashboard)/sets/[id]/page.tsx`:**
- This client component also calls `getRecommendation()` directly — update its inline `InventoryContext` construction to pass `retirement_status`, `retirement_date`, and `override_retirement_date`
- Update `PILL_STYLES` object (currently `{ SELL, HOLD, WATCH, NO_DATA }`) to cover all new labels:
  - `'VELOCITY SELL'` → green (`bg-green-600 text-white border-green-500`)
  - `'STRATEGIC HOLD'` → purple (`bg-purple-900/50 text-purple-400 border-purple-700`)
  - `'LIQUIDATE'` → orange (`bg-orange-900/50 text-orange-400 border-orange-700`)
  - `'SELL'` → keep existing green
  - `'HOLD'` → keep existing yellow
  - `'NO_DATA'` → keep existing gray
  - Remove `WATCH` key

**Modify `src/components/SearchableInventory.tsx`:**
- Update badge styles for new labels with the same color mapping above

**Modify `src/types/inventory.ts`:**
- Update `GroupedSet.recommendation` type union from `'SELL' | 'HOLD' | 'WATCH' | 'NO_DATA'` to the new full union

---

## Feature 2: Recommended Price + Fee Disclaimer

Shown on the set detail page and inside the Listing Package card.

### Suggested Price

- **Primary:** `min_price_usd × 0.95` (5% below the cheapest current active listing — undercuts the market floor for a fast sale)
- **Fallback:** `avg_price_usd × 0.95` if `min_price_usd` is null
- **If no price data:** not shown

### Fee Disclaimer (static text)

> "Heads up: eBay charges ~13% in fees (approximate, verify current rates). FB Marketplace is free for local pickup, 5% for shipped orders. Make sure your asking price accounts for this."

Shown beneath the suggested price wherever it appears.

---

## Feature 3: Smart Listing Assistant

### Minifigure Data

**DB:** Add a `minifig_count` column to `sets` and a `minifig_names` column for the list:

```sql
ALTER TABLE sets ADD COLUMN IF NOT EXISTS minifig_count INTEGER;
ALTER TABLE sets ADD COLUMN IF NOT EXISTS minifig_names TEXT;
```

`minifig_names` is a comma-separated string of figure names (e.g., `"Bookshop Owner, Customer, Delivery Person"`). Kept simple — no separate table needed.

**Fetch:** Call Rebrickable's minifig endpoint when a set is added (in `src/app/api/lego-status/route.ts`, alongside the existing Rebrickable fetch):

```
GET https://rebrickable.com/api/v3/lego/sets/{set_num}/minifigs/
```

Returns a list of `{ set_name, quantity }` objects. Store:
- `minifig_count`: sum of all `quantity` values
- `minifig_names`: comma-joined `set_name` values (e.g., `"Velma Dinkley, Fred Jones, Scooby-Doo"`)

If the endpoint fails or returns empty, leave both columns null — non-blocking.

**Types:** Add `minifig_count: number | null` and `minifig_names: string | null` to `InventoryItem.sets` and `GroupedSet` in `src/types/inventory.ts`.

**UI:** Show minifig count on the set detail page (`src/app/(dashboard)/sets/[id]/page.tsx`) in the set header alongside piece count — e.g., `"2,504 pcs · 5 minifigs"`. Only shown when `minifig_count` is non-null and greater than zero. The individual names are not displayed in the UI (used only in the Gemini prompt).

---

### Database

Add two nullable columns to `inventory_items` (run in Supabase SQL Editor):

```sql
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS listing_title TEXT;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS listing_description TEXT;
```

These columns default to `NULL`. They are **not** added to the `EDITABLE_FIELDS` whitelist in `src/app/api/sets/[id]/route.ts` — listing data is managed exclusively via the dedicated listing routes below.

After running the migration, update `src/types/inventory.ts` to add `listing_title: string | null` and `listing_description: string | null` to the `InventoryItem` interface.

### API Routes

**`POST /api/inventory/[id]/listing`**
- Auth required — use the same implicit-ownership-via-query pattern as `src/app/api/sets/[id]/route.ts`: fetch the item with `.eq('id', id).eq('added_by', user.id)` — if no row matches, return 404 (no explicit 403 needed)
- Fetches item + set data (including `retirement_date`, `override_retirement_date`, `retirement_status`, `avg_price_usd`, `min_price_usd`, `piece_count`, `theme`, `condition`, `name`, `set_number`, `minifig_count`, `minifig_names`)
- Calls Gemini 1.5 Flash with the prompt below
- Parses JSON response, saves `listing_title` + `listing_description` to `inventory_items` via `UPDATE ... WHERE id = $1 AND added_by = $2`
- This route handles both **generate** and **regenerate** — it overwrites existing values (upsert behavior via a single POST)
- Returns `{ listing_title, listing_description }`

No separate DELETE route needed — regeneration is a single POST that overwrites.

**Environment variable:** `GEMINI_API_KEY` — throw `Error('GEMINI_API_KEY is not set')` at call time if missing (consistent with `brickset.ts` pattern)

### Gemini Integration

Use `@google/generative-ai` npm package. Enable JSON mode to avoid markdown-wrapped responses:

```typescript
const model = genAI.getGenerativeModel({
  model: 'gemini-1.5-flash',
  generationConfig: { responseMimeType: 'application/json' },
})
```

### Gemini Prompt

Build as a TypeScript template literal. The eBay price line is conditionally included:

```typescript
const includeEbayPrice = recommendation === 'LIQUIDATE' || recommendation === 'VELOCITY SELL'
const ebayPriceLine = includeEbayPrice && avgPrice
  ? `eBay resale avg: $${avgPrice}`
  : ''

const retirementLine = retirementStatus === 'Retired' && effectiveRetirementDate
  ? `Retirement status: Retired (since ${effectiveRetirementDate})`
  : `Retirement status: ${retirementStatus}`

const minifigLine = minifigNames
  ? `Minifigures (${minifigCount} total): ${minifigNames}`
  : minifigCount
    ? `Minifigures: ${minifigCount} included`
    : ''

const prompt = `
You're helping sell a LEGO set on Facebook Marketplace. Write friendly, attention-grabbing copy.

Set: ${name} (#${setNumber})
Theme: ${theme}
Pieces: ${pieceCount}
Condition: ${condition}
${retirementLine}
${minifigLine}
${ebayPriceLine}

Rules:
- Title: max 80 characters, format "LEGO {number} {name} - {CONDITION IN CAPS} - {1 compelling hook}"
- Description: 3-4 sentences, friendly tone
- If retired/rare: mention it's no longer in stores
- If eBay price is provided: note that our price is lower than eBay
- Always mention piece count
- If any minifigures are known to be particularly collectible, sought-after, or have recently spiked in popularity (e.g. exclusive figures, pop culture tie-ins), name them in the description — only if you are confident, do not speculate
- Do not invent facts
- Return valid JSON only: { "title": "...", "description": "..." }
`.trim()
```

### Error Handling

- Gemini API down / timeout: return 502, do not save partial data
- JSON parse failure (even with JSON mode): return 502 with message "Failed to parse listing from Gemini"
- No price data: omit eBay price line from prompt; omit suggested price from UI

### UI (set detail page: `src/app/(dashboard)/sets/[id]/page.tsx`)

Per inventory item, below the existing edit/sell/delete buttons, add a **Listing Package** card.

**State:** `listingStates: Record<string, { loading: boolean }>` — tracks per-item loading state.

**If `listing_title` is null (not yet generated):**
- "Generate Listing" button → calls `POST /api/inventory/[id]/listing`, sets loading state during request, calls `loadData()` on success

**If `listing_title` is set:**
- Title shown in a read-only text box with "Copy" button (uses `navigator.clipboard.writeText`)
- Description shown in a read-only text area with "Copy" button
- Suggested price: `$X.XX` (calculated client-side from `min_price_usd` or `avg_price_usd` from the price snapshot) with fee disclaimer beneath
- "Regenerate" link → calls same `POST /api/inventory/[id]/listing`, shows loading state, calls `loadData()` on success

The set detail page currently fetches set+items via `GET /api/sets?all=true`. The `listing_title` and `listing_description` fields will be returned in this response once added to `InventoryItem` — no new fetch needed.

---

## Data Flow

```
User clicks "Generate Listing"
  → POST /api/inventory/[id]/listing
  → Auth check (implicit: item must belong to user)
  → Fetch item + set data from Supabase
  → Build Gemini prompt (conditionally include eBay price)
  → Call Gemini 1.5 Flash with JSON mode
  → Parse { title, description }
  → UPDATE inventory_items SET listing_title, listing_description
  → Return to client → render Listing Package card

Dashboard renders
  → getRecommendation() receives retirement_status + retirement_date + override_retirement_date
  → Computes effective retirement date
  → Returns new label
  → Badge shown with updated color

Set detail page renders
  → Same getRecommendation() call updated with new InventoryContext fields
  → PILL_STYLES covers all new label keys
```

---

## Files Changed

| File | Change |
|---|---|
| `src/lib/recommendations.ts` | New label logic, updated `InventoryContext`, new tests |
| `src/types/inventory.ts` | Update `GroupedSet.recommendation` union; add `listing_title`/`listing_description` to `InventoryItem` |
| `src/app/(dashboard)/dashboard/page.tsx` | Pass new fields to `getRecommendation()` |
| `src/app/(dashboard)/sets/[id]/page.tsx` | Update `getRecommendation()` call + `PILL_STYLES`; add Listing Package UI |
| `src/components/SearchableInventory.tsx` | New badge colors for new labels |
| `src/app/api/inventory/[id]/listing/route.ts` | **Create** — Gemini integration |
| `src/lib/gemini.ts` | **Create** — Gemini client + `generateListing()` function |
| `src/lib/rebrickable.ts` | Add `fetchMinifigs(setNumber)` function |
| `src/app/api/lego-status/route.ts` | Call `fetchMinifigs()` after Rebrickable upsert, save `minifig_count` + `minifig_names` |

---

## Out of Scope

- Automatically generating listings on set add (user-triggered only)
- Multiple listing variants per item
- eBay listing copy (Facebook Marketplace only for now)
- Sold price data from eBay Marketplace Insights API
- Scheduled listing refresh
- Per-platform fee calculation (static disclaimer only)
