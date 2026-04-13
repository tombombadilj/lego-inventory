# Gemini AI Investment Recommendations — Design Spec

## Goal

Replace the rules-based recommendation engine (`getRecommendation()`) with a Gemini-powered investment analysis stored per set. The AI produces a structured verdict (SELL / HOLD / HOLD LONG / HOLD SHORT) plus a full markdown analysis. Results are cached in the database and only refreshed on explicit user request.

---

## Background

The current system computes `SELL / HOLD / STRATEGIC HOLD / VELOCITY SELL / LIQUIDATE` labels from a simple rules tree (demand score thresholds, retirement date windows, price gain %). The user wants richer, research-informed verdicts from Gemini instead. The new labels (`SELL / HOLD / HOLD LONG / HOLD SHORT`) better capture the nuance Gemini provides.

**Important note on Gemini's data freshness:** The `@google/generative-ai` SDK without web-search tools cannot browse live market data. Gemini's analysis draws on training knowledge (LEGO secondary market trends, set-specific history) plus the current eBay avg price we supply in the prompt. For the Numbers table in the response, values are Gemini's educated estimates, not live lookups — treat them as directional, not precise.

---

## New Label Set

| Label | Meaning |
|---|---|
| `SELL` | Sell now |
| `HOLD` | Hold — no strong signal either way |
| `HOLD LONG` | Hold for long-term appreciation (years) |
| `HOLD SHORT` | Hold short-term — price spike expected soon |
| `NO_DATA` | Gemini analysis not yet generated |

**Replaces:** `SELL / HOLD / STRATEGIC HOLD / VELOCITY SELL / LIQUIDATE / NO_DATA`

---

## Database

Add three columns to the `sets` table:

```sql
ALTER TABLE sets ADD COLUMN IF NOT EXISTS ai_recommendation TEXT;
ALTER TABLE sets ADD COLUMN IF NOT EXISTS ai_analysis TEXT;
ALTER TABLE sets ADD COLUMN IF NOT EXISTS ai_analyzed_at TIMESTAMPTZ;
```

`ai_recommendation` stores the verdict string (`SELL`, `HOLD`, `HOLD LONG`, `HOLD SHORT`). `ai_analysis` stores the full markdown response from Gemini. `ai_analyzed_at` records when the analysis was last generated.

### Running the Migration

**In the plan, include these steps:**

1. Check for Supabase CLI: `supabase --version`
2. If the CLI is installed and the project is linked (`supabase status`): write the SQL to `supabase/migrations/<timestamp>_add_ai_columns.sql` and run `supabase db push`
3. If the CLI is not installed or the project is not linked: extract the Postgres connection string from `.env.local` — look for `DATABASE_URL`, or construct it from `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — then run `psql "$DATABASE_URL" -f migrations/add_ai_recommendation_columns.sql`
4. Last resort: copy the SQL from `migrations/add_ai_recommendation_columns.sql` into the Supabase dashboard → SQL Editor and run it manually

---

## Gemini Prompt

Called with JSON mode (`responseMimeType: 'application/json'`). Model: `gemini-2.5-flash`.

```typescript
const conditionLabel =
  condition === 'sealed' ? 'New In Sealed Box (NISB)' :
  condition === 'open'   ? 'Opened / Assembled' :
                           'Complete (Built)'

const retirementLine =
  retirementStatus === 'Retired'      ? `Retirement status: Retired (since ${effectiveRetirementDate ?? 'unknown'})` :
  retirementStatus === 'Retiring Soon' ? `Retirement status: Retiring Soon` :
                                          `Retirement status: Active (still in production)`

const priceLine = avgPriceUsd
  ? `Current eBay avg asking price (sealed): $${avgPriceUsd}`
  : ''

const prompt = `
Role: Act as a LEGO investment analyst and secondary market expert.

Task: Research and assess whether I should HOLD or SELL the following LEGO set:

Set Number: ${setNumber}
Set Name: ${name}
Theme: ${theme ?? 'Unknown'}
My Cost: $${avgCost ?? 'Unknown'}
Condition: ${conditionLabel}
${retirementLine}
${priceLine}

Please research current sold prices on BrickLink, eBay, and BrickEconomy, then respond in exactly this JSON format:

{
  "verdict": "SELL | HOLD | HOLD LONG | HOLD SHORT",
  "analysis": "---\\n## VERDICT: [verdict]\\n\\n**Recommended Action:** ...\\n**If selling, target price:** $X – $Y on [platform]\\n\\n---\\n## Why\\n\\n[2–3 paragraphs]\\n\\n---\\n## The Numbers\\n\\n| Metric | Value |\\n|---|---|\\n| My cost | $X |\\n| Current NISB market value | $X–$Y |\\n| Profit if I sell today | $X (~X% ROI) |\\n| Projected value in 1 year | $X |\\n| Projected value in 3 years | $X |\\n| Annualized growth rate (estimated) | X% |\\n\\n---\\n## Risk Level: [LOW / MEDIUM / HIGH]\\n[One sentence on biggest risk.]"
}
`.trim()
```

**Inputs derived per set:**
- `avgCost`: average `purchase_price_usd` across the user's unsold copies of this set (null if all copies have no cost recorded)
- `condition`: best condition across copies — priority: `sealed > open > complete`
- `retirementStatus` / `effectiveRetirementDate`: from `getRetirementStatus()` using existing logic
- `avgPriceUsd`: latest `avg_price_usd` from `price_snapshots` for this set (null if no snapshot exists)

---

## API Routes

### `POST /api/sets/[set_number]/ai-recommendation`

User-scoped. Generates or regenerates the AI analysis for one set.

**Auth:** Standard auth client — return 401 if not authenticated.

**Logic:**
1. Fetch the user's unsold copies of this set via `inventory_items` where `added_by = user.id` and `sets.set_number = set_number` — derive `avgCost` and best `condition`
2. Fetch set metadata (`name`, `theme`, `retirement_date`, `override_retirement_date`, `override_retired`, `retiring_soon_override`) via service role
3. Fetch latest price snapshot via service role (most recent `price_snapshots` row for this set's `set_id`)
4. Build prompt and call Gemini 2.5 Flash with JSON mode
5. Parse `{ verdict, analysis }` from response
6. Validate verdict is one of `SELL | HOLD | HOLD LONG | HOLD SHORT` — if not, return 502
7. Save `ai_recommendation`, `ai_analysis`, `ai_analyzed_at = now()` to `sets` table via service role
8. Return `{ ai_recommendation, ai_analysis, ai_analyzed_at }`

**Error handling:**
- Gemini down / timeout → 502, do not save partial data
- JSON parse failure → 502 with "Failed to parse AI analysis from Gemini"
- Set not in user's inventory → 404

### `POST /api/admin/recommendations/refresh`

Admin-only. Backfills AI analysis for all sets where `ai_recommendation IS NULL`. Used once on first deploy, and whenever a bulk refresh is needed.

**Auth:** `isAdmin()` — return 403 if not admin.

**Logic:**
1. Query all sets where `ai_recommendation IS NULL` via service role
2. For each set, look up any user's inventory item to derive `avgCost` and `condition` (use first found)
3. Run the same Gemini call as the per-set route
4. Update `sets` table row
5. Process sequentially (avoid rate-limiting Gemini)
6. Return `{ total, refreshed, failed[] }`

**Running from terminal (one-time backfill):**

The plan includes a step to trigger this route via browser console after deploying:
```javascript
fetch('/api/admin/recommendations/refresh', { method: 'POST' })
  .then(r => r.json())
  .then(console.log)
```
This runs against the live Vercel deployment using the already-authenticated browser session.

---

## UI Changes

### Set Detail Page (`src/app/(dashboard)/sets/[id]/page.tsx`)

**Data:** `ai_recommendation`, `ai_analysis`, `ai_analyzed_at` come through via the existing `GET /api/sets?all=true` call (they live on `sets.*`, already fetched).

**Add to `SetGroup` interface:**
```typescript
ai_recommendation: string | null
ai_analysis: string | null
ai_analyzed_at: string | null
```

**Remove:** The client-side `getRecommendation()` call inside the Resale Market card. Replace the rendered recommendation badge with the stored `ai_recommendation` value.

**New "AI Analysis" card** — rendered below the Resale Market card:

- If `ai_recommendation` is null: show a single "✨ Analyse Investment" button
- If set: show
  - Verdict badge (same `PILL_STYLES` as the existing recommendation badge)
  - `analyzed_at` timestamp ("Analysed Apr 12")
  - Full `ai_analysis` markdown rendered as preformatted text (or a `<details>` disclosure element for the long content)
  - "Re-analyse" link to regenerate

**`PILL_STYLES` update** — replace old label keys with new:
```typescript
const PILL_STYLES = {
  SELL:        'bg-green-900/60 text-green-400 border-green-700',
  HOLD:        'bg-yellow-900/50 text-yellow-400 border-yellow-700',
  'HOLD LONG': 'bg-purple-900/50 text-purple-400 border-purple-700',
  'HOLD SHORT':'bg-blue-900/50 text-blue-400 border-blue-700',
  NO_DATA:     'bg-gray-700 text-gray-400 border-gray-600',
}
```

### Dashboard (`src/app/(dashboard)/dashboard/page.tsx`)

Replace `getRecommendation()` server-side call with reading `s.ai_recommendation` directly from the already-fetched `sets` data.

### SearchableInventory (`src/components/SearchableInventory.tsx`)

Update `PILL_STYLES` and filter tab sets:
- `SELL_LABELS = new Set(['SELL'])`
- `HOLD_LABELS = new Set(['HOLD', 'HOLD LONG', 'HOLD SHORT'])`

### Types (`src/types/inventory.ts`)

Update `GroupedSet.recommendation` union:
```typescript
recommendation?: 'SELL' | 'HOLD' | 'HOLD LONG' | 'HOLD SHORT' | 'NO_DATA'
```

Add to `GroupedSet`:
```typescript
ai_recommendation?: string | null
ai_analysis?: string | null
ai_analyzed_at?: string | null
```

Add to `InventoryItem.sets` (the raw shape returned by `GET /api/sets?all=true`):
```typescript
ai_recommendation: string | null
ai_analysis: string | null
ai_analyzed_at: string | null
```

These are needed because `GET /api/sets?all=true` selects `sets(*)` and TypeScript resolves field access through the `InventoryItem.sets` interface, not `GroupedSet`. Without these additions, reading `item.sets.ai_recommendation` on the detail page will produce a type error even though the data is present at runtime.

---

## `src/lib/gemini.ts` Changes

Add a new exported function `generateAiRecommendation({ setNumber, name, theme, avgCost, condition, retirementStatus, effectiveRetirementDate, avgPriceUsd })` alongside the existing `generateListing()`. Same model and JSON mode config.

**Note:** `generateListing()` currently imports `type Recommendation` from `./recommendations` and uses it to conditionally include the eBay price line (checking for `'LIQUIDATE'` and `'VELOCITY SELL'`). After the label change, those values no longer exist. Update `generateListing()`'s check to use the new labels: `recommendation === 'SELL'` (the only "sell now" signal in the new set). The `Recommendation` type import should remain from `./recommendations` — but `./recommendations.ts` itself must update its `Recommendation` type union to the new labels (see below).

---

## Data Flow

```
User clicks "Analyse Investment" on set detail page
  → POST /api/sets/[set_number]/ai-recommendation
  → Auth check
  → Fetch user's copies (cost, condition) + set metadata + price snapshot
  → Build prompt → Call Gemini 2.5 Flash (JSON mode)
  → Parse { verdict, analysis }
  → UPDATE sets SET ai_recommendation, ai_analysis, ai_analyzed_at
  → Return to client → render AI Analysis card

Dashboard renders
  → sets.ai_recommendation read from DB (no computation)
  → Badge shown with new label colors

First deploy
  → Open browser console on Vercel
  → fetch('/api/admin/recommendations/refresh', { method: 'POST' })
  → All null sets get analysed sequentially
```

---

## Files Changed

| File | Change |
|---|---|
| `migrations/add_ai_recommendation_columns.sql` | **Create** — migration file |
| `src/lib/recommendations.ts` | Update `Recommendation` type to `'SELL' \| 'HOLD' \| 'HOLD LONG' \| 'HOLD SHORT' \| 'NO_DATA'`; `getRecommendation()` is no longer called from the dashboard or detail page but keep the function — it is still used by `src/app/api/inventory/[id]/listing/route.ts` for the Gemini listing prompt context |
| `src/lib/gemini.ts` | Add `generateAiRecommendation()`; update `generateListing()` eBay price condition to use new label (`'SELL'` instead of `'LIQUIDATE' \| 'VELOCITY SELL'`) |
| `src/types/inventory.ts` | Add `ai_recommendation`, `ai_analysis`, `ai_analyzed_at` to both `InventoryItem.sets` and `GroupedSet`; update `recommendation` union |
| `src/app/api/sets/[set_number]/ai-recommendation/route.ts` | **Create** — per-set AI analysis route |
| `src/app/api/admin/recommendations/refresh/route.ts` | **Create** — bulk backfill route |
| `src/app/(dashboard)/sets/[id]/page.tsx` | Add AI Analysis card, update `SetGroup` interface, update `PILL_STYLES`, remove `getRecommendation()` call |
| `src/app/(dashboard)/dashboard/page.tsx` | Read `ai_recommendation` from DB instead of calling `getRecommendation()` |
| `src/components/SearchableInventory.tsx` | Update `PILL_STYLES` + `SELL_LABELS`/`HOLD_LABELS` sets |

---

## Out of Scope

- Auto-generating analysis when a set is first added
- Scheduled background refresh
- Per-item (vs. per-set) analysis
- Displaying Gemini's projected price values as a chart
- Live web search / real-time BrickLink price lookup
