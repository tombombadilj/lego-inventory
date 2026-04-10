# Velocity Advisor + Smart Listing Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace SELL/HOLD/WATCH labels with retirement-aware velocity labels, add minifigure data to sets, and add a Gemini-powered per-item listing generator for Facebook Marketplace.

**Architecture:** Three independent layers: (1) DB + types foundation, (2) recommendation logic rewrite, (3) Gemini listing assistant. Each layer is independently testable. The `getRecommendation()` function receives pre-computed `retirement_status` from `getRetirementStatus()` — no recomputation inside.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (PostgreSQL), Tailwind CSS v4, Rebrickable API v3, `@google/generative-ai` SDK, Jest

---

## File Map

| File | Change |
|---|---|
| `src/types/inventory.ts` | Add `minifig_count`, `minifig_names`, `listing_title`, `listing_description` to types; update `recommendation` union |
| `src/lib/rebrickable.ts` | Add `fetchMinifigs(setNumber)` |
| `src/app/api/lego-status/route.ts` | Call `fetchMinifigs()` after upsert, save results |
| `src/lib/recommendations.ts` | Rewrite `getRecommendation()` with new labels; update `InventoryContext` |
| `src/components/SearchableInventory.tsx` | Update `PILL_STYLES` for new/removed labels |
| `src/app/(dashboard)/dashboard/page.tsx` | Pass `retirement_status`, `retirement_date`, `override_retirement_date` to `getRecommendation()` |
| `src/app/(dashboard)/sets/[id]/page.tsx` | Update `PILL_STYLES`, `getRecommendation()` call; add minifig count to header; add Listing Package UI |
| `src/lib/gemini.ts` | **Create** — `generateListing()` function |
| `src/app/api/inventory/[id]/listing/route.ts` | **Create** — POST handler for listing generation |
| `src/__tests__/rebrickable-minifigs.test.ts` | **Create** — tests for `fetchMinifigs()` |
| `src/__tests__/recommendations.test.ts` | Rewrite for new label logic |
| `src/__tests__/gemini.test.ts` | **Create** — tests for `generateListing()` |
| `src/__tests__/inventory-listing.test.ts` | **Create** — tests for POST route |

---

## Chunk 1: DB Migrations + Types

### Task 1: Run DB migrations and update TypeScript types

**Files:**
- Modify: `src/types/inventory.ts`

- [ ] **Step 1: Run DB migrations in Supabase SQL Editor**

Go to your Supabase project → SQL Editor and run:

```sql
ALTER TABLE sets ADD COLUMN IF NOT EXISTS minifig_count INTEGER;
ALTER TABLE sets ADD COLUMN IF NOT EXISTS minifig_names TEXT;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS listing_title TEXT;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS listing_description TEXT;
```

Expected: 4× `Success. No rows returned.`

- [ ] **Step 2: Update `src/types/inventory.ts`**

Replace the entire file with:

```typescript
export interface InventoryItem {
  id: string
  set_id: string
  purchased_from: string | null
  purchase_price_usd: number | null
  purchase_date: string | null
  condition: string
  sold: boolean
  sold_price_usd: number | null
  sold_date: string | null
  sold_via: string | null
  created_at: string
  listing_title: string | null
  listing_description: string | null
  sets: {
    id: string
    set_number: string
    name: string
    theme: string | null
    piece_count: number | null
    retail_price_usd: number | null
    retired: boolean
    image_url: string | null
    override_retail_price_usd: number | null
    override_retired: boolean | null
    retirement_date: string | null
    retiring_soon_override: boolean | null
    override_retirement_date: string | null
    minifig_count: number | null
    minifig_names: string | null
  }
}

export interface GroupedSet {
  set_id: string
  set_number: string
  name: string
  theme: string | null
  piece_count: number | null
  retired: boolean
  override_retired: boolean | null
  retirement_date: string | null
  retiring_soon_override: boolean | null
  override_retirement_date: string | null
  minifig_count: number | null
  minifig_names: string | null
  image_url: string | null
  retail_price: number | null
  items: InventoryItem[]
  total_paid: number
  // Pre-computed server-side from latest price snapshot
  avg_price_usd?: number | null
  recommendation?: 'SELL' | 'HOLD' | 'STRATEGIC HOLD' | 'VELOCITY SELL' | 'LIQUIDATE' | 'NO_DATA'
  recommendation_reason?: string
  retirement_status?: 'Retired' | 'Retiring Soon' | 'Active'
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/jasonchiu/Desktop/code_test/lego-inventory
npx tsc --noEmit 2>&1
```

Expected: Only the pre-existing 6 errors in `SearchableInventory.test.tsx`. No new errors. If new errors appear, fix them before proceeding.

- [ ] **Step 4: Commit**

```bash
git add src/types/inventory.ts
git commit -m "feat: add minifig_count/names and listing_title/description to TypeScript types"
```

---

## Chunk 2: Minifigure Data

### Task 2: Add `fetchMinifigs()` to `src/lib/rebrickable.ts`

**Files:**
- Modify: `src/lib/rebrickable.ts`
- Create: `src/__tests__/rebrickable-minifigs.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/rebrickable-minifigs.test.ts`:

```typescript
import { fetchMinifigs } from '../lib/rebrickable'

const mockFetch = jest.fn()
global.fetch = mockFetch

beforeEach(() => {
  mockFetch.mockReset()
  process.env.REBRICKABLE_API_KEY = 'test-key'
})

function makeResponse(results: object[], count = results.length): Response {
  return {
    ok: true,
    json: async () => ({ count, results }),
  } as unknown as Response
}

test('returns minifig_count and minifig_names from results', async () => {
  mockFetch.mockResolvedValueOnce(makeResponse([
    { set_name: 'Bookshop Owner', quantity: 1 },
    { set_name: 'Customer', quantity: 2 },
  ]))
  const result = await fetchMinifigs('10270')
  expect(result).toEqual({
    minifig_count: 3,
    minifig_names: 'Bookshop Owner, Customer',
  })
  expect(mockFetch.mock.calls[0][0]).toContain('10270-1')
})

test('falls back to bare set number when -1 suffix returns empty', async () => {
  mockFetch
    .mockResolvedValueOnce(makeResponse([]))
    .mockResolvedValueOnce(makeResponse([{ set_name: 'Jazz Musician', quantity: 1 }]))
  const result = await fetchMinifigs('10312')
  expect(result).toEqual({ minifig_count: 1, minifig_names: 'Jazz Musician' })
  expect(mockFetch).toHaveBeenCalledTimes(2)
})

test('returns null when no results on any suffix', async () => {
  mockFetch
    .mockResolvedValueOnce(makeResponse([]))
    .mockResolvedValueOnce(makeResponse([]))
  const result = await fetchMinifigs('99999')
  expect(result).toBeNull()
})

test('returns null when fetch throws', async () => {
  mockFetch.mockRejectedValue(new Error('Network error'))
  const result = await fetchMinifigs('10270')
  expect(result).toBeNull()
})

test('returns null when response is not ok', async () => {
  mockFetch.mockResolvedValueOnce({ ok: false } as unknown as Response)
  const result = await fetchMinifigs('10270')
  expect(result).toBeNull()
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest src/__tests__/rebrickable-minifigs.test.ts --no-coverage
```

Expected: FAIL — `fetchMinifigs is not a function`

- [ ] **Step 3: Add `fetchMinifigs` to `src/lib/rebrickable.ts`**

Append to the end of the file (after `fetchSetFromRebrickable`):

```typescript
export interface MinifigData {
  minifig_count: number
  minifig_names: string
}

export async function fetchMinifigs(setNumber: string): Promise<MinifigData | null> {
  const suffixes = [`${setNumber}-1`, setNumber]
  for (const s of suffixes) {
    try {
      const res = await fetchWithTimeout(
        `https://rebrickable.com/api/v3/lego/sets/${s}/minifigs/`,
        { headers: { Authorization: `key ${process.env.REBRICKABLE_API_KEY}` } }
      )
      if (!res.ok) continue
      const data = await res.json()
      const results: Array<{ set_name: string; quantity: number }> = data.results ?? []
      if (results.length === 0) continue
      const minifig_count = results.reduce((sum, r) => sum + (r.quantity ?? 1), 0)
      const minifig_names = results.map(r => r.set_name).join(', ')
      return { minifig_count, minifig_names }
    } catch {
      // timeout or network error — try next suffix
    }
  }
  return null
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest src/__tests__/rebrickable-minifigs.test.ts --no-coverage
```

Expected: 5 tests pass.

- [ ] **Step 5: Run full test suite**

```bash
npx jest --no-coverage
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/rebrickable.ts src/__tests__/rebrickable-minifigs.test.ts
git commit -m "feat: add fetchMinifigs() to Rebrickable library"
```

---

### Task 3: Call `fetchMinifigs()` in the lego-status route

**Files:**
- Modify: `src/app/api/lego-status/route.ts`
- Modify: `src/__tests__/lego-status.test.ts`

- [ ] **Step 1: Read the existing test file**

Read `src/__tests__/lego-status.test.ts` to understand the current mock structure.

- [ ] **Step 2: Add failing test**

In `src/__tests__/lego-status.test.ts`, add a mock for `fetchMinifigs` alongside the existing `fetchRetirementDate` mock:

```typescript
import { fetchMinifigs } from '../lib/rebrickable'

jest.mock('../lib/rebrickable', () => ({
  fetchSetFromRebrickable: jest.fn(),
  fetchMinifigs: jest.fn(),
}))

const mockFetchMinifigs = fetchMinifigs as jest.Mock
```

Then add two tests. **Copy the mock setup (Rebrickable + Supabase mocks) verbatim from an existing passing test** — look for a test that asserts a Supabase `.update()` call and reuse its full mock setup. Then add:

```typescript
test('calls fetchMinifigs and updates minifig_count + minifig_names when result is non-null', async () => {
  // --- Copy full mock setup block from nearest existing test that asserts supabase.update ---
  // Then set:
  mockFetchMinifigs.mockResolvedValueOnce({ minifig_count: 3, minifig_names: 'Owner, Customer, Courier' })

  // Call handler with same NextRequest construction as existing tests
  // e.g.: const res = await POST(new NextRequest('http://localhost/api/lego-status', { ... }))

  expect(mockFetchMinifigs).toHaveBeenCalledWith(expect.any(String))
  expect(mockSupabaseUpdate).toHaveBeenCalledWith(
    expect.objectContaining({ minifig_count: 3, minifig_names: 'Owner, Customer, Courier' })
  )
})

test('does not update minifig fields when fetchMinifigs returns null', async () => {
  // --- Copy full mock setup block from nearest existing test ---
  mockFetchMinifigs.mockResolvedValueOnce(null)

  // Call handler

  expect(mockFetchMinifigs).toHaveBeenCalled()
  // Verify that no update call was made with minifig fields
  expect(mockSupabaseUpdate).not.toHaveBeenCalledWith(
    expect.objectContaining({ minifig_count: expect.anything() })
  )
})
```

> **Important:** The placeholder variable names (`mockSupabaseUpdate`, handler invocation) must be replaced with the real names from the existing test file. Read the existing test in Step 1 first and match its exact mock structure.

- [ ] **Step 3: Run tests to verify new tests fail**

```bash
npx jest --testPathPattern="lego-status" --no-coverage
```

Expected: New tests FAIL.

- [ ] **Step 4: Update `src/app/api/lego-status/route.ts`**

After the existing `fetchRetirementDate` block (the one that updates `retirement_date`), add:

```typescript
import { fetchSetFromRebrickable, fetchMinifigs } from '@/lib/rebrickable'

// After the retirement date block:
const minifigData = await fetchMinifigs(setNumber)
if (minifigData !== null) {
  await serviceSupabase
    .from('sets')
    .update({ minifig_count: minifigData.minifig_count, minifig_names: minifigData.minifig_names })
    .eq('set_number', setNumber)
  // supplementary data — ignore update errors
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx jest --no-coverage
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/lego-status/route.ts src/__tests__/lego-status.test.ts
git commit -m "feat: fetch and store minifigure data when set is added"
```

---

## Chunk 3: New Recommendation Labels

### Task 4: Rewrite `getRecommendation()` in `src/lib/recommendations.ts`

**Files:**
- Modify: `src/lib/recommendations.ts`
- Modify: `src/__tests__/recommendations.test.ts`

- [ ] **Step 1: Read current files**

Read `src/lib/recommendations.ts` and `src/__tests__/recommendations.test.ts` in full.

- [ ] **Step 2: Replace the `getRecommendation` tests**

In `src/__tests__/recommendations.test.ts`, remove the existing `getRecommendation` tests and replace with:

```typescript
import { getRecommendation, getRetirementStatus } from '../lib/recommendations'

function makeSnapshot(overrides: Partial<{
  avg_price_usd: number | null
  min_price_usd: number | null
  demand_score: number
  listings_count: number
}> = {}) {
  return {
    avg_price_usd: 200,
    min_price_usd: 180,
    demand_score: 50,
    listings_count: 20,
    ...overrides,
  }
}

function makeCtx(overrides: Partial<{
  purchase_price_usd: number | null
  retired: boolean
  sell_threshold_pct: number
  demand_drop_pts: number
  retirement_status: 'Retired' | 'Retiring Soon' | 'Active'
  retirement_date: string | null
  override_retirement_date: string | null
}> = {}) {
  return {
    purchase_price_usd: 100,
    retired: false,
    sell_threshold_pct: 10,
    demand_drop_pts: 20,
    retirement_status: 'Active' as const,
    retirement_date: null,
    override_retirement_date: null,
    ...overrides,
  }
}

describe('getRecommendation', () => {
  test('returns NO_DATA when snapshot is null', () => {
    expect(getRecommendation(null, makeCtx()).recommendation).toBe('NO_DATA')
  })

  test('returns NO_DATA when avg_price_usd is null', () => {
    expect(getRecommendation(makeSnapshot({ avg_price_usd: null }), makeCtx()).recommendation).toBe('NO_DATA')
  })

  test('returns STRATEGIC HOLD for Retiring Soon', () => {
    expect(getRecommendation(makeSnapshot(), makeCtx({ retirement_status: 'Retiring Soon' })).recommendation).toBe('STRATEGIC HOLD')
  })

  test('returns VELOCITY SELL for Retired with high demand', () => {
    const date = new Date()
    date.setFullYear(date.getFullYear() - 1)
    expect(getRecommendation(
      makeSnapshot({ demand_score: 60, listings_count: 10 }),
      makeCtx({ retirement_status: 'Retired', retirement_date: date.toISOString().slice(0, 10) })
    ).recommendation).toBe('VELOCITY SELL')
  })

  test('returns VELOCITY SELL for recently Retired with high demand', () => {
    const date = new Date()
    date.setDate(date.getDate() - 30) // 30 days ago
    expect(getRecommendation(
      makeSnapshot({ demand_score: 60, listings_count: 10 }),
      makeCtx({ retirement_status: 'Retired', retirement_date: date.toISOString().slice(0, 10) })
    ).recommendation).toBe('VELOCITY SELL')
  })

  test('returns STRATEGIC HOLD for recently Retired with low demand', () => {
    const date = new Date()
    date.setDate(date.getDate() - 30) // 30 days ago — within 180 days
    expect(getRecommendation(
      makeSnapshot({ demand_score: 10, listings_count: 3 }),
      makeCtx({ retirement_status: 'Retired', retirement_date: date.toISOString().slice(0, 10) })
    ).recommendation).toBe('STRATEGIC HOLD')
  })

  test('returns LIQUIDATE for Retired 6+ months with low demand', () => {
    const date = new Date()
    date.setDate(date.getDate() - 200) // well past 180 days
    expect(getRecommendation(
      makeSnapshot({ demand_score: 10, listings_count: 3 }),
      makeCtx({ retirement_status: 'Retired', retirement_date: date.toISOString().slice(0, 10) })
    ).recommendation).toBe('LIQUIDATE')
  })

  test('uses override_retirement_date when present for age calculation', () => {
    const overrideDate = new Date()
    overrideDate.setDate(overrideDate.getDate() - 200) // force old age
    const recentDate = new Date()
    recentDate.setDate(recentDate.getDate() - 30) // raw date is recent
    expect(getRecommendation(
      makeSnapshot({ demand_score: 10, listings_count: 3 }),
      makeCtx({
        retirement_status: 'Retired',
        retirement_date: recentDate.toISOString().slice(0, 10),
        override_retirement_date: overrideDate.toISOString().slice(0, 10),
      })
    ).recommendation).toBe('LIQUIDATE') // override makes it old → LIQUIDATE
  })

  test('returns SELL for Active + high demand + above threshold', () => {
    expect(getRecommendation(
      makeSnapshot({ demand_score: 60, listings_count: 10, avg_price_usd: 200 }),
      makeCtx({ purchase_price_usd: 100, sell_threshold_pct: 10, demand_drop_pts: 20 })
    ).recommendation).toBe('SELL')
  })

  test('returns HOLD for Active + high demand but below threshold', () => {
    expect(getRecommendation(
      makeSnapshot({ demand_score: 60, listings_count: 10, avg_price_usd: 105 }),
      makeCtx({ purchase_price_usd: 100, sell_threshold_pct: 20, demand_drop_pts: 20 })
    ).recommendation).toBe('HOLD')
  })

  test('returns HOLD for Active + low demand regardless of price', () => {
    expect(getRecommendation(
      makeSnapshot({ demand_score: 5, listings_count: 2, avg_price_usd: 500 }),
      makeCtx({ purchase_price_usd: 100, sell_threshold_pct: 10 })
    ).recommendation).toBe('HOLD')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx jest src/__tests__/recommendations.test.ts --no-coverage
```

Expected: FAIL — new label branches don't exist yet.

- [ ] **Step 4: Rewrite `getRecommendation()` in `src/lib/recommendations.ts`**

Update the `Recommendation` type and `InventoryContext`, then rewrite `getRecommendation()`. Keep `getRetirementStatus()` exactly as-is.

```typescript
export type Recommendation = 'SELL' | 'HOLD' | 'STRATEGIC HOLD' | 'VELOCITY SELL' | 'LIQUIDATE' | 'NO_DATA'

export interface InventoryContext {
  purchase_price_usd: number | null
  retired: boolean
  sell_threshold_pct: number
  demand_drop_pts: number
  retirement_status: RetirementStatus
  retirement_date: string | null
  override_retirement_date: string | null
}

export function getRecommendation(
  snapshot: PriceSnapshot | null,
  ctx: InventoryContext
): RecommendationResult {
  if (!snapshot || snapshot.avg_price_usd === null) {
    return { recommendation: 'NO_DATA', reason: 'No resale price data available yet.' }
  }

  const { avg_price_usd, demand_score, listings_count } = snapshot
  const { purchase_price_usd, sell_threshold_pct, demand_drop_pts, retirement_status, retirement_date, override_retirement_date } = ctx

  const highDemand = demand_score >= demand_drop_pts && listings_count >= 5
  const effectiveRetirementDate = override_retirement_date ?? retirement_date

  if (retirement_status === 'Retiring Soon') {
    return {
      recommendation: 'STRATEGIC HOLD',
      reason: 'Set is retiring soon — prices typically spike after retirement. Hold for better returns.',
    }
  }

  if (retirement_status === 'Retired') {
    const avgStr = avg_price_usd.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

    if (highDemand) {
      return {
        recommendation: 'VELOCITY SELL',
        reason: `Retired set at ${avgStr} avg with high demand (score ${demand_score}/100). Market is hot — move now for maximum return.`,
      }
    }

    // Low demand: check age to decide STRATEGIC HOLD vs LIQUIDATE
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setDate(sixMonthsAgo.getDate() - 180)
    const sixMonthsAgoStr = sixMonthsAgo.toISOString().slice(0, 10)
    const isRecentlyRetired = effectiveRetirementDate !== null && effectiveRetirementDate >= sixMonthsAgoStr

    if (isRecentlyRetired) {
      return {
        recommendation: 'STRATEGIC HOLD',
        reason: 'Set retired recently — demand hasn\'t peaked yet. Hold and monitor for price appreciation.',
      }
    }

    return {
      recommendation: 'LIQUIDATE',
      reason: `Retired 6+ months with low demand (score ${demand_score}/100). Price may be softening — consider recovering capital now.`,
    }
  }

  // Active set
  if (highDemand && purchase_price_usd && purchase_price_usd > 0) {
    const gainPct = ((avg_price_usd - purchase_price_usd) / purchase_price_usd) * 100
    if (gainPct >= sell_threshold_pct) {
      const gainStr = gainPct.toFixed(0)
      const avgStr = avg_price_usd.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
      const paidStr = purchase_price_usd.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
      return {
        recommendation: 'SELL',
        reason: `Avg resale ${avgStr} — ${gainStr}% above your purchase price of ${paidStr}. Demand is healthy.`,
      }
    }
  }

  const avgStr = avg_price_usd.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  return {
    recommendation: 'HOLD',
    reason: `Resale market at ${avgStr} avg. No strong sell signal yet.`,
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx jest --no-coverage
```

Expected: All tests pass. Note: `SearchableInventory.test.tsx` may emit TypeScript errors — fix by updating the `recommendation` prop type in any test fixture to use the new union.

- [ ] **Step 6: Commit**

```bash
git add src/lib/recommendations.ts src/__tests__/recommendations.test.ts
git commit -m "feat: rewrite recommendation labels — VELOCITY SELL, STRATEGIC HOLD, LIQUIDATE"
```

---

## Chunk 4: UI Updates

### Task 5: Update `SearchableInventory.tsx` badge styles

**Files:**
- Modify: `src/components/SearchableInventory.tsx`

- [ ] **Step 1: Replace `PILL_STYLES` in `src/components/SearchableInventory.tsx`**

Replace the existing `PILL_STYLES` object:

```typescript
const PILL_STYLES: Record<string, string> = {
  'SELL': 'bg-green-900/60 text-green-400',
  'HOLD': 'bg-yellow-900/50 text-yellow-400',
  'VELOCITY SELL': 'bg-green-600 text-white',
  'STRATEGIC HOLD': 'bg-purple-900/50 text-purple-400',
  'LIQUIDATE': 'bg-orange-900/50 text-orange-400',
  'NO_DATA': 'bg-gray-700 text-gray-400',
}
```

Remove the `WATCH` key. The lookup `PILL_STYLES[group.recommendation ?? 'NO_DATA']` already handles unknown keys gracefully since the type is now `Record<string, string>`.

- [ ] **Step 2: Run full test suite**

```bash
cd /Users/jasonchiu/Desktop/code_test/lego-inventory
npx jest --no-coverage
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/SearchableInventory.tsx
git commit -m "feat: update dashboard badge styles for new recommendation labels"
```

---

### Task 6: Update `dashboard/page.tsx` to pass new fields to `getRecommendation()`

**Files:**
- Modify: `src/app/(dashboard)/dashboard/page.tsx`

- [ ] **Step 1: Update `getRecommendation()` call in `enrichedSets` mapping**

In `src/app/(dashboard)/dashboard/page.tsx`, in the `enrichedSets` mapping, update the `getRecommendation()` call to pass the new `InventoryContext` fields:

```typescript
const { recommendation, reason } = getRecommendation(snapshot, {
  purchase_price_usd: avgPurchasePrice,
  retired: group.retired,
  sell_threshold_pct: userSettings.price_spike_pct,
  demand_drop_pts: userSettings.demand_drop_pts,
  retirement_status: getRetirementStatus({
    retirement_date: group.retirement_date ?? null,
    override_retired: group.override_retired ?? null,
    retiring_soon_override: group.retiring_soon_override ?? null,
  }),
  retirement_date: group.retirement_date ?? null,
  override_retirement_date: group.override_retirement_date ?? null,
})
```

Also add `minifig_count` and `minifig_names` to the grouped set construction (in the `reduce` block where `acc[key]` is built):

```typescript
minifig_count: item.sets.minifig_count ?? null,
minifig_names: item.sets.minifig_names ?? null,
```

Note: `retirement_status` is still computed separately for the `retirement_status` field on the enriched set — keep that call to `getRetirementStatus()` as-is. The call above inside `getRecommendation()` is the one needed for the recommendation logic.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1
```

Expected: Only pre-existing errors. Fix any new errors before proceeding.

- [ ] **Step 3: Run full test suite**

```bash
npx jest --no-coverage
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/dashboard/page.tsx
git commit -m "feat: pass retirement fields to getRecommendation() on dashboard"
```

---

### Task 7: Update set detail page — PILL_STYLES, getRecommendation, minifig count

**Files:**
- Modify: `src/app/(dashboard)/sets/[id]/page.tsx`

- [ ] **Step 1: Read the full file**

Read `src/app/(dashboard)/sets/[id]/page.tsx` to understand the current structure before making changes.

- [ ] **Step 2: Update `PILL_STYLES` in the set detail page**

The set detail page has its own `PILL_STYLES` object. Replace it with the same mapping as `SearchableInventory.tsx`:

```typescript
const PILL_STYLES: Record<string, string> = {
  'SELL': 'bg-green-900/60 text-green-400 border-green-700',
  'HOLD': 'bg-yellow-900/50 text-yellow-400 border-yellow-700',
  'VELOCITY SELL': 'bg-green-600 text-white border-green-500',
  'STRATEGIC HOLD': 'bg-purple-900/50 text-purple-400 border-purple-700',
  'LIQUIDATE': 'bg-orange-900/50 text-orange-400 border-orange-700',
  'NO_DATA': 'bg-gray-700 text-gray-400 border-gray-600',
}
```

Remove `WATCH` key.

- [ ] **Step 3: Update `SetGroup` interface in the set detail page**

Add to the local `SetGroup` interface:

```typescript
retirement_date: string | null
override_retirement_date: string | null
retirement_status?: 'Retired' | 'Retiring Soon' | 'Active'
minifig_count: number | null
```

- [ ] **Step 4: Update `loadData` to populate new fields**

In `loadData`, when building the `setGroup` object, add:

```typescript
retirement_date: s.retirement_date ?? null,
override_retirement_date: s.override_retirement_date ?? null,
minifig_count: s.minifig_count ?? null,
```

- [ ] **Step 5: Update `getRecommendation()` call in the set detail page**

The set detail page calls `getRecommendation()` client-side. Update it to pass the new fields. Import `getRetirementStatus` alongside `getRecommendation`:

```typescript
import { getRecommendation, getRetirementStatus } from '@/lib/recommendations'
```

Then update the call:

```typescript
const { recommendation, reason } = getRecommendation(snapshot, {
  purchase_price_usd: avgPurchase,
  retired: group?.retired ?? false,
  sell_threshold_pct: userSettings.price_spike_pct,
  demand_drop_pts: userSettings.demand_drop_pts,
  retirement_status: group ? getRetirementStatus({
    retirement_date: group.retirement_date,
    override_retired: group.override_retired,
    retiring_soon_override: group.retiring_soon_override ?? null,
  }) : 'Active',
  retirement_date: group?.retirement_date ?? null,
  override_retirement_date: group?.override_retirement_date ?? null,
})
```

- [ ] **Step 6: Add minifig count to the set header**

In the set header section, find the line that displays piece count:

```tsx
{group.piece_count && <span>{group.piece_count.toLocaleString()} pcs</span>}
```

Add after it:

```tsx
{group.minifig_count != null && group.minifig_count > 0 && (
  <span>{group.minifig_count} minifig{group.minifig_count !== 1 ? 's' : ''}</span>
)}
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1
```

Expected: Only pre-existing errors. Fix any new ones.

- [ ] **Step 8: Run full test suite**

```bash
npx jest --no-coverage
```

Expected: All tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/app/\(dashboard\)/sets/\[id\]/page.tsx
git commit -m "feat: update set detail page — new labels, minifig count in header"
```

---

## Chunk 5: Gemini Listing Assistant

### Task 8: Create `src/lib/gemini.ts`

**Files:**
- Create: `src/lib/gemini.ts`
- Create: `src/__tests__/gemini.test.ts`

- [ ] **Step 1: Install Gemini SDK**

```bash
cd /Users/jasonchiu/Desktop/code_test/lego-inventory
npm install @google/generative-ai
```

- [ ] **Step 2: Write failing tests**

Create `src/__tests__/gemini.test.ts`:

```typescript
// Mock @google/generative-ai before importing gemini.ts
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn(),
    }),
  })),
}))

import { GoogleGenerativeAI } from '@google/generative-ai'
import { generateListing } from '../lib/gemini'

const MockGoogleGenerativeAI = GoogleGenerativeAI as jest.MockedClass<typeof GoogleGenerativeAI>

function getGenerateContentMock() {
  return MockGoogleGenerativeAI.mock.results[0]?.value.getGenerativeModel.mock.results[0]?.value.generateContent as jest.Mock
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.GEMINI_API_KEY = 'test-key'
  // Re-instantiate mock for each test
  MockGoogleGenerativeAI.mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn(),
    }),
  }))
})

const baseInput = {
  name: 'Bookshop',
  setNumber: '10270',
  theme: 'Icons',
  pieceCount: 2504,
  condition: 'sealed',
  retirementStatus: 'Retired' as const,
  effectiveRetirementDate: '2023-12-31',
  avgPrice: 280,
  recommendation: 'VELOCITY SELL' as const,
  minifigCount: 3,
  minifigNames: 'Bookshop Owner, Customer, Courier',
}

test('returns listing_title and listing_description on success', async () => {
  const mockResult = { listing_title: 'LEGO 10270 Bookshop - NEW SEALED - Retired Modular', listing_description: 'Great set!' }
  MockGoogleGenerativeAI.mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn().mockResolvedValueOnce({
        response: { text: () => JSON.stringify(mockResult) },
      }),
    }),
  }))

  const result = await generateListing(baseInput)
  expect(result).toEqual(mockResult)
})

test('throws when GEMINI_API_KEY is not set', async () => {
  delete process.env.GEMINI_API_KEY
  await expect(generateListing(baseInput)).rejects.toThrow('GEMINI_API_KEY')
})

test('throws when Gemini returns invalid JSON', async () => {
  MockGoogleGenerativeAI.mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn().mockResolvedValueOnce({
        response: { text: () => 'not json' },
      }),
    }),
  }))

  await expect(generateListing(baseInput)).rejects.toThrow('Failed to parse listing from Gemini')
})

test('includes eBay price in prompt for VELOCITY SELL recommendation', async () => {
  MockGoogleGenerativeAI.mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn().mockResolvedValueOnce({
        response: { text: () => JSON.stringify({ listing_title: 'T', listing_description: 'D' }) },
      }),
    }),
  }))

  await generateListing({ ...baseInput, recommendation: 'VELOCITY SELL' })
  const model = MockGoogleGenerativeAI.mock.results[0]?.value.getGenerativeModel.mock.results[0]?.value
  const promptArg = model.generateContent.mock.calls[0][0] as string
  expect(promptArg).toContain('eBay resale avg')
})

test('omits eBay price for HOLD recommendation', async () => {
  MockGoogleGenerativeAI.mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn().mockResolvedValueOnce({
        response: { text: () => JSON.stringify({ listing_title: 'T', listing_description: 'D' }) },
      }),
    }),
  }))

  await generateListing({ ...baseInput, recommendation: 'HOLD', avgPrice: null })
  const model = MockGoogleGenerativeAI.mock.results[0]?.value.getGenerativeModel.mock.results[0]?.value
  const promptArg = model.generateContent.mock.calls[0][0] as string
  expect(promptArg).not.toContain('eBay resale avg')
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx jest src/__tests__/gemini.test.ts --no-coverage
```

Expected: FAIL — `generateListing is not a function`

- [ ] **Step 4: Create `src/lib/gemini.ts`**

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai'
import type { Recommendation } from './recommendations'

export interface ListingInput {
  name: string
  setNumber: string
  theme: string | null
  pieceCount: number | null
  condition: string
  retirementStatus: string
  effectiveRetirementDate: string | null
  avgPrice: number | null
  recommendation: Recommendation
  minifigCount: number | null
  minifigNames: string | null
}

export interface ListingOutput {
  listing_title: string
  listing_description: string
}

export async function generateListing(input: ListingInput): Promise<ListingOutput> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY environment variable is not set')
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    generationConfig: { responseMimeType: 'application/json' },
  })

  const includeEbayPrice = input.recommendation === 'LIQUIDATE' || input.recommendation === 'VELOCITY SELL'
  const ebayPriceLine = includeEbayPrice && input.avgPrice
    ? `eBay resale avg: $${input.avgPrice}`
    : ''

  const retirementLine = input.retirementStatus === 'Retired' && input.effectiveRetirementDate
    ? `Retirement status: Retired (since ${input.effectiveRetirementDate})`
    : `Retirement status: ${input.retirementStatus}`

  const minifigLine = input.minifigNames
    ? `Minifigures (${input.minifigCount} total): ${input.minifigNames}`
    : input.minifigCount
      ? `Minifigures: ${input.minifigCount} included`
      : ''

  const prompt = [
    `You're helping sell a LEGO set on Facebook Marketplace. Write friendly, attention-grabbing copy.`,
    ``,
    `Set: ${input.name} (#${input.setNumber})`,
    `Theme: ${input.theme ?? 'Unknown'}`,
    `Pieces: ${input.pieceCount ?? 'Unknown'}`,
    `Condition: ${input.condition}`,
    retirementLine,
    minifigLine,
    ebayPriceLine,
    ``,
    `Rules:`,
    `- Title: max 80 characters, format "LEGO {number} {name} - {CONDITION IN CAPS} - {1 compelling hook}"`,
    `- Description: 3-4 sentences, friendly tone`,
    `- If retired/rare: mention it's no longer in stores`,
    `- If eBay price is provided: note that our price is lower than eBay`,
    `- Always mention piece count`,
    `- If any minifigures are known to be particularly collectible, sought-after, or have recently spiked in popularity (e.g. exclusive figures, pop culture tie-ins), name them in the description — only if you are confident, do not speculate`,
    `- Do not invent facts`,
    `- Return valid JSON only: { "listing_title": "...", "listing_description": "..." }`,
  // ^ Note: The spec's prompt example uses { "title", "description" } but this plan uses the DB column
  // names directly to avoid a remapping step. This is an intentional deviation from the spec's prompt text.
  ].filter(Boolean).join('\n').trim()

  const result = await model.generateContent(prompt)
  const text = result.response.text()

  let parsed: ListingOutput
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('Failed to parse listing from Gemini')
  }

  if (!parsed.listing_title || !parsed.listing_description) {
    throw new Error('Failed to parse listing from Gemini')
  }

  return parsed
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx jest src/__tests__/gemini.test.ts --no-coverage
```

Expected: 5 tests pass.

- [ ] **Step 6: Run full test suite**

```bash
npx jest --no-coverage
```

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/gemini.ts src/__tests__/gemini.test.ts package.json package-lock.json
git commit -m "feat: add Gemini listing generator library"
```

---

### Task 9: Create `POST /api/inventory/[id]/listing` route

**Files:**
- Create: `src/app/api/inventory/[id]/listing/route.ts`
- Create: `src/__tests__/inventory-listing.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/inventory-listing.test.ts`:

```typescript
/**
 * @jest-environment node
 */
import { POST } from '../app/api/inventory/[id]/listing/route'
import { NextRequest } from 'next/server'

jest.mock('../lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('../lib/gemini', () => ({ generateListing: jest.fn() }))

import { createClient } from '../lib/supabase/server'
import { generateListing } from '../lib/gemini'

const mockCreateClient = createClient as jest.Mock
const mockGenerateListing = generateListing as jest.Mock

function makeSupabaseMock(overrides: {
  user?: { id: string } | null
  item?: object | null
  updateError?: string | null
} = {}) {
  const { user = { id: 'user-1' }, item = null, updateError = null } = overrides

  const mockSingle = jest.fn()
  const mockEq2 = jest.fn().mockReturnValue({ single: mockSingle })
  const mockEq1 = jest.fn().mockReturnValue({ eq: mockEq2 })
  const mockFrom = jest.fn()

  // inventory_items select
  mockSingle.mockResolvedValue({ data: item, error: item ? null : { message: 'Not found' } })

  // update mock — supports .eq('id', id).eq('added_by', user.id) chaining
  const mockUpdateEq2 = jest.fn().mockResolvedValue({ error: updateError ? { message: updateError } : null })
  const mockUpdateEq1 = jest.fn().mockReturnValue({ eq: mockUpdateEq2 })
  const mockUpdate = jest.fn().mockReturnValue({ eq: mockUpdateEq1 })

  mockFrom.mockImplementation((table: string) => {
    if (table === 'inventory_items') return { select: () => ({ eq: mockEq1 }), update: mockUpdate }
    return {}
  })

  mockCreateClient.mockResolvedValue({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user } }) },
    from: mockFrom,
  })

  return { mockUpdate, mockUpdateEq1, mockUpdateEq2 }
}

async function callPost(id: string) {
  const req = new NextRequest(`http://localhost/api/inventory/${id}/listing`, { method: 'POST' })
  return POST(req, { params: Promise.resolve({ id }) })
}

test('returns 401 when not authenticated', async () => {
  makeSupabaseMock({ user: null })
  const res = await callPost('item-1')
  expect(res.status).toBe(401)
})

test('returns 404 when item not found or not owned', async () => {
  makeSupabaseMock({ user: { id: 'user-1' }, item: null })
  const res = await callPost('item-1')
  expect(res.status).toBe(404)
})

test('returns 200 with listing data on success', async () => {
  const item = {
    id: 'item-1',
    condition: 'sealed',
    sets: {
      name: 'Bookshop', set_number: '10270', theme: 'Icons', piece_count: 2504,
      retirement_date: '2023-12-31', override_retirement_date: null,
      override_retired: true, retiring_soon_override: null,
      minifig_count: 3, minifig_names: 'Owner, Customer',
      avg_price_usd: 280,
    },
  }
  makeSupabaseMock({ item })
  mockGenerateListing.mockResolvedValueOnce({
    listing_title: 'LEGO 10270 Bookshop - NEW SEALED - Retired',
    listing_description: 'Amazing set!',
  })

  const res = await callPost('item-1')
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.listing_title).toBe('LEGO 10270 Bookshop - NEW SEALED - Retired')
})

test('returns 502 when generateListing throws', async () => {
  const item = {
    id: 'item-1', condition: 'sealed',
    sets: { name: 'Bookshop', set_number: '10270', theme: 'Icons', piece_count: 2504,
            retirement_date: null, override_retirement_date: null, override_retired: null,
            retiring_soon_override: null, minifig_count: null, minifig_names: null },
  }
  makeSupabaseMock({ item })
  mockGenerateListing.mockRejectedValueOnce(new Error('Gemini down'))

  const res = await callPost('item-1')
  expect(res.status).toBe(502)
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest src/__tests__/inventory-listing.test.ts --no-coverage
```

Expected: FAIL — route doesn't exist yet.

- [ ] **Step 3: Create `src/app/api/inventory/[id]/listing/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateListing } from '@/lib/gemini'
import { getRetirementStatus, getRecommendation } from '@/lib/recommendations'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // Fetch item + set data — implicit ownership via added_by
  const { data: item, error: fetchError } = await supabase
    .from('inventory_items')
    .select('*, sets(*)')
    .eq('id', id)
    .eq('added_by', user.id)
    .single()

  if (fetchError || !item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const s = item.sets
  const effectiveRetirementDate = s.override_retirement_date ?? s.retirement_date
  const retirementStatus = getRetirementStatus({
    retirement_date: s.retirement_date,
    override_retired: s.override_retired,
    retiring_soon_override: s.retiring_soon_override,
  })

  // Derive recommendation for prompt context (no price snapshot available here — use NO_DATA)
  const recommendation = getRecommendation(null, {
    purchase_price_usd: item.purchase_price_usd,
    retired: s.retired,
    sell_threshold_pct: 10,
    demand_drop_pts: 20,
    retirement_status: retirementStatus,
    retirement_date: s.retirement_date,
    override_retirement_date: s.override_retirement_date,
  }).recommendation

  try {
    const listing = await generateListing({
      name: s.name,
      setNumber: s.set_number,
      theme: s.theme,
      pieceCount: s.piece_count,
      condition: item.condition,
      retirementStatus,
      effectiveRetirementDate,
      avgPrice: null, // price snapshots not fetched here; Gemini prompt omits eBay price if null
      recommendation,
      minifigCount: s.minifig_count,
      minifigNames: s.minifig_names,
    })

    await supabase
      .from('inventory_items')
      .update({ listing_title: listing.listing_title, listing_description: listing.listing_description })
      .eq('id', id)
      .eq('added_by', user.id)

    return NextResponse.json(listing)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gemini error'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest src/__tests__/inventory-listing.test.ts --no-coverage
```

Expected: 4 tests pass.

- [ ] **Step 5: Run full test suite**

```bash
npx jest --no-coverage
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/inventory/\[id\]/listing/route.ts src/__tests__/inventory-listing.test.ts
git commit -m "feat: add POST /api/inventory/[id]/listing — Gemini listing generator"
```

---

### Task 10: Add Listing Package UI to set detail page

**Files:**
- Modify: `src/app/(dashboard)/sets/[id]/page.tsx`

- [ ] **Step 1: Add listing state**

In the component, add state for tracking per-item listing loading:

```typescript
const [listingLoading, setListingLoading] = useState<Record<string, boolean>>({})
```

- [ ] **Step 2: Add `generateListing` handler**

Add this function to the component (alongside `saveEdit`, `saveSell`, etc.):

```typescript
async function generateItemListing(itemId: string) {
  setListingLoading(s => ({ ...s, [itemId]: true }))
  await fetch(`/api/inventory/${itemId}/listing`, { method: 'POST' })
  setListingLoading(s => ({ ...s, [itemId]: false }))
  loadData()
}
```

- [ ] **Step 3: Add Listing Package card to each item**

Inside the `.map((item, i) => ...)` block, after the existing action buttons (`Edit`, `Mark as Sold`, `Remove`), add:

```tsx
{/* Listing Package */}
<div className="mt-3 pt-3 border-t border-gray-700">
  {item.listing_title ? (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Listing Package</p>

      {/* Title */}
      <div>
        <div className="flex items-center justify-between mb-0.5">
          <p className="text-xs text-gray-500">Title</p>
          <button
            onClick={() => navigator.clipboard.writeText(item.listing_title!)}
            className="text-xs text-gray-400 hover:text-white transition-colors"
          >
            Copy
          </button>
        </div>
        <p className="text-sm text-white bg-gray-800 rounded px-2 py-1">{item.listing_title}</p>
      </div>

      {/* Description */}
      <div>
        <div className="flex items-center justify-between mb-0.5">
          <p className="text-xs text-gray-500">Description</p>
          <button
            onClick={() => navigator.clipboard.writeText(item.listing_description!)}
            className="text-xs text-gray-400 hover:text-white transition-colors"
          >
            Copy
          </button>
        </div>
        <p className="text-sm text-white bg-gray-800 rounded px-2 py-1 whitespace-pre-wrap">{item.listing_description}</p>
      </div>

      {/* Suggested price — primary: min_price_usd × 0.95; fallback: avg_price_usd × 0.95 */}
      {(() => {
        const basePrice = snapshot?.min_price_usd ?? snapshot?.avg_price_usd ?? null
        if (basePrice == null) return null
        const suggestedPrice = basePrice * 0.95
        const priceLabel = snapshot?.min_price_usd != null
          ? `5% below eBay floor of $${snapshot.min_price_usd.toFixed(2)}`
          : `5% below eBay avg of $${snapshot!.avg_price_usd!.toFixed(2)}`
        return (
          <div className="bg-gray-800 rounded px-2 py-1.5">
            <p className="text-xs text-gray-400">
              Suggested list price:{' '}
              <span className="text-white font-semibold">
                ${suggestedPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-gray-500"> ({priceLabel})</span>
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              Heads up: eBay charges ~13% in fees (approximate, verify current rates). FB Marketplace is free for local pickup, 5% for shipped orders. Make sure your asking price accounts for this.
            </p>
          </div>
        )
      })()}

      <button
        onClick={() => generateItemListing(item.id)}
        disabled={listingLoading[item.id]}
        className="text-xs text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-50"
      >
        {listingLoading[item.id] ? 'Regenerating…' : 'Regenerate'}
      </button>
    </div>
  ) : (
    <button
      onClick={() => generateItemListing(item.id)}
      disabled={listingLoading[item.id]}
      className="w-full text-xs border border-gray-600 text-gray-400 hover:text-white hover:border-gray-400 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
    >
      {listingLoading[item.id] ? 'Generating listing…' : '✨ Generate Listing'}
    </button>
  )}
</div>
```

Note: `item.listing_title` and `item.listing_description` are now available via `InventoryItem` (added in Task 1). The `snapshot` variable is the `PriceSnapshot` state already in scope.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1
```

Expected: Only pre-existing errors. Fix any new ones.

- [ ] **Step 5: Run full test suite**

```bash
npx jest --no-coverage
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(dashboard\)/sets/\[id\]/page.tsx
git commit -m "feat: add Listing Package UI to set detail page"
```

---

## Post-Implementation

- [ ] **Run admin refresh to backfill minifig data for existing sets**

In your browser console on any page while logged in:
```javascript
fetch('/api/admin/sets/refresh', { method: 'POST' })
  .then(r => r.json())
  .then(console.log)
```

Note: This backfills retirement dates but does NOT backfill minifig data for existing sets — minifigs are only fetched when a set is freshly added. To get minifigs for existing sets, you can re-add any set or we can add a separate backfill route later.

- [ ] **Push and create PR**

```bash
git push
gh pr create --title "feat: velocity advisor labels + Gemini listing assistant"
```
