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
| Active + `demand_score ≥ demand_drop_pts` + price gain ≥ `price_spike_pct` | **SELL** | Strong active market — move now |
| Active + anything else | **HOLD** | No strong sell signal yet |
| Retiring Soon (retirement_date within 6 months) | **STRATEGIC HOLD** | Price about to spike — wait |
| Retired < 6 months ago | **STRATEGIC HOLD** | Price still climbing post-retirement |
| Retired 6+ months + `demand_score ≥ demand_drop_pts` | **VELOCITY SELL** | Market is hot — move now for max return |
| Retired 6+ months + `demand_score < demand_drop_pts` | **LIQUIDATE** | Demand stagnated — recover capital before price softens further |
| No price snapshot or `avg_price_usd` is null | **NO_DATA** | Insufficient data |

`WATCH` label is removed. `LIQUIDATE` covers the low-demand-active-set case via `HOLD` defaulting for active sets, and the stagnated-retired-set case explicitly.

### Priority Order

1. No data → `NO_DATA`
2. Retirement status checked first:
   - Retiring Soon → `STRATEGIC HOLD`
   - Retired < 6 months → `STRATEGIC HOLD`
   - Retired 6+ months + high demand → `VELOCITY SELL`
   - Retired 6+ months + low demand → `LIQUIDATE`
3. Active sets: demand + price gain → `SELL` or `HOLD`

### Implementation

**Modify `src/lib/recommendations.ts`:**
- Update `Recommendation` type: `'SELL' | 'HOLD' | 'STRATEGIC HOLD' | 'VELOCITY SELL' | 'LIQUIDATE' | 'NO_DATA'`
- Add `retirement_status: RetirementStatus` and `retirement_date: string | null` to `InventoryContext`
- Rewrite `getRecommendation()` to follow the priority table above
- "Retired < 6 months" = `retirement_date` is within the last 180 days of today
- All existing tests updated; new tests added for each new label

**Modify `src/app/(dashboard)/dashboard/page.tsx`:**
- Pass `retirement_status` and `retirement_date` into `getRecommendation()` call

**Modify `src/components/SearchableInventory.tsx`:**
- Update badge styles for new labels:
  - `VELOCITY SELL` → green (`bg-green-600`)
  - `STRATEGIC HOLD` → purple (`bg-purple-600`)
  - `LIQUIDATE` → orange (`bg-orange-600`)
  - `SELL` → green (existing)
  - `HOLD` → yellow (existing)
  - `NO_DATA` → gray (existing)

---

## Feature 2: Recommended Price + Fee Disclaimer

Shown on the set detail page and inside the Listing Package card.

### Suggested Price

- **Primary:** `min_price_usd × 0.95` (5% below floor = undercut for fast sale)
- **Fallback:** `avg_price_usd × 0.95` if `min_price_usd` is null
- **If no price data:** not shown

### Fee Disclaimer (static text)

> "Heads up: eBay charges ~13% in fees. FB Marketplace is free for local pickup, 5% for shipped orders. Make sure your asking price accounts for this."

Shown beneath the suggested price wherever it appears.

---

## Feature 3: Smart Listing Assistant

### Database

Add two columns to `inventory_items`:

```sql
ALTER TABLE inventory_items ADD COLUMN listing_title TEXT;
ALTER TABLE inventory_items ADD COLUMN listing_description TEXT;
```

Generated once and persisted. Re-generation clears and rewrites both fields.

### API Routes

**`POST /api/inventory/[id]/listing`**
- Auth required (item owner only)
- Fetches item + set data from DB
- Calls Gemini 1.5 Flash with the prompt below
- Parses JSON response, saves `listing_title` + `listing_description` to `inventory_items`
- Returns `{ listing_title, listing_description }`

**`DELETE /api/inventory/[id]/listing`**
- Auth required (item owner only)
- Sets both fields to `NULL` (allows regeneration)
- Returns `{ ok: true }`

### Gemini Prompt

```
You're helping sell a LEGO set on Facebook Marketplace. Write friendly, attention-grabbing copy.

Set: {name} (#{set_number})
Theme: {theme}
Pieces: {piece_count}
Condition: {condition}
Retirement status: {retirement_status}{", retired {retirement_date}" if retired}
{if LIQUIDATE or VELOCITY SELL: "eBay resale avg: ${avg_price_usd}"}

Rules:
- Title: max 80 characters, format "LEGO {number} {name} - {CONDITION CAPS} - {1 compelling hook}"
- Description: 3-4 sentences, friendly tone
- Mention it's retired/rare/no longer in stores if applicable
- If eBay price is provided, note that our price is lower than eBay
- Always mention piece count
- Do not invent facts or minifigures not mentioned above
- Return valid JSON only: { "title": "...", "description": "..." }
```

**Environment variable:** `GEMINI_API_KEY` (already added to `.env.local` and Vercel)

**Model:** `gemini-1.5-flash` (free tier: 15 RPM, 1M tokens/day)

### UI (set detail page: `src/app/(dashboard)/sets/[id]/page.tsx`)

Per inventory item, below the existing edit/sell buttons, add a **Listing Package** card:

**If not yet generated:**
- "Generate Listing" button → calls `POST /api/inventory/[id]/listing`
- Shows loading state while generating

**If generated:**
- Title shown with "Copy" button
- Description shown with "Copy" button
- Suggested price: `$X.XX` with fee disclaimer note beneath
- Small "Regenerate" link (calls DELETE then POST)

### Error Handling

- Gemini API down / timeout: show error toast, do not save partial data
- JSON parse failure: retry once, then show error
- No price data: omit eBay price line from prompt, omit suggested price from UI

---

## Data Flow

```
User clicks "Generate Listing"
  → POST /api/inventory/[id]/listing
  → Fetch item + set data from Supabase
  → Build Gemini prompt (with or without eBay price based on recommendation label)
  → Call Gemini 1.5 Flash
  → Parse { title, description } from JSON response
  → UPDATE inventory_items SET listing_title, listing_description
  → Return to client → render Listing Package card

Dashboard renders
  → getRecommendation() receives retirement_status + retirement_date
  → Returns new label (VELOCITY SELL / STRATEGIC HOLD / LIQUIDATE / SELL / HOLD / NO_DATA)
  → Badge shown with updated color
```

---

## Out of Scope

- Automatically generating listings on set add (user-triggered only)
- Multiple listing variants per item
- eBay listing copy (Facebook Marketplace only for now)
- Sold price data from eBay Marketplace Insights API
- Scheduled listing refresh
