# Inventory Search Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a real-time client-side search input to the dashboard that filters the active inventory list by set number or name.

**Architecture:** The `DashboardPage` server component is unchanged except that it renders a new `<SearchableInventory>` client component instead of the inline inventory list. `SearchableInventory` receives the pre-computed `groupedSets` array as a prop, owns a controlled text input, and filters the list on every keystroke — no new API routes or database changes.

**Tech Stack:** Next.js 15 App Router, React `useState`, TypeScript, Tailwind CSS, Jest + React Testing Library

---

## Context: Key Files

- **Dashboard page (server component):** `src/app/(dashboard)/dashboard/page.tsx`
  - Fetches all inventory from Supabase, computes `groupedSets`, renders the list inline today.
  - We will replace the inline list with `<SearchableInventory groupedSets={groupedSets} />`.
- **Test directory:** `src/__tests__/` — Jest + React Testing Library, `@/` alias maps to `src/`.
- **Run tests:** `npx jest --testPathPattern=SearchableInventory` from the project root.
- **Theme colors:** `bg-[#2A2A2A]`, `border-gray-700`, text `text-white` / `text-gray-400`.

The `GroupedSet` type used in the dashboard is:

```ts
interface GroupedSet {
  set_number: string
  name: string
  theme: string | null
  piece_count: number | null
  retired: boolean
  image_url: string | null
  retail_price: number | null
  items: InventoryItem[]
  total_paid: number
}
```

---

## Task 1: Create `SearchableInventory` with tests

**Files:**
- Create: `src/components/SearchableInventory.tsx`
- Create: `src/__tests__/SearchableInventory.test.tsx`

---

**Step 1: Write the failing tests**

Create `src/__tests__/SearchableInventory.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import SearchableInventory from '@/components/SearchableInventory'

const makeSets = () => [
  {
    set_number: '10270',
    name: 'Bookshop',
    theme: 'Modular Buildings',
    piece_count: 2504,
    retired: false,
    image_url: null,
    retail_price: 179.99,
    items: [{ id: '1', purchase_price_usd: 150, sets: { set_number: '10270' } } as any],
    total_paid: 150,
  },
  {
    set_number: '10297',
    name: 'Boutique Hotel',
    theme: 'Modular Buildings',
    piece_count: 3068,
    retired: false,
    image_url: null,
    retail_price: 229.99,
    items: [{ id: '2', purchase_price_usd: 200, sets: { set_number: '10297' } } as any],
    total_paid: 200,
  },
]

describe('SearchableInventory', () => {
  it('renders all sets when query is empty', () => {
    render(<SearchableInventory groupedSets={makeSets()} />)
    expect(screen.getByText('Bookshop')).toBeInTheDocument()
    expect(screen.getByText('Boutique Hotel')).toBeInTheDocument()
  })

  it('filters by set number substring', () => {
    render(<SearchableInventory groupedSets={makeSets()} />)
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: '10270' } })
    expect(screen.getByText('Bookshop')).toBeInTheDocument()
    expect(screen.queryByText('Boutique Hotel')).not.toBeInTheDocument()
  })

  it('filters by name substring (case-insensitive)', () => {
    render(<SearchableInventory groupedSets={makeSets()} />)
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'book' } })
    expect(screen.getByText('Bookshop')).toBeInTheDocument()
    expect(screen.queryByText('Boutique Hotel')).not.toBeInTheDocument()
  })

  it('shows empty state when no sets match', () => {
    render(<SearchableInventory groupedSets={makeSets()} />)
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'zzznomatch' } })
    expect(screen.getByText(/no sets match/i)).toBeInTheDocument()
  })

  it('shows filtered count in heading', () => {
    render(<SearchableInventory groupedSets={makeSets()} />)
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: '10270' } })
    expect(screen.getByText(/active inventory \(1 set\)/i)).toBeInTheDocument()
  })

  it('clears search when × button is clicked', () => {
    render(<SearchableInventory groupedSets={makeSets()} />)
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'book' } })
    fireEvent.click(screen.getByRole('button', { name: /clear/i }))
    expect(screen.getByText('Bookshop')).toBeInTheDocument()
    expect(screen.getByText('Boutique Hotel')).toBeInTheDocument()
  })

  it('shows "Add Sets" empty state when inventory itself is empty', () => {
    render(<SearchableInventory groupedSets={[]} />)
    expect(screen.getByText(/no sets yet/i)).toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/search/i)).not.toBeInTheDocument()
  })
})
```

---

**Step 2: Run tests to confirm they fail**

```bash
npx jest --testPathPattern=SearchableInventory --no-coverage
```

Expected: FAIL — `Cannot find module '@/components/SearchableInventory'`

---

**Step 3: Implement `SearchableInventory`**

Create `src/components/SearchableInventory.tsx`:

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'

interface InventoryItem {
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
  }
}

interface GroupedSet {
  set_number: string
  name: string
  theme: string | null
  piece_count: number | null
  retired: boolean
  image_url: string | null
  retail_price: number | null
  items: InventoryItem[]
  total_paid: number
}

interface Props {
  groupedSets: GroupedSet[]
}

export default function SearchableInventory({ groupedSets }: Props) {
  const [query, setQuery] = useState('')

  const filtered = query.trim()
    ? groupedSets.filter(g =>
        g.set_number.toLowerCase().includes(query.toLowerCase()) ||
        g.name.toLowerCase().includes(query.toLowerCase())
      )
    : groupedSets

  const count = filtered.length
  const label = `Active Inventory (${count} ${count === 1 ? 'set' : 'sets'})`

  if (groupedSets.length === 0) {
    return (
      <>
        <h2 className="text-white font-semibold mb-3">Active Inventory (0 sets)</h2>
        <div className="bg-[#2A2A2A] border border-gray-700 rounded-xl p-8 text-center mb-6">
          <p className="text-4xl mb-3">🧱</p>
          <p className="text-white font-medium">No sets yet</p>
          <p className="text-gray-400 text-sm mt-1 mb-4">Add your first set to get started</p>
          <Link href="/upload" className="inline-block bg-[#DA291C] text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-red-700">
            Add Sets
          </Link>
        </div>
      </>
    )
  }

  return (
    <>
      {/* Search input */}
      <div className="relative mb-3">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by set number or name…"
          className="w-full bg-[#2A2A2A] border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-gray-500 pr-8"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-lg leading-none"
          >
            ×
          </button>
        )}
      </div>

      <h2 className="text-white font-semibold mb-3">{label}</h2>

      {filtered.length === 0 ? (
        <div className="bg-[#2A2A2A] border border-gray-700 rounded-xl p-8 text-center mb-6">
          <p className="text-gray-400 text-sm">No sets match &ldquo;{query}&rdquo;</p>
        </div>
      ) : (
        <div className="space-y-3 mb-8">
          {filtered.map(group => (
            <Link
              key={group.set_number}
              href={`/sets/${group.set_number}`}
              className="bg-[#2A2A2A] border border-gray-700 rounded-xl p-4 flex items-center gap-4 hover:border-gray-500 transition-colors block"
            >
              {group.image_url ? (
                <img
                  src={group.image_url}
                  alt={group.name}
                  className="w-16 h-16 object-contain rounded-lg bg-white p-1 flex-shrink-0"
                />
              ) : (
                <div className="w-16 h-16 bg-gray-700 rounded-lg flex items-center justify-center flex-shrink-0">
                  <span className="text-2xl">🧱</span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-white font-medium truncate">{group.name}</p>
                  {group.retired && (
                    <span className="bg-yellow-900/50 text-yellow-400 text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0">
                      RETIRED
                    </span>
                  )}
                </div>
                <p className="text-gray-400 text-xs">
                  #{group.set_number} · {group.theme} · {group.piece_count?.toLocaleString()} pcs
                </p>
                <p className="text-gray-400 text-xs mt-0.5">
                  {group.items.length} {group.items.length === 1 ? 'copy' : 'copies'} · Paid $
                  {group.total_paid.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-xs text-gray-500">Resale</p>
                <p className="text-gray-400 text-sm">— coming soon</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
```

---

**Step 4: Run tests to confirm they pass**

```bash
npx jest --testPathPattern=SearchableInventory --no-coverage
```

Expected: All 7 tests PASS.

---

**Step 5: Commit**

```bash
git add src/components/SearchableInventory.tsx src/__tests__/SearchableInventory.test.tsx
git commit -m "feat: add SearchableInventory client component with tests"
```

---

## Task 2: Wire `SearchableInventory` into the dashboard

**Files:**
- Modify: `src/app/(dashboard)/dashboard/page.tsx`

---

**Step 1: Replace the inline active inventory section**

In `src/app/(dashboard)/dashboard/page.tsx`:

1. Add this import near the top (after existing imports):

```ts
import SearchableInventory from '@/components/SearchableInventory'
```

2. Find the block that starts with `{/* Active Inventory */}` and ends just before `{/* Sold History */}`. It currently contains the `<h2>` heading and either the "No sets yet" empty state or the `groupedSets.map(...)` list.

Replace that entire block with:

```tsx
<SearchableInventory groupedSets={groupedSets} />
```

3. The rest of the file (nav, stats bar, sold history) stays untouched.

---

**Step 2: Verify the app renders correctly**

Start the dev server if not already running:

```bash
npm run dev
```

Open `http://localhost:3000/dashboard` and verify:
- All existing sets are visible (no regression)
- A search input appears between the stats bar and the inventory list
- Typing a set number filters the list in real time
- Typing a name (or partial name) filters the list
- The × button clears the input and restores the full list
- The heading count updates as you filter

---

**Step 3: Commit**

```bash
git add src/app/(dashboard)/dashboard/page.tsx
git commit -m "feat: wire SearchableInventory into dashboard"
```

---

## Task 3: Run full test suite

```bash
npx jest --no-coverage
```

Expected: All existing tests continue to pass alongside the new ones.

---

## Done

The feature is complete when:
- `SearchableInventory` tests all pass
- The full test suite passes
- Manual verification in the browser confirms correct filtering behavior
