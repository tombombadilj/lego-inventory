# Retirement Integration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Brickset API as a supplementary data source to surface accurate LEGO set retirement status (Retired / Retiring Soon / Active) with colored badges on the dashboard and admin manual override controls.

**Architecture:** Brickset is called alongside Rebrickable when a set is added, and during admin refresh, to populate `retirement_date`. A pure `getRetirementStatus()` function derives status from `retirement_date` and manual override flags. Dashboard cards show colored inline badges; admin detail page exposes override toggles.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (PostgreSQL), Tailwind CSS v4, Brickset API v3, Jest/jest-environment-jsdom

---

## File Map

| File | Change |
|---|---|
| `src/lib/brickset.ts` | **Create** — `fetchRetirementDate(setNumber)` |
| `src/__tests__/brickset.test.ts` | **Create** — unit tests for brickset library |
| `src/lib/recommendations.ts` | **Modify** — add `RetirementStatus` type + `getRetirementStatus()` |
| `src/__tests__/recommendations.test.ts` | **Modify** — add tests for `getRetirementStatus()` |
| `src/types/inventory.ts` | **Modify** — add `retirement_date`, `retiring_soon_override`, `override_retirement_date` to `SetRow`/`GroupedSet` |
| `src/app/api/lego-status/route.ts` | **Modify** — call Brickset after Rebrickable, targeted UPDATE for `retirement_date` |
| `src/app/api/admin/sets/refresh/route.ts` | **Modify** — skip retired sets; use Brickset for `retirement_date`; return counts |
| `src/app/api/sets/[id]/route.ts` | **Modify** — add `retiring_soon_override` and `override_retirement_date` to the PATCH field whitelist |
| `src/app/(dashboard)/dashboard/page.tsx` | **Modify** — pass `retirement_status` through `enrichedSets` |
| `src/components/SearchableInventory.tsx` | **Modify** — replace yellow RETIRED badge with colored inline badge |
| `src/app/(dashboard)/sets/[id]/page.tsx` | **Modify** — add admin override section |

---

## Chunk 1: Brickset Library

### Task 1: `src/lib/brickset.ts` — Brickset API client

**Files:**
- Create: `src/lib/brickset.ts`
- Create: `src/__tests__/brickset.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/__tests__/brickset.test.ts
import { fetchRetirementDate } from '../lib/brickset'

const mockFetch = jest.fn()
global.fetch = mockFetch

beforeEach(() => {
  mockFetch.mockReset()
  process.env.BRICKSET_API_KEY = 'test-key'
})

function makeResponse(sets: object[]): Response {
  return {
    ok: true,
    json: async () => ({ status: 'success', sets }),
  } as unknown as Response
}

test('returns parsed Date when exitDate present on first suffix', async () => {
  mockFetch.mockResolvedValueOnce(makeResponse([{ exitDate: '2023-12-31T00:00:00Z' }]))
  const result = await fetchRetirementDate('10270')
  expect(result).toEqual(new Date('2023-12-31T00:00:00Z'))
  expect(mockFetch).toHaveBeenCalledTimes(1)
  expect(mockFetch.mock.calls[0][0]).toContain('10270-1')
})

test('falls back to bare set number when first suffix returns empty sets', async () => {
  mockFetch
    .mockResolvedValueOnce(makeResponse([]))
    .mockResolvedValueOnce(makeResponse([{ exitDate: '2024-06-01T00:00:00Z' }]))
  const result = await fetchRetirementDate('75192')
  expect(result).toEqual(new Date('2024-06-01T00:00:00Z'))
  expect(mockFetch).toHaveBeenCalledTimes(2)
})

test('returns null when exitDate is absent', async () => {
  mockFetch.mockResolvedValueOnce(makeResponse([{ number: '10270-1' }]))
  const result = await fetchRetirementDate('10270')
  expect(result).toBeNull()
})

test('returns null when API status is not success', async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ status: 'error', message: 'Invalid key' }),
  } as unknown as Response)
  const result = await fetchRetirementDate('10270')
  expect(result).toBeNull()
})

test('returns null and does not throw when fetch throws (timeout/network)', async () => {
  mockFetch.mockRejectedValue(new Error('AbortError'))
  const result = await fetchRetirementDate('10270')
  expect(result).toBeNull()
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/jasonchiu/Desktop/code_test/lego-inventory
npx jest src/__tests__/brickset.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '../lib/brickset'`

- [ ] **Step 3: Implement `src/lib/brickset.ts`**

```typescript
// src/lib/brickset.ts

async function fetchWithTimeout(url: string, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(id)
  }
}

export async function fetchRetirementDate(setNumber: string): Promise<Date | null> {
  const suffixes = [`${setNumber}-1`, setNumber]
  for (const s of suffixes) {
    try {
      const params = encodeURIComponent(JSON.stringify({ setNumber: s }))
      const url = `https://brickset.com/api/v3.asmx/getSets?apiKey=${process.env.BRICKSET_API_KEY}&userHash=&params=${params}`
      const res = await fetchWithTimeout(url)
      if (!res.ok) continue
      const data = await res.json()
      if (data.status !== 'success' || !data.sets?.length) continue
      const exitDate = data.sets[0].exitDate
      return exitDate ? new Date(exitDate) : null
    } catch {
      // timeout, network error, or JSON parse error — try next suffix
    }
  }
  return null
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest src/__tests__/brickset.test.ts --no-coverage
```

Expected: 5 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/lib/brickset.ts src/__tests__/brickset.test.ts
git commit -m "feat: add brickset library for retirement date fetching"
```

---

## Chunk 2: Retirement Status Logic

### Task 2: `getRetirementStatus()` in `src/lib/recommendations.ts`

**Files:**
- Modify: `src/lib/recommendations.ts`
- Modify: `src/__tests__/recommendations.test.ts`

- [ ] **Step 1: Read the existing files**

Read `src/lib/recommendations.ts` and `src/__tests__/recommendations.test.ts` to understand the existing structure before modifying.

- [ ] **Step 2: Write the failing tests**

Append to `src/__tests__/recommendations.test.ts`:

```typescript
import { getRetirementStatus } from '../lib/recommendations'

function makeSet(overrides: {
  retirement_date?: string | null
  override_retired?: boolean | null
  retiring_soon_override?: boolean | null
}) {
  return {
    retirement_date: null,
    override_retired: null,
    retiring_soon_override: null,
    ...overrides,
  }
}

describe('getRetirementStatus', () => {
  test('returns Retired when override_retired is true', () => {
    expect(getRetirementStatus(makeSet({ override_retired: true }))).toBe('Retired')
  })

  test('returns Retired when retirement_date is in the past', () => {
    expect(getRetirementStatus(makeSet({ retirement_date: '2020-01-01' }))).toBe('Retired')
  })

  test('auto-Retired (past retirement_date) wins over retiring_soon_override', () => {
    // A past retirement_date means the set IS retired — retiring_soon_override cannot override that
    expect(getRetirementStatus(makeSet({ retirement_date: '2020-01-01', retiring_soon_override: true }))).toBe('Retired')
  })

  test('returns Retiring Soon when retiring_soon_override is true and no retirement_date', () => {
    expect(getRetirementStatus(makeSet({ retiring_soon_override: true }))).toBe('Retiring Soon')
  })

  test('returns Retiring Soon when retirement_date is within 6 months', () => {
    const soon = new Date()
    soon.setMonth(soon.getMonth() + 3)
    const soonStr = soon.toISOString().slice(0, 10)
    expect(getRetirementStatus(makeSet({ retirement_date: soonStr }))).toBe('Retiring Soon')
  })

  test('returns Active when retirement_date is beyond 6 months', () => {
    const far = new Date()
    far.setFullYear(far.getFullYear() + 2)
    const farStr = far.toISOString().slice(0, 10)
    expect(getRetirementStatus(makeSet({ retirement_date: farStr }))).toBe('Active')
  })

  test('returns Active when all fields are null', () => {
    expect(getRetirementStatus(makeSet({}))).toBe('Active')
  })

  test('override_retired wins over retiring_soon_override', () => {
    expect(getRetirementStatus(makeSet({ override_retired: true, retiring_soon_override: true }))).toBe('Retired')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx jest src/__tests__/recommendations.test.ts --no-coverage
```

Expected: FAIL — `getRetirementStatus is not a function`

- [ ] **Step 4: Add `RetirementStatus` type and `getRetirementStatus()` to `src/lib/recommendations.ts`**

Add at the top of the file (after imports):

```typescript
export type RetirementStatus = 'Retired' | 'Retiring Soon' | 'Active'
```

Add as a new exported function (does NOT modify existing functions):

```typescript
export function getRetirementStatus(set: {
  retirement_date: string | null
  override_retired: boolean | null
  retiring_soon_override: boolean | null
}): RetirementStatus {
  // Manual Retired override wins first
  if (set.override_retired) return 'Retired'

  // Auto-Retired: past retirement_date (beats retiring_soon_override per spec priority table)
  const todayStr = new Date().toISOString().slice(0, 10)
  if (set.retirement_date && set.retirement_date <= todayStr) return 'Retired'

  // Manual Retiring Soon override (only applies when not already auto-Retired)
  if (set.retiring_soon_override) return 'Retiring Soon'

  // Auto Retiring Soon: future date within 6 months
  if (set.retirement_date) {
    const sixMonthsFromNow = new Date()
    sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6)
    const sixMonthsStr = sixMonthsFromNow.toISOString().slice(0, 10)
    if (set.retirement_date <= sixMonthsStr) return 'Retiring Soon'
  }

  return 'Active'
}
```

- [ ] **Step 5: Run all tests**

```bash
npx jest --no-coverage
```

Expected: All tests pass, no regressions

- [ ] **Step 6: Commit**

```bash
git add src/lib/recommendations.ts src/__tests__/recommendations.test.ts
git commit -m "feat: add getRetirementStatus() with Retired/Retiring Soon/Active logic"
```

---

## Chunk 3: Database Migration & TypeScript Types

### Task 3: Add `retiring_soon_override` column and update TypeScript types

**Files:**
- Modify: `src/types/inventory.ts`

- [ ] **Step 1: Read `src/types/inventory.ts`**

Read the file to see the current `SetRow` and `GroupedSet` interfaces.

- [ ] **Step 2: Add a temporary reference to trigger type failures**

In `src/app/(dashboard)/dashboard/page.tsx` (which will be modified in Task 6), add a temporary no-op line that references the new fields to confirm the compiler does not yet know about them:

```typescript
// @ts-expect-error — will be removed after types are added
const _typeCheck: string | null = (null as any).retirement_date
const _typeCheck2: boolean | null = (null as any).retiring_soon_override
const _typeCheck3: string | null = (null as any).override_retirement_date
```

- [ ] **Step 3: Verify the compiler fails without the type changes**

```bash
npx tsc --noEmit
```

Expected: TypeScript errors confirming `retirement_date`, `retiring_soon_override`, and `override_retirement_date` are not yet on the types (or confirm the existing types lack them). If the project already has partial type definitions, note which fields are missing.

Remove the temporary lines from `dashboard/page.tsx` after confirming.

- [ ] **Step 4: Run the DB migration in Supabase**

In the Supabase SQL Editor (https://supabase.com → your project → SQL Editor), run:

```sql
ALTER TABLE sets ADD COLUMN IF NOT EXISTS retiring_soon_override BOOLEAN DEFAULT false;
```

Expected: `Success. No rows returned.`

Note: `retirement_date` and `override_retired` already exist per the design spec.

- [ ] **Step 5: Update `src/types/inventory.ts`**

In the `SetRow` interface (or equivalent), add:

```typescript
retirement_date: string | null           // ISO date string e.g. "2023-12-31", or null
retiring_soon_override: boolean | null
override_retirement_date: string | null  // Admin-set date override (already exists in DB)
```

These join the existing `override_retired: boolean | null` field.

In `GroupedSet` (if it extends or re-declares these fields), add the same three fields.

- [ ] **Step 6: Run the TypeScript compiler to verify types now compile**

```bash
npx tsc --noEmit
```

Expected: No errors. Fix any type errors that surface (e.g., places that construct `SetRow` objects without the new fields — add `retirement_date: null, retiring_soon_override: null, override_retirement_date: null` to satisfy the type).

- [ ] **Step 7: Commit**

```bash
git add src/types/inventory.ts
git commit -m "feat: add retiring_soon_override, retirement_date, override_retirement_date to TypeScript types"
```

---

## Chunk 4: Backend Routes

### Task 4: Update `src/app/api/lego-status/route.ts` to call Brickset

**Files:**
- Modify: `src/app/api/lego-status/route.ts`

- [ ] **Step 1: Read `src/app/api/lego-status/route.ts`**

Read the full file to understand the existing Rebrickable upsert flow and 24-hour cache logic. Also read any existing test file for this route (check `src/__tests__/` or `__tests__/` near the route).

- [ ] **Step 2: Write the failing test**

In the existing test file for this route (or create `src/__tests__/lego-status.test.ts`), add a test that verifies `fetchRetirementDate` is called and the result is written to the DB:

```typescript
import { fetchRetirementDate } from '../lib/brickset'

jest.mock('../lib/brickset', () => ({
  fetchRetirementDate: jest.fn(),
}))

const mockFetchRetirementDate = fetchRetirementDate as jest.Mock

// Inside the describe block for the lego-status route:
test('calls fetchRetirementDate and updates retirement_date when result is non-null', async () => {
  // Arrange: mock Rebrickable to succeed (follow existing test setup pattern)
  // Arrange: mock Brickset to return a date
  mockFetchRetirementDate.mockResolvedValueOnce(new Date('2025-06-30'))

  // Act: call the route handler (follow existing test invocation pattern)

  // Assert
  expect(mockFetchRetirementDate).toHaveBeenCalledWith(expect.any(String))
  // Verify supabase update was called with retirement_date: '2025-06-30'
  // (follow existing pattern for asserting Supabase calls in this test file)
})

test('does not update retirement_date when fetchRetirementDate returns null', async () => {
  mockFetchRetirementDate.mockResolvedValueOnce(null)

  // Act: call the route handler

  // Assert: Supabase update for retirement_date was NOT called
  expect(mockFetchRetirementDate).toHaveBeenCalled()
  // Verify no retirement_date update (follow existing assertion pattern)
})
```

Note: Fill in the exact mock setup and invocation by following the existing test structure in the file. The key assertions are that `fetchRetirementDate` is called and that the Supabase `update` is conditionally called.

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx jest src/__tests__/lego-status.test.ts --no-coverage
```

Expected: FAIL — tests fail because `fetchRetirementDate` isn't called yet

- [ ] **Step 4: Add Brickset fetch after Rebrickable upsert**

After the existing Rebrickable `upsert` call (do NOT modify the upsert), add:

```typescript
import { fetchRetirementDate } from '@/lib/brickset'

// After the Rebrickable upsert succeeds:
const retirementDate = await fetchRetirementDate(setNumber)
if (retirementDate !== null) {
  const dateStr = retirementDate.toISOString().slice(0, 10)
  await supabase
    .from('sets')
    .update({ retirement_date: dateStr })
    .eq('set_number', setNumber)
  // Note: ignore update errors — retirement date is supplementary
}
```

Key constraints:
- Do NOT change the Rebrickable upsert — it handles `retired`, `name`, `theme`, etc.
- Do NOT change the 24-hour cache logic
- The Brickset call is non-blocking for the response — if it fails, set is still added

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx jest src/__tests__/lego-status.test.ts --no-coverage
```

Expected: All tests in this file pass.

- [ ] **Step 6: Run the full test suite**

```bash
npx jest --no-coverage
```

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/lego-status/route.ts src/__tests__/lego-status.test.ts
git commit -m "feat: fetch Brickset retirement date when set is added"
```

---

### Task 5: Update admin refresh + extend existing sets PATCH route

**Files:**
- Modify: `src/app/api/admin/sets/refresh/route.ts`
- Modify: `src/app/api/sets/[id]/route.ts`

- [ ] **Step 1: Read both files**

Read `src/app/api/admin/sets/refresh/route.ts` and `src/app/api/sets/[id]/route.ts` in full. Also read any existing test files for these routes.

- [ ] **Step 2: Write failing tests for the refresh route**

In the existing test file for the refresh route (or create `src/__tests__/admin-refresh.test.ts`), add:

```typescript
import { fetchRetirementDate } from '../lib/brickset'

jest.mock('../lib/brickset', () => ({
  fetchRetirementDate: jest.fn(),
}))

const mockFetchRetirementDate = fetchRetirementDate as jest.Mock

// Follow existing test setup pattern for the refresh route

test('skips sets where retired is true', async () => {
  // Arrange: mock Supabase to return a set with retired=true
  // Act: call the refresh handler
  // Assert: fetchRetirementDate was NOT called
  expect(mockFetchRetirementDate).not.toHaveBeenCalled()
})

test('skips sets where override_retired is true', async () => {
  // Arrange: mock Supabase to return a set with override_retired=true
  // Act: call the refresh handler
  // Assert: fetchRetirementDate was NOT called
  expect(mockFetchRetirementDate).not.toHaveBeenCalled()
})

test('calls fetchRetirementDate for non-retired sets and updates DB', async () => {
  // Arrange: mock Supabase to return a set with retired=false
  mockFetchRetirementDate.mockResolvedValueOnce(new Date('2020-01-01'))
  // Act: call the refresh handler
  // Assert: fetchRetirementDate was called; supabase update called with retirement_date + retired=true
})

test('returns counts including skipped_retired and refreshed', async () => {
  // Assert response body contains { total, skipped_retired, refreshed, failed }
})
```

Fill in the mock setup following the existing test patterns for the refresh route.

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx jest src/__tests__/admin-refresh.test.ts --no-coverage
```

Expected: FAIL

- [ ] **Step 4: Update the refresh route**

Replace the per-set processing logic so that:

1. Sets where `retired = true` OR `override_retired = true` are **skipped** (no Brickset call needed — permanently retired)
2. For all other sets: call `fetchRetirementDate()` and update both `retirement_date` and `retired` fields:

```typescript
import { fetchRetirementDate } from '@/lib/brickset'

// Inside the per-set loop:
if (set.retired || set.override_retired) {
  skipped_retired++
  continue
}

const retirementDate = await fetchRetirementDate(set.set_number)
if (retirementDate !== null) {
  const dateStr = retirementDate.toISOString().slice(0, 10)
  const isRetired = retirementDate <= new Date()
  const { error } = await supabase
    .from('sets')
    .update({ retirement_date: dateStr, retired: isRetired })
    .eq('set_number', set.set_number)
  if (error) {
    failed.push(set.set_number)
  } else {
    refreshed++
  }
}
```

Return counts in the response body:

```typescript
return Response.json({ total, skipped_retired, refreshed, failed })
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx jest src/__tests__/admin-refresh.test.ts --no-coverage
```

Expected: All tests pass.

- [ ] **Step 6: Write failing tests for the PATCH whitelist extension**

In the existing test file for `sets/[id]/route.ts` (or create one following the project's test patterns), add:

```typescript
// Verify that the new fields are accepted (not rejected as invalid)
test('PATCH accepts retiring_soon_override field', async () => {
  // Arrange: authenticated user, valid set id
  // Act: PATCH /api/sets/[id] with body { retiring_soon_override: true }
  // Assert: response is 200, not 400 "invalid field"
})

test('PATCH accepts override_retirement_date field', async () => {
  // Arrange: authenticated user, valid set id
  // Act: PATCH /api/sets/[id] with body { override_retirement_date: '2025-12-31' }
  // Assert: response is 200, not 400 "invalid field"
})
```

Follow the exact mock and invocation pattern already used in the existing tests for this route.

- [ ] **Step 7: Run tests to verify they fail**

```bash
npx jest --testPathPattern="sets.*\\[id\\]" --no-coverage
```

Expected: FAIL — new fields rejected as invalid

- [ ] **Step 8: Extend `src/app/api/sets/[id]/route.ts` PATCH whitelist**

The existing PATCH handler has a field whitelist (an array or object of allowed fields). Add `retiring_soon_override` and `override_retirement_date` to that whitelist so the admin UI can write them via `PATCH /api/sets/[id]`.

Do NOT change any auth logic — the existing route already requires authentication. Do NOT add admin-only gating here; the admin UI only renders for admin users (checked client-side in Task 7).

Example — if the existing whitelist looks like:

```typescript
const ALLOWED_FIELDS = ['quantity', 'notes', 'override_retired', ...]
```

Add to it:

```typescript
const ALLOWED_FIELDS = ['quantity', 'notes', 'override_retired', 'retiring_soon_override', 'override_retirement_date', ...]
```

Match the exact pattern already used in that file.

- [ ] **Step 9: Run tests to verify they pass**

```bash
npx jest --testPathPattern="sets.*\\[id\\]" --no-coverage
```

Expected: All tests pass including the two new ones.

- [ ] **Step 10: Run the full test suite**

```bash
npx jest --no-coverage
```

Expected: All tests pass.

- [ ] **Step 11: Commit**

```bash
git add src/app/api/admin/sets/refresh/route.ts src/app/api/sets/[id]/route.ts
git commit -m "feat: update admin refresh to use Brickset; extend sets PATCH for override fields"
```

---

## Chunk 5: Frontend

### Task 6: Update dashboard badge in `src/components/SearchableInventory.tsx`

**Files:**
- Modify: `src/app/(dashboard)/dashboard/page.tsx`
- Modify: `src/components/SearchableInventory.tsx`

- [ ] **Step 1: Read both files**

Read `src/app/(dashboard)/dashboard/page.tsx` and `src/components/SearchableInventory.tsx`. Check for any existing component test files (e.g., `src/__tests__/SearchableInventory.test.tsx`).

- [ ] **Step 2: Write failing tests for the badge rendering**

In the existing test file or create `src/__tests__/SearchableInventory.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react'
import SearchableInventory from '../components/SearchableInventory'

// Build a minimal set object — follow the shape already used in existing tests
function makeSet(retirement_status: 'Retired' | 'Retiring Soon' | 'Active') {
  return {
    // copy the minimal required fields from existing test fixtures
    retirement_status,
    // ... other required fields
  }
}

test('shows red RETIRED badge when retirement_status is Retired', () => {
  render(<SearchableInventory sets={[makeSet('Retired')]} />)
  expect(screen.getByText('RETIRED')).toBeInTheDocument()
})

test('shows amber RETIRING SOON badge when retirement_status is Retiring Soon', () => {
  render(<SearchableInventory sets={[makeSet('Retiring Soon')]} />)
  expect(screen.getByText('RETIRING SOON')).toBeInTheDocument()
})

test('shows no retirement badge when retirement_status is Active', () => {
  render(<SearchableInventory sets={[makeSet('Active')]} />)
  expect(screen.queryByText('RETIRED')).not.toBeInTheDocument()
  expect(screen.queryByText('RETIRING SOON')).not.toBeInTheDocument()
})
```

Note: Check what props `SearchableInventory` accepts and what a set object looks like in existing tests. Adapt accordingly.

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx jest src/__tests__/SearchableInventory.test.tsx --no-coverage
```

Expected: FAIL — badges not rendered yet

- [ ] **Step 4: Update `dashboard/page.tsx` to pass retirement fields**

In the `enrichedSets` mapping (where `recommendation` is computed), also call `getRetirementStatus()` and include the result:

```typescript
import { getRecommendation, getRetirementStatus } from '@/lib/recommendations'

// In the set mapping:
const retirement_status = getRetirementStatus({
  retirement_date: set.retirement_date ?? null,
  override_retired: set.override_retired ?? null,
  retiring_soon_override: set.retiring_soon_override ?? null,
})

// Include in the enriched set object:
{ ...set, recommendation, retirement_status }
```

- [ ] **Step 5: Update `SearchableInventory.tsx` to show colored badge**

Find the existing yellow `RETIRED` badge (currently shown inline with the set name or similar). Replace it with a badge driven by `retirement_status`:

```tsx
{/* Remove existing yellow RETIRED badge */}

{/* Add to the tag row (inline with SELL/HOLD recommendation and price): */}
{set.retirement_status === 'Retired' && (
  <span className="bg-red-600 text-white text-[10px] font-bold px-[7px] py-[2px] rounded-[3px] tracking-wide">
    RETIRED
  </span>
)}
{set.retirement_status === 'Retiring Soon' && (
  <span className="bg-amber-600 text-white text-[10px] font-bold px-[7px] py-[2px] rounded-[3px] tracking-wide">
    RETIRING SOON
  </span>
)}
{/* Active: no badge shown */}
```

Place this badge BEFORE the SELL/HOLD tag in the tag row so it reads: `[RETIRED] [SELL] Avg $280`

- [ ] **Step 6: Run badge tests to verify they pass**

```bash
npx jest src/__tests__/SearchableInventory.test.tsx --no-coverage
```

Expected: All 3 badge tests pass.

- [ ] **Step 7: Run the full test suite**

```bash
npx jest --no-coverage
```

Expected: All tests pass. If any snapshot tests fail due to badge changes, update them with `npx jest --updateSnapshot`.

- [ ] **Step 8: Smoke test in the browser**

```bash
npm run dev
```

Open `http://localhost:3000`. Verify:
- Retired sets show red `RETIRED` badge inline with recommendation
- Active sets show no badge
- If you have a set with a near-future `retirement_date`, it should show `RETIRING SOON` in amber

- [ ] **Step 9: Commit**

```bash
git add src/app/(dashboard)/dashboard/page.tsx src/components/SearchableInventory.tsx src/__tests__/SearchableInventory.test.tsx
git commit -m "feat: show Retired/Retiring Soon badges on dashboard cards"
```

---

### Task 7: Add admin override UI in `src/app/(dashboard)/sets/[id]/page.tsx`

**Files:**
- Modify: `src/app/(dashboard)/sets/[id]/page.tsx`

- [ ] **Step 1: Read `src/app/(dashboard)/sets/[id]/page.tsx`**

Read the full file — understand the existing edit/sell modals, the client component structure, and how the current user is determined.

- [ ] **Step 2: Fetch current user in the component**

The component needs to know if the current user is admin. Add a `useEffect` that calls `/api/admin/sets/{set_number}` is not the right approach — instead, check the user's email from the Supabase client:

```typescript
const [isAdmin, setIsAdmin] = useState(false)

useEffect(() => {
  supabase.auth.getUser().then(({ data: { user } }) => {
    setIsAdmin(user?.email === 'jasonchiu0803@gmail.com')
  })
}, [])
```

Follow the existing pattern for how this component accesses `supabase` (client-side).

- [ ] **Step 3: Add admin override section**

Below the existing set details and above or below the existing action buttons, add (only rendered when `isAdmin`):

```tsx
{isAdmin && (
  <div className="mt-6 border border-gray-700 rounded-lg p-4">
    <h3 className="text-sm font-semibold text-gray-300 mb-3">Admin Overrides</h3>

    <label className="flex items-center gap-2 mb-3 cursor-pointer">
      <input
        type="checkbox"
        checked={!!set.override_retired}
        onChange={async (e) => {
          await fetch(`/api/sets/${set.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ override_retired: e.target.checked }),
          })
          router.refresh()
        }}
        className="w-4 h-4"
      />
      <span className="text-sm text-gray-300">Mark as Retired (manual override)</span>
    </label>

    <label className="flex items-center gap-2 mb-3 cursor-pointer">
      <input
        type="checkbox"
        checked={!!set.retiring_soon_override}
        onChange={async (e) => {
          await fetch(`/api/sets/${set.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ retiring_soon_override: e.target.checked }),
          })
          router.refresh()
        }}
        className="w-4 h-4"
      />
      <span className="text-sm text-gray-300">Mark as Retiring Soon (manual override)</span>
    </label>

    <div className="mb-1">
      <label className="text-sm text-gray-400 block mb-1">Override retirement date</label>
      <input
        type="date"
        defaultValue={set.override_retirement_date ?? ''}
        onBlur={async (e) => {
          if (!e.target.value) return
          await fetch(`/api/sets/${set.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ override_retirement_date: e.target.value }),
          })
          router.refresh()
        }}
        className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white"
      />
    </div>
  </div>
)}
```

Follow the existing styling conventions (dark theme, Tailwind classes) already in the file.

- [ ] **Step 4: Run the full test suite**

```bash
npx jest --no-coverage
```

Expected: All tests pass.

- [ ] **Step 5: Smoke test the admin UI**

Open `http://localhost:3000` → navigate to any set's detail page → verify the admin section appears → toggle "Mark as Retiring Soon" → go back to dashboard → verify the amber badge appears.

- [ ] **Step 6: Commit**

```bash
git add src/app/(dashboard)/sets/[id]/page.tsx
git commit -m "feat: add admin override UI for retirement status on set detail page"
```

---

## Post-Implementation

- [ ] **Add `BRICKSET_API_KEY` to Vercel environment variables**

In Vercel dashboard → Settings → Environment Variables, add:
- `BRICKSET_API_KEY` = `3-4QYR-YXBB-DzGaV`

Then redeploy (or it picks up on next push).

- [ ] **Run admin refresh to backfill retirement dates**

Once deployed, go to the admin panel and trigger a refresh. This will call Brickset for all non-retired sets and populate `retirement_date`.
