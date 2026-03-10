# Inventory Search — Design Document

**Date:** 2026-03-09  
**Status:** Approved

---

## Overview

Add a real-time search input to the dashboard home screen that lets users filter their active inventory by set number or name. The goal is fast, frictionless lookup — type a few characters, instantly see the matching set(s).

---

## Goals

- Filter the active inventory list in real time without a page reload
- Match on set number (e.g. `10270`) and set name (e.g. `Bookshop`), case-insensitive substring
- Show filtered count in the "Active Inventory" heading while a query is active
- Provide a clear (×) button to reset the search
- Match the existing dark UI theme exactly — no new visual patterns

---

## Non-Goals

- Looking up sets not in the user's inventory
- Server-side search or new API routes
- Searching sold history
- Any database schema changes

---

## Architecture

No new API routes, no database changes, no new dependencies.

The `DashboardPage` server component continues fetching all inventory data from Supabase as it does today. The only structural change is extracting the active inventory list section into a new `SearchableInventory` client component.

```
DashboardPage (server component)
  ├── <nav>                          ← unchanged
  ├── Stats bar                      ← unchanged
  ├── <SearchableInventory>          ← NEW client component
  │     ├── search input + clear btn
  │     └── filtered set cards       ← same markup as today
  └── Sold History                   ← unchanged
```

---

## Component: `SearchableInventory`

**File:** `src/components/SearchableInventory.tsx`

**Props:**
```ts
interface Props {
  groupedSets: GroupedSet[]
}
```

**Behavior:**
- Controlled `<input>` with `useState` for the query string
- On each keystroke, filter `groupedSets` where `set_number` or `name` contains the query (case-insensitive)
- Empty query → show all sets (identical to current behavior)
- Non-empty query with no matches → show a "No sets match" empty state
- The "Active Inventory (N sets)" heading reflects the filtered count, not the total
- A small × button clears the input when non-empty

**UI:**
- Search input placed between the stats bar and the "Active Inventory" heading
- Styled to match existing dark theme: `bg-[#2A2A2A] border border-gray-700 rounded-xl`
- Placeholder text: `Search by set number or name…`
- Set cards inside use the exact same JSX as today (extracted from `DashboardPage`)

---

## Files Changed

| File | Change |
|------|--------|
| `src/components/SearchableInventory.tsx` | New client component |
| `src/app/(dashboard)/dashboard/page.tsx` | Pass `groupedSets` to `<SearchableInventory>` instead of rendering the list inline |

---

## Testing

Manual verification:
1. Type a set number — matching card(s) appear, others disappear
2. Type a name substring — matching card(s) appear
3. Clear the input (× button) — full list restored
4. Type a string that matches nothing — empty state shown
5. Empty inventory state still shows the "Add Sets" prompt
