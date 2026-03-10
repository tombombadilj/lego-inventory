# LEGO Inventory Tool — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a mobile-friendly web app to inventory sealed LEGO sets with OCR-based photo detection, resale price tracking, sell recommendations, and configurable alerts.

**Architecture:** Next.js 14 (App Router) frontend + API routes, Supabase for PostgreSQL database / auth / photo storage, Google Cloud Vision for OCR, Rebrickable for set metadata, eBay Finding API for resale prices (completed/sold listings). QA and prod are separate Supabase projects swapped via environment variables.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, Supabase JS (`@supabase/supabase-js`, `@supabase/ssr`), Jest, React Testing Library, Google Cloud Vision API, Rebrickable API

---

## Prerequisites & Account Setup

Complete all account setup before writing any code. None of these require payment except Google Cloud (credit card on file, not charged for normal usage).

---

### 1. GitHub (free, no credit card)

1. Go to [github.com](https://github.com) → Sign up if you don't have an account
2. Install GitHub CLI: `brew install gh`
3. Authenticate: `gh auth login` → choose **GitHub.com → HTTPS → Login with a web browser**
4. Verify: `gh auth status` should show your username

---

### 2. Supabase — QA Project (free, no credit card)

1. Go to [supabase.com](https://supabase.com) → Sign up with GitHub (easiest)
2. Click **New project** → name it `lego-inventory-qa`
3. Set a strong database password — save it in a password manager
4. Choose the region closest to you
5. Wait ~2 minutes for provisioning
6. Go to **Settings → API** and copy:
   - `Project URL` → save as `NEXT_PUBLIC_SUPABASE_URL` (QA)
   - `anon public` key → save as `NEXT_PUBLIC_SUPABASE_ANON_KEY` (QA)
   - `service_role` key → save as `SUPABASE_SERVICE_ROLE_KEY` (QA)

> **Note:** Supabase pauses free projects after 7 days of inactivity. If your QA project is paused, go to the Supabase dashboard and click **Restore** — it takes about 30 seconds and is free.

---

### 3. Google Cloud Vision API (free tier — credit card required but not charged)

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → Sign in with a Google account
2. Create a new project → name it `lego-inventory`
3. Go to **APIs & Services → Library** → search for "Cloud Vision API" → click **Enable**
4. Go to **APIs & Services → Credentials** → **Create Credentials → API key**
5. Copy the key → save as `GOOGLE_CLOUD_VISION_API_KEY`
6. Click **Edit API key** → under **API restrictions**, restrict it to **Cloud Vision API** only (security best practice)
7. Go to **Billing** → link a billing account (credit card required). You will **not** be charged unless you exceed 1,000 API calls in a month

---

### 4. Rebrickable API (free, no credit card)

1. Go to [rebrickable.com](https://rebrickable.com) → Sign up for a free account
2. Go to [rebrickable.com/api](https://rebrickable.com/api/) → scroll to **API Keys** → click **Generate new key**
3. Copy the key → save as `REBRICKABLE_API_KEY`

---

### 5. eBay Developer API (free, no credit card)

1. Go to [developer.ebay.com](https://developer.ebay.com) → sign in with your eBay account (or create a free one)
2. Click **Get Started** → **Create Account** if prompted
3. Go to **Hi [name] → Application Access** → **Get an App ID**
4. Create a new application → name: `LEGO Inventory`
5. Copy the **App ID (Client ID)** → `EBAY_APP_ID`

> Note: We use the eBay Finding API which only requires an App ID — no OAuth token needed for read-only price searches.

---

### 6. Vercel (free, no credit card)

1. Go to [vercel.com](https://vercel.com) → Sign up with GitHub
2. No further setup needed now — you'll connect your repo during Task 12 (deployment)

---

### Store all keys in `.env.local`

Once you have all keys, create `/Users/jasonchiu/lego_inventory_project/.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=<your QA project URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your QA anon key>
SUPABASE_SERVICE_ROLE_KEY=<your QA service role key>
GOOGLE_CLOUD_VISION_API_KEY=<your key>
REBRICKABLE_API_KEY=<your key>
EBAY_APP_ID=<your App ID>
```

This file is gitignored and never leaves your machine.

---

## Task 1: Project Scaffolding & Environment Setup

**Files:**
- Create: `package.json` (via Next.js CLI)
- Create: `.env.example`
- Create: `.env.local` (gitignored, you fill in values)
- Create: `.gitignore`
- Create: `jest.config.ts`
- Create: `jest.setup.ts`

**Step 1: Scaffold Next.js project**

Run in `/Users/jasonchiu/lego_inventory_project`:
```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
```
When prompted: answer Yes to all defaults.

Expected: project files created, `npm run dev` works at `http://localhost:3000`.

**Step 2: Install dependencies**

```bash
npm install @supabase/supabase-js @supabase/ssr
npm install --save-dev jest jest-environment-jsdom @testing-library/react @testing-library/jest-dom @types/jest ts-jest
```

**Step 3: Create `jest.config.ts`**

```typescript
import type { Config } from 'jest'
import nextJest from 'next/jest.js'

const createJestConfig = nextJest({ dir: './' })

const config: Config = {
  setupFilesAfterFramework: ['<rootDir>/jest.setup.ts'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
}

export default createJestConfig(config)
```

**Step 4: Create `jest.setup.ts`**

```typescript
import '@testing-library/jest-dom'
```

**Step 5: Create `.env.example`**

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GOOGLE_CLOUD_VISION_API_KEY=
REBRICKABLE_API_KEY=
EBAY_APP_ID=
```

**Step 6: Verify `.gitignore` includes secrets**

Confirm `.gitignore` (auto-generated by Next.js) contains:
```
.env*.local
```
If not, add it manually.

**Step 7: Run tests to confirm Jest is working**

```bash
npm test -- --passWithNoTests
```
Expected: `Test Suites: 0 passed`

**Step 8: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js project with TypeScript, Tailwind, and Jest"
```

---

## Task 2: Supabase QA Project Setup

**Files:**
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/middleware.ts`
- Modify: `src/middleware.ts`

**Step 1: Create a Supabase QA project**

1. Go to [supabase.com](https://supabase.com) → New Project
2. Name it `lego-inventory-qa`
3. Choose a strong database password (save it somewhere safe)
4. Region: choose closest to you
5. Once created, go to **Settings → API**
6. Copy `Project URL` → `NEXT_PUBLIC_SUPABASE_URL` in `.env.local`
7. Copy `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`
8. Copy `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`

**Step 2: Create `src/lib/supabase/client.ts`** (used in browser/React components)

```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

**Step 3: Create `src/lib/supabase/server.ts`** (used in API routes and server components)

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}
```

**Step 4: Create `src/middleware.ts`** (refreshes auth sessions on every request)

```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Redirect unauthenticated users to /login (except on /login itself)
  if (!user && !request.nextUrl.pathname.startsWith('/login')) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

**Step 5: Verify app starts without errors**

```bash
npm run dev
```
Expected: app starts, navigating to `http://localhost:3000` redirects to `/login` (404 for now — that's fine, redirect is working).

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: add Supabase client, server, and auth middleware"
```

---

## Task 3: Database Schema & Migrations

**Files:**
- Create: `supabase/migrations/20260307000001_initial_schema.sql`
- Create: `scripts/seed-qa.sql`

**Step 1: Install Supabase CLI**

```bash
brew install supabase/tap/supabase
supabase init
```

Expected: `supabase/` folder created in project root.

**Step 2: Create `supabase/migrations/20260307000001_initial_schema.sql`**

```sql
-- Enable UUID generation
create extension if not exists "pgcrypto";

-- user_settings: per-user alert thresholds
create table public.user_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade unique not null,
  price_spike_pct integer not null default 10,
  price_drop_pct integer not null default 10,
  demand_drop_pts integer not null default 20,
  retirement_alerts boolean not null default true,
  updated_at timestamptz default now()
);

-- sets: LEGO set reference data (shared, fetched from Rebrickable)
create table public.sets (
  id uuid primary key default gen_random_uuid(),
  set_number text unique not null,
  name text not null,
  theme text,
  piece_count integer,
  retail_price_usd numeric,
  retired boolean default false,
  retirement_date date,
  image_url text,
  last_fetched_at timestamptz default now(),
  override_retail_price_usd numeric,
  override_retired boolean,
  override_retirement_date date
);

-- inventory_items: your physical boxes
create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  set_id uuid references public.sets(id) on delete restrict not null,
  purchased_from text,
  purchase_price_usd numeric,
  purchase_date date,
  condition text check (condition in ('sealed', 'open', 'complete')) default 'sealed',
  notes text,
  photo_url text,
  added_by uuid references auth.users(id) on delete set null,
  sold boolean default false,
  sold_date date,
  sold_price_usd numeric,
  sold_via text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- price_snapshots: historical resale market data (append-only)
create table public.price_snapshots (
  id uuid primary key default gen_random_uuid(),
  set_id uuid references public.sets(id) on delete cascade not null,
  source text not null,
  avg_price_usd numeric,
  min_price_usd numeric,
  max_price_usd numeric,
  demand_score integer check (demand_score between 0 and 100),
  listings_count integer,
  fetched_at timestamptz default now()
);

-- alerts: per-user notification events
create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  set_id uuid references public.sets(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  type text check (type in ('retirement', 'price_spike', 'price_drop', 'demand_drop')) not null,
  message text not null,
  seen boolean default false,
  created_at timestamptz default now()
);

-- Row Level Security
alter table public.user_settings enable row level security;
alter table public.sets enable row level security;
alter table public.inventory_items enable row level security;
alter table public.price_snapshots enable row level security;
alter table public.alerts enable row level security;

-- RLS Policies: authenticated users can read sets and price_snapshots
create policy "Authenticated users can read sets"
  on public.sets for select to authenticated using (true);

create policy "Authenticated users can read price_snapshots"
  on public.price_snapshots for select to authenticated using (true);

-- RLS Policies: all authenticated users can read and write all inventory
create policy "Authenticated users manage all inventory"
  on public.inventory_items for all to authenticated
  using (true) with check (true);

-- User settings: each user manages only their own settings
create policy "Users manage own settings"
  on public.user_settings for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Alerts: each user sees only their own alerts
create policy "Users manage own alerts"
  on public.alerts for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Service role can write to all tables (for API routes using service key)
create policy "Service role full access to sets"
  on public.sets for all to service_role using (true) with check (true);

create policy "Service role full access to price_snapshots"
  on public.price_snapshots for all to service_role using (true) with check (true);

create policy "Service role full access to alerts"
  on public.alerts for all to service_role using (true) with check (true);
```

**Step 3: Apply migration to QA Supabase**

In Supabase dashboard → QA project → **SQL Editor**, paste and run the entire migration file.

Expected: all tables appear under **Table Editor** with no errors.

**Step 4: Create `scripts/seed-qa.sql`**

```sql
-- Seed sets
insert into public.sets (set_number, name, theme, piece_count, retail_price_usd, retired, retirement_date)
values
  ('75192', 'Millennium Falcon', 'Star Wars', 7541, 849.99, false, null),
  ('10294', 'Titanic', 'Icons', 9090, 679.99, false, null),
  ('21325', 'Medieval Blacksmith', 'Ideas', 2164, 179.99, true, '2023-06-01'),
  ('42154', 'Ford GT', 'Technic', 1466, 239.99, false, null);

-- Seed price_snapshots (3 months of history for trend testing)
insert into public.price_snapshots (set_number, source, avg_price_usd, min_price_usd, max_price_usd, demand_score, listings_count, fetched_at)
select
  s.id,
  'bricklink',
  case s.set_number
    when '75192' then 950.00 + (random() * 100)
    when '10294' then 720.00 + (random() * 80)
    when '21325' then 280.00 + (random() * 60)
    when '42154' then 260.00 + (random() * 40)
  end,
  case s.set_number
    when '75192' then 880.00
    when '10294' then 650.00
    when '21325' then 240.00
    when '42154' then 230.00
  end,
  case s.set_number
    when '75192' then 1100.00
    when '10294' then 820.00
    when '21325' then 360.00
    when '42154' then 310.00
  end,
  floor(random() * 40 + 60),
  floor(random() * 50 + 10),
  now() - (n || ' days')::interval
from public.sets s, generate_series(1, 90, 10) as n
where s.set_number in ('75192', '10294', '21325', '42154');

-- Spike scenario: 75192 recent price jump (triggers price_spike alert)
insert into public.price_snapshots (set_id, source, avg_price_usd, min_price_usd, max_price_usd, demand_score, listings_count, fetched_at)
select id, 'bricklink', 1200.00, 1100.00, 1350.00, 95, 42, now()
from public.sets where set_number = '75192';
```

Run this in Supabase SQL Editor (QA project) after seeding a test user through auth.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add database schema migration and QA seed script"
```

---

## Task 4: Auth & User Management

**Files:**
- Create: `src/app/login/page.tsx`
- Create: `src/app/login/actions.ts`
- Create: `src/app/auth/callback/route.ts`
- Create: `src/app/(dashboard)/layout.tsx`
- Create: `src/components/LogoutButton.tsx`
- Create: `src/__tests__/login.test.tsx`

**Step 1: Write failing test**

Create `src/__tests__/login.test.tsx`:
```typescript
import { render, screen } from '@testing-library/react'
import LoginPage from '@/app/login/page'

describe('LoginPage', () => {
  it('renders email and password fields', () => {
    render(<LoginPage />)
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify it fails**

```bash
npm test login.test.tsx
```
Expected: FAIL — `Cannot find module '@/app/login/page'`

**Step 3: Create `src/app/login/page.tsx`**

```typescript
export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-xl shadow-md w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-6 text-center">LEGO Inventory</h1>
        <form className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email</label>
            <input id="email" name="email" type="email" required
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">Password</label>
            <input id="password" name="password" type="password" required
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <button type="submit"
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md text-sm font-medium hover:bg-blue-700">
            Log in
          </button>
        </form>
      </div>
    </div>
  )
}
```

**Step 4: Create `src/app/login/actions.ts`** (server action for login)

```typescript
'use server'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function login(formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  })
  if (error) redirect('/login?error=Invalid credentials')
  redirect('/dashboard')
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
```

**Step 5: Wire form action into login page**

Update `src/app/login/page.tsx` — add `action={login}` to the form and import `login` from `./actions`.

**Step 6: Create `src/app/auth/callback/route.ts`** (handles Supabase auth redirects)

```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  if (code) {
    const supabase = await createClient()
    await supabase.auth.exchangeCodeForSession(code)
  }
  return NextResponse.redirect(`${origin}/dashboard`)
}
```

**Step 7: Create `src/components/LogoutButton.tsx`**

```typescript
'use client'
import { logout } from '@/app/login/actions'

export default function LogoutButton() {
  return (
    <form action={logout}>
      <button type="submit" className="text-sm text-gray-500 hover:text-gray-700">
        Log out
      </button>
    </form>
  )
}
```

**Step 8: Run tests**

```bash
npm test login.test.tsx
```
Expected: PASS

**Step 9: Manual test in browser**

1. Go to `http://localhost:3000` — should redirect to `/login`
2. In Supabase dashboard (QA) → **Authentication → Users** → **Add user** → create a test user
3. Log in with those credentials — should redirect to `/dashboard` (404 for now, redirect works)
4. Verify navigating to any route while logged out always redirects to `/login`

**Step 10: Commit**

```bash
git add -A
git commit -m "feat: add login page, logout, and auth callback route"
```

---

## Task 4b: Admin User Management Page

**Files:**
- Create: `src/app/(dashboard)/admin/users/page.tsx`
- Create: `src/app/api/admin/users/route.ts`
- Create: `src/app/api/admin/users/[id]/route.ts`
- Create: `src/lib/roles.ts`

**Step 1: Create `src/lib/roles.ts`** — role checking helpers

```typescript
import { createClient } from '@/lib/supabase/server'

export async function isAdmin(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const role = user.user_metadata?.role ?? 'member'
  return role === 'admin'
}
```

**Step 2: Create `src/app/api/admin/users/route.ts`** — list all users + invite

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { isAdmin } from '@/lib/roles'

const serviceSupabase = () => createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  if (!await isAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { data: { users }, error } = await serviceSupabase().auth.admin.listUsers()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(users.map(u => ({
    id: u.id,
    email: u.email,
    role: u.user_metadata?.role ?? 'member',
    created_at: u.created_at,
  })))
}

export async function POST(request: NextRequest) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { email } = await request.json()
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })
  const { data, error } = await serviceSupabase().auth.admin.inviteUserByEmail(email, {
    data: { role: 'member' }
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
```

**Step 3: Create `src/app/api/admin/users/[id]/route.ts`** — update role + delete user

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { isAdmin } from '@/lib/roles'

const serviceSupabase = () => createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { role } = await request.json()
  if (!['admin', 'member'].includes(role)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  const { data, error } = await serviceSupabase().auth.admin.updateUserById(params.id, {
    user_metadata: { role }
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { error } = await serviceSupabase().auth.admin.deleteUser(params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
```

**Step 4: Create `src/app/(dashboard)/admin/users/page.tsx`**

```typescript
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface User { id: string; email: string; role: string; created_at: string }

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const router = useRouter()

  useEffect(() => {
    fetch('/api/admin/users')
      .then(r => { if (r.status === 403) router.push('/dashboard'); return r.json() })
      .then(setUsers)
  }, [])

  async function invite() {
    setLoading(true)
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail }),
    })
    setMessage(res.ok ? `Invite sent to ${inviteEmail}` : 'Failed to send invite')
    setInviteEmail('')
    setLoading(false)
    if (res.ok) fetch('/api/admin/users').then(r => r.json()).then(setUsers)
  }

  async function changeRole(id: string, role: string) {
    await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    })
    setUsers(users.map(u => u.id === id ? { ...u, role } : u))
  }

  async function removeUser(id: string) {
    if (!confirm('Remove this user?')) return
    await fetch(`/api/admin/users/${id}`, { method: 'DELETE' })
    setUsers(users.filter(u => u.id !== id))
  }

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">User Management</h1>

      {/* Invite form */}
      <div className="bg-[#2A2A2A] rounded-xl p-4 mb-6">
        <p className="text-sm font-medium mb-3">Invite New User</p>
        <div className="flex gap-2">
          <input type="email" placeholder="email@example.com" value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            className="flex-1 bg-[#1A1A1A] border border-gray-600 rounded-md px-3 py-2 text-sm text-white" />
          <button onClick={invite} disabled={loading || !inviteEmail}
            className="bg-[#DA291C] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-red-700 disabled:opacity-50">
            Send Invite
          </button>
        </div>
        {message && <p className="text-sm text-green-400 mt-2">{message}</p>}
      </div>

      {/* Users table */}
      <div className="space-y-2">
        {users.map(user => (
          <div key={user.id} className="bg-[#2A2A2A] rounded-lg px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">{user.email}</p>
              <p className="text-xs text-gray-400">Joined {new Date(user.created_at).toLocaleDateString()}</p>
            </div>
            <div className="flex items-center gap-3">
              <select value={user.role} onChange={e => changeRole(user.id, e.target.value)}
                className="bg-[#1A1A1A] border border-gray-600 rounded px-2 py-1 text-sm text-white">
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
              <button onClick={() => removeUser(user.id)}
                className="text-xs text-red-400 hover:text-red-300">Remove</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

**Step 5: Manual test**

1. Navigate to `/admin/users` — verify user list loads
2. Enter an email and send invite — verify email arrives
3. Change a user's role to `admin` — verify role updates in the list
4. Navigate to `/admin/users` while logged in as a member — verify redirect to `/dashboard`

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: add admin user management page with invite, role change, and remove"
```

---

## Task 5: Photo Upload & OCR

**Files:**
- Create: `src/app/(dashboard)/upload/page.tsx`
- Create: `src/app/api/ocr/route.ts`
- Create: `src/lib/ocr.ts`
- Create: `src/__tests__/ocr.test.ts`

**Step 1: Enable Supabase Storage**

In Supabase dashboard (QA) → **Storage** → **New bucket** → name: `lego-photos`, set to **Private**.

**Step 2: Write failing test**

Create `src/__tests__/ocr.test.ts`:
```typescript
import { extractSetNumbers } from '@/lib/ocr'

describe('extractSetNumbers', () => {
  it('extracts valid LEGO set numbers from OCR text', () => {
    const ocrText = 'Set No: 75192 and also 10294-1 plus some noise 99999999'
    const result = extractSetNumbers(ocrText)
    expect(result).toContain('75192')
    expect(result).toContain('10294')
    expect(result).not.toContain('99999999') // too many digits
  })

  it('returns empty array when no set numbers found', () => {
    expect(extractSetNumbers('no numbers here')).toEqual([])
  })
})
```

**Step 3: Run test to verify it fails**

```bash
npm test ocr.test.ts
```
Expected: FAIL — `Cannot find module '@/lib/ocr'`

**Step 4: Create `src/lib/ocr.ts`**

```typescript
// LEGO set numbers are 4-6 digits, optionally followed by -1
const SET_NUMBER_REGEX = /\b(\d{4,6})(?:-\d)?\b/g

export function extractSetNumbers(text: string): string[] {
  const matches = [...text.matchAll(SET_NUMBER_REGEX)]
  const numbers = matches.map(m => m[1])
  // Deduplicate
  return [...new Set(numbers)]
}
```

**Step 5: Run test to verify it passes**

```bash
npm test ocr.test.ts
```
Expected: PASS

**Step 6: Create `src/app/api/ocr/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { extractSetNumbers } from '@/lib/ocr'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('image') as File
  if (!file) return NextResponse.json({ error: 'No image provided' }, { status: 400 })

  const imageBytes = Buffer.from(await file.arrayBuffer()).toString('base64')

  const response = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${process.env.GOOGLE_CLOUD_VISION_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          image: { content: imageBytes },
          features: [{ type: 'TEXT_DETECTION' }],
        }],
      }),
    }
  )

  const data = await response.json()
  const fullText = data.responses?.[0]?.fullTextAnnotation?.text ?? ''
  const setNumbers = extractSetNumbers(fullText)

  return NextResponse.json({ setNumbers, rawText: fullText })
}
```

**Step 7: Create `src/app/(dashboard)/upload/page.tsx`**

```typescript
'use client'
import { useState } from 'react'

export default function UploadPage() {
  const [preview, setPreview] = useState<string | null>(null)
  const [detected, setDetected] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPreview(URL.createObjectURL(file))
    setLoading(true)

    const form = new FormData()
    form.append('image', file)
    const res = await fetch('/api/ocr', { method: 'POST', body: form })
    const data = await res.json()
    setDetected(data.setNumbers ?? [])
    setLoading(false)
  }

  return (
    <div className="max-w-lg mx-auto p-4">
      <h1 className="text-xl font-bold mb-4">Upload LEGO Box Photo</h1>
      <input type="file" accept="image/*" capture="environment" onChange={handleUpload}
        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700" />
      {preview && <img src={preview} alt="Preview" className="mt-4 rounded-lg w-full" />}
      {loading && <p className="mt-4 text-gray-500">Scanning for set numbers...</p>}
      {detected.length > 0 && (
        <div className="mt-4">
          <p className="font-medium">Detected set numbers:</p>
          <ul className="mt-2 space-y-1">
            {detected.map(n => (
              <li key={n} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-md">
                <span className="font-mono">{n}</span>
                <button className="text-sm text-blue-600 hover:underline">Add to inventory</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
```

**Step 8: Manual test — OCR endpoint**

```bash
# Test OCR route directly with curl (replace TOKEN with a valid session token from browser devtools)
curl -X POST http://localhost:3000/api/ocr \
  -H "Cookie: <your-session-cookie>" \
  -F "image=@/path/to/lego-box-photo.jpg"
```
Expected: `{ "setNumbers": ["75192", ...], "rawText": "..." }`

**Step 9: Commit**

```bash
git add -A
git commit -m "feat: add OCR photo upload with Google Cloud Vision and set number extraction"
```

---

## Task 5b: CSV Import & Manual Set Entry

**Files:**
- Create: `src/lib/csv.ts`
- Create: `src/app/api/inventory/import/route.ts`
- Modify: `src/app/(dashboard)/upload/page.tsx`
- Create: `src/__tests__/csv.test.ts`

**Step 1: Write failing test**

Create `src/__tests__/csv.test.ts`:
```typescript
import { parseLegoCsv } from '@/lib/csv'

describe('parseLegoCsv', () => {
  it('parses valid CSV rows into inventory items', () => {
    const csv = `set_number,purchased_from,purchase_price,purchase_date,condition,notes
75192,Target,849.99,2023-12-01,sealed,Christmas gift
10294,Amazon,679.99,,sealed,`
    const result = parseLegoCsv(csv)
    expect(result.valid).toHaveLength(2)
    expect(result.valid[0].set_number).toBe('75192')
    expect(result.valid[0].purchase_price).toBe(849.99)
    expect(result.valid[0].purchase_date).toBe('2023-12-01')
    expect(result.valid[1].purchase_date).toBeNull()
  })

  it('flags rows with missing set_number as invalid', () => {
    const csv = `set_number,purchased_from\n,Target`
    const result = parseLegoCsv(csv)
    expect(result.valid).toHaveLength(0)
    expect(result.invalid).toHaveLength(1)
  })

  it('flags rows with non-numeric price as invalid', () => {
    const csv = `set_number,purchase_price\n75192,notaprice`
    const result = parseLegoCsv(csv)
    expect(result.invalid[0].error).toMatch(/price/)
  })
})
```

**Step 2: Run test to verify it fails**

```bash
npm test csv.test.ts
```
Expected: FAIL

**Step 3: Create `src/lib/csv.ts`**

```typescript
export interface CsvRow {
  set_number: string
  purchased_from: string | null
  purchase_price: number | null
  purchase_date: string | null
  condition: 'sealed' | 'open' | 'complete'
  notes: string | null
}

export interface CsvParseResult {
  valid: CsvRow[]
  invalid: { row: number; raw: string; error: string }[]
}

export function parseLegoCsv(csvText: string): CsvParseResult {
  const lines = csvText.trim().split('\n')
  const headers = lines[0].toLowerCase().split(',').map(h => h.trim())
  const valid: CsvRow[] = []
  const invalid: { row: number; raw: string; error: string }[] = []

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i]
    const cols = raw.split(',').map(c => c.trim())
    const get = (col: string) => cols[headers.indexOf(col)] ?? ''

    const setNumber = get('set_number')
    if (!setNumber) {
      invalid.push({ row: i + 1, raw, error: 'Missing set_number' })
      continue
    }

    const priceRaw = get('purchase_price')
    let purchase_price: number | null = null
    if (priceRaw) {
      const parsed = parseFloat(priceRaw)
      if (isNaN(parsed)) {
        invalid.push({ row: i + 1, raw, error: 'Invalid purchase_price — must be a number' })
        continue
      }
      purchase_price = parsed
    }

    const conditionRaw = get('condition')
    const condition = (['sealed', 'open', 'complete'].includes(conditionRaw)
      ? conditionRaw
      : 'sealed') as CsvRow['condition']

    valid.push({
      set_number: setNumber,
      purchased_from: get('purchased_from') || null,
      purchase_price,
      purchase_date: get('purchase_date') || null,
      condition,
      notes: get('notes') || null,
    })
  }

  return { valid, invalid }
}
```

**Step 4: Run test to verify it passes**

```bash
npm test csv.test.ts
```
Expected: PASS

**Step 5: Create `src/app/api/inventory/import/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseLegoCsv } from '@/lib/csv'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File
  const confirm = formData.get('confirm') === 'true'

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const text = await file.text()
  const { valid, invalid } = parseLegoCsv(text)

  // Preview mode — return parsed rows without saving
  if (!confirm) {
    return NextResponse.json({ valid, invalid, total: valid.length + invalid.length })
  }

  // Confirm mode — look up set IDs and bulk insert
  const results = []
  for (const row of valid) {
    const { data: set } = await supabase
      .from('sets')
      .select('id')
      .eq('set_number', row.set_number)
      .single()

    if (!set) {
      results.push({ set_number: row.set_number, status: 'skipped', reason: 'Set not found — run lego-status first' })
      continue
    }

    const { error } = await supabase
      .from('inventory_items')
      .insert({
        set_id: set.id,
        added_by: user.id,
        purchased_from: row.purchased_from,
        purchase_price_usd: row.purchase_price,
        purchase_date: row.purchase_date,
        condition: row.condition,
        notes: row.notes,
      })

    results.push({ set_number: row.set_number, status: error ? 'error' : 'saved', reason: error?.message })
  }

  return NextResponse.json({ results, invalid })
}
```

**Step 6: Update `src/app/(dashboard)/upload/page.tsx`** — add manual entry and CSV upload tabs

Replace the existing upload page content with a three-tab layout:
```typescript
'use client'
import { useState } from 'react'

type Tab = 'photo' | 'manual' | 'csv'

export default function UploadPage() {
  const [tab, setTab] = useState<Tab>('photo')
  const [preview, setPreview] = useState<string | null>(null)
  const [detected, setDetected] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [manualInput, setManualInput] = useState('')
  const [csvPreview, setCsvPreview] = useState<{ valid: object[]; invalid: object[] } | null>(null)

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPreview(URL.createObjectURL(file))
    setLoading(true)
    const form = new FormData()
    form.append('image', file)
    const res = await fetch('/api/ocr', { method: 'POST', body: form })
    const data = await res.json()
    setDetected(data.setNumbers ?? [])
    setLoading(false)
  }

  async function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const form = new FormData()
    form.append('file', file)
    const res = await fetch('/api/inventory/import', { method: 'POST', body: form })
    const data = await res.json()
    setCsvPreview(data)
  }

  async function confirmCsvImport() {
    // re-POST with confirm=true
    // (in full implementation, re-send the file with confirm flag)
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'photo', label: 'Photo' },
    { id: 'manual', label: 'Manual Entry' },
    { id: 'csv', label: 'CSV Upload' },
  ]

  return (
    <div className="max-w-lg mx-auto p-4">
      <h1 className="text-xl font-bold mb-4">Add LEGO Sets</h1>

      {/* Tabs */}
      <div className="flex border-b mb-6">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Photo tab */}
      {tab === 'photo' && (
        <div>
          <input type="file" accept="image/*" capture="environment" onChange={handlePhotoUpload}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700" />
          {preview && <img src={preview} alt="Preview" className="mt-4 rounded-lg w-full" />}
          {loading && <p className="mt-4 text-gray-500">Scanning for set numbers...</p>}
          {detected.length > 0 && (
            <div className="mt-4">
              <p className="font-medium">Detected set numbers:</p>
              <ul className="mt-2 space-y-1">
                {detected.map(n => (
                  <li key={n} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-md">
                    <span className="font-mono">{n}</span>
                    <button className="text-sm text-blue-600 hover:underline">Add to inventory</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Manual entry tab */}
      {tab === 'manual' && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Set Number</label>
            <input type="text" placeholder="e.g. 75192" value={manualInput}
              onChange={e => setManualInput(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono" />
          </div>
          <button
            onClick={() => setDetected([manualInput.trim()])}
            disabled={!manualInput.trim()}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            Look Up Set
          </button>
          {detected.length > 0 && (
            <div className="bg-gray-50 px-3 py-2 rounded-md flex items-center justify-between">
              <span className="font-mono">{detected[0]}</span>
              <button className="text-sm text-blue-600 hover:underline">Add to inventory</button>
            </div>
          )}
        </div>
      )}

      {/* CSV upload tab */}
      {tab === 'csv' && (
        <div className="space-y-4">
          {/* Format instructions */}
          <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-2">
            <p className="font-medium text-gray-700">CSV Format</p>
            <p className="text-gray-500">Only <span className="font-mono font-semibold text-gray-700">set_number</span> is required. All other columns are optional — leave them blank, don't remove them.</p>
            <div className="font-mono text-xs bg-white border border-gray-200 rounded p-2 overflow-x-auto whitespace-pre">
{`set_number,purchased_from,purchase_price,purchase_date,condition,notes
75192,Target,849.99,2023-12-01,sealed,Christmas gift
10294,Amazon,679.99,,sealed,
21325,,,,, `}
            </div>
            <ul className="text-gray-500 space-y-1 text-xs">
              <li><span className="font-mono text-gray-700">purchase_price</span> — number only, no $ or commas (e.g. <span className="font-mono">849.99</span>)</li>
              <li><span className="font-mono text-gray-700">purchase_date</span> — YYYY-MM-DD format (e.g. <span className="font-mono">2023-12-01</span>)</li>
              <li><span className="font-mono text-gray-700">condition</span> — <span className="font-mono">sealed</span>, <span className="font-mono">open</span>, or <span className="font-mono">complete</span> (defaults to sealed)</li>
            </ul>
            {/* Downloadable template */}
            <a
              href="data:text/csv;charset=utf-8,set_number%2Cpurchased_from%2Cpurchase_price%2Cpurchase_date%2Ccondition%2Cnotes%0A"
              download="lego-inventory-template.csv"
              className="inline-block text-blue-600 text-xs hover:underline">
              Download blank template
            </a>
          </div>

          <input type="file" accept=".csv" onChange={handleCsvUpload}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700" />

          {csvPreview && (
            <div className="mt-4 space-y-3">
              <div className="flex gap-3 text-sm">
                <span className="text-green-600 font-medium">✓ {(csvPreview.valid as object[]).length} valid rows</span>
                {(csvPreview.invalid as object[]).length > 0 && (
                  <span className="text-red-500 font-medium">✗ {(csvPreview.invalid as object[]).length} errors (will be skipped)</span>
                )}
              </div>
              <button onClick={confirmCsvImport}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md text-sm font-medium hover:bg-blue-700">
                Import {(csvPreview.valid as object[]).length} Sets
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

**Step 7: Manual test — CSV import**

Create a test CSV file `test-import.csv`:
```
set_number,purchased_from,purchase_price,purchase_date,condition,notes
75192,Target,849.99,2023-12-01,sealed,
10294,Amazon,679.99,,sealed,
```

```bash
# Preview (no confirm)
curl -X POST http://localhost:3000/api/inventory/import \
  -H "Cookie: <session>" \
  -F "file=@test-import.csv"

# Expected: { "valid": [...2 rows...], "invalid": [], "total": 2 }
```

**Step 8: Commit**

```bash
git add -A
git commit -m "feat: add CSV import and manual set number entry alongside photo upload"
```

---

## Task 6: Set Data Fetcher

**Files:**
- Create: `src/lib/rebrickable.ts`
- Create: `src/app/api/lego-status/route.ts`
- Create: `src/__tests__/rebrickable.test.ts`

**Step 1: Write failing test**

Create `src/__tests__/rebrickable.test.ts`:
```typescript
import { parseSetData } from '@/lib/rebrickable'

describe('parseSetData', () => {
  it('maps Rebrickable API response to our set schema', () => {
    const raw = {
      set_num: '75192-1',
      name: 'Millennium Falcon',
      theme_id: 171,
      num_parts: 7541,
      set_img_url: 'https://example.com/img.jpg',
    }
    const result = parseSetData(raw, 'Star Wars')
    expect(result.set_number).toBe('75192')
    expect(result.name).toBe('Millennium Falcon')
    expect(result.piece_count).toBe(7541)
  })
})
```

**Step 2: Run test to verify it fails**

```bash
npm test rebrickable.test.ts
```
Expected: FAIL

**Step 3: Create `src/lib/rebrickable.ts`**

```typescript
export interface SetData {
  set_number: string
  name: string
  theme: string | null
  piece_count: number | null
  image_url: string | null
}

export function parseSetData(raw: Record<string, unknown>, theme: string | null): SetData {
  const setNum = (raw.set_num as string).replace(/-\d+$/, '') // strip "-1" suffix
  return {
    set_number: setNum,
    name: raw.name as string,
    theme,
    piece_count: (raw.num_parts as number) ?? null,
    image_url: (raw.set_img_url as string) ?? null,
  }
}

export async function fetchSetFromRebrickable(setNumber: string): Promise<SetData | null> {
  const res = await fetch(
    `https://rebrickable.com/api/v3/lego/sets/${setNumber}-1/`,
    { headers: { Authorization: `key ${process.env.REBRICKABLE_API_KEY}` } }
  )
  if (!res.ok) return null
  const raw = await res.json()

  // Fetch theme name separately
  let theme: string | null = null
  if (raw.theme_id) {
    const themeRes = await fetch(
      `https://rebrickable.com/api/v3/lego/themes/${raw.theme_id}/`,
      { headers: { Authorization: `key ${process.env.REBRICKABLE_API_KEY}` } }
    )
    if (themeRes.ok) {
      const themeData = await themeRes.json()
      theme = themeData.name
    }
  }

  return parseSetData(raw, theme)
}
```

**Step 4: Run test to verify it passes**

```bash
npm test rebrickable.test.ts
```
Expected: PASS

**Step 5: Create `src/app/api/lego-status/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { fetchSetFromRebrickable } from '@/lib/rebrickable'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const setNumber = request.nextUrl.searchParams.get('set_number')
  if (!setNumber) return NextResponse.json({ error: 'set_number required' }, { status: 400 })

  // Check cache first
  const { data: cached } = await supabase
    .from('sets')
    .select('*')
    .eq('set_number', setNumber)
    .single()

  const oneDay = 1000 * 60 * 60 * 24
  if (cached && Date.now() - new Date(cached.last_fetched_at).getTime() < oneDay) {
    return NextResponse.json(cached)
  }

  // Fetch fresh from Rebrickable
  const setData = await fetchSetFromRebrickable(setNumber)
  if (!setData) return NextResponse.json({ error: 'Set not found' }, { status: 404 })

  // Upsert into sets table using service role (bypasses RLS)
  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: upserted, error } = await serviceSupabase
    .from('sets')
    .upsert({ ...setData, last_fetched_at: new Date().toISOString() }, { onConflict: 'set_number' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(upserted)
}
```

**Step 6: Manual test**

```bash
curl "http://localhost:3000/api/lego-status?set_number=75192" \
  -H "Cookie: <your-session-cookie>"
```
Expected: JSON with set name, theme, piece count. Check Supabase table editor — row should appear in `sets`.

**Step 7: Commit**

```bash
git add -A
git commit -m "feat: add set data fetcher via Rebrickable API with caching"
```

---

## Task 7: Inventory Management

**Files:**
- Create: `src/app/api/sets/route.ts`
- Create: `src/app/api/sets/[id]/route.ts`
- Create: `src/app/(dashboard)/dashboard/page.tsx`
- Create: `src/app/(dashboard)/dashboard/InventoryTable.tsx`
- Create: `src/app/(dashboard)/sets/[id]/page.tsx`
- Create: `src/__tests__/inventory-api.test.ts`

**Step 1: Write failing test**

Create `src/__tests__/inventory-api.test.ts`:
```typescript
import { checkDuplicateGuard } from '@/lib/inventory'

describe('checkDuplicateGuard', () => {
  it('returns warn=true when count reaches 4 or more', () => {
    expect(checkDuplicateGuard(3)).toEqual({ warn: true, count: 3 })
    expect(checkDuplicateGuard(4)).toEqual({ warn: true, count: 4 })
  })

  it('returns warn=false when count is under 4', () => {
    expect(checkDuplicateGuard(2)).toEqual({ warn: false, count: 2 })
    expect(checkDuplicateGuard(0)).toEqual({ warn: false, count: 0 })
  })
})
```

**Step 2: Run test to verify it fails**

```bash
npm test inventory-api.test.ts
```
Expected: FAIL

**Step 3: Create `src/lib/inventory.ts`**

```typescript
export function checkDuplicateGuard(existingCount: number): { warn: boolean; count: number } {
  return { warn: existingCount >= 3, count: existingCount }
}
```

**Step 4: Run test to verify it passes**

```bash
npm test inventory-api.test.ts
```
Expected: PASS

**Step 5: Create `src/app/api/sets/route.ts`** (list + create inventory items)

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkDuplicateGuard } from '@/lib/inventory'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('inventory_items')
    .select('*, sets(*)')
    .eq('added_by', user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { set_id, force, ...rest } = body

  // Duplicate guard: count existing unsold copies
  const { count } = await supabase
    .from('inventory_items')
    .select('*', { count: 'exact', head: true })
    .eq('set_id', set_id)
    .eq('added_by', user.id)
    .eq('sold', false)

  const guard = checkDuplicateGuard(count ?? 0)
  if (guard.warn && !force) {
    return NextResponse.json({ warning: true, count: guard.count }, { status: 409 })
  }

  const { data, error } = await supabase
    .from('inventory_items')
    .insert({ set_id, added_by: user.id, ...rest })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
```

**Step 6: Create `src/app/api/sets/[id]/route.ts`** (update + delete single item)

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { data, error } = await supabase
    .from('inventory_items')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('added_by', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase
    .from('inventory_items')
    .delete()
    .eq('id', params.id)
    .eq('added_by', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
```

**Step 7: Create dashboard page `src/app/(dashboard)/dashboard/page.tsx`**

```typescript
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: items } = await supabase
    .from('inventory_items')
    .select('*, sets(*)')
    .eq('sold', false)
    .order('created_at', { ascending: false })

  return (
    <div className="max-w-4xl mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">My LEGO Inventory</h1>
        <Link href="/upload" className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700">
          + Add Sets
        </Link>
      </div>
      <div className="space-y-2">
        {items?.map(item => (
          <Link key={item.id} href={`/sets/${item.id}`}
            className="flex items-center justify-between bg-white p-4 rounded-lg shadow-sm hover:shadow-md transition-shadow">
            <div>
              <p className="font-medium">{item.sets?.name}</p>
              <p className="text-sm text-gray-500">#{item.sets?.set_number} · {item.condition}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">Paid</p>
              <p className="font-medium">${item.purchase_price_usd ?? '—'}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
```

**Step 8: Manual test — duplicate guard**

```bash
# Add same set twice without force — second should return 409 with warning
curl -X POST http://localhost:3000/api/sets \
  -H "Content-Type: application/json" \
  -H "Cookie: <session>" \
  -d '{"set_id": "<set-uuid>", "condition": "sealed"}'

# Third time with force=true — should succeed
curl -X POST http://localhost:3000/api/sets \
  -H "Content-Type: application/json" \
  -H "Cookie: <session>" \
  -d '{"set_id": "<set-uuid>", "condition": "sealed", "force": true}'
```

**Step 9: Commit**

```bash
git add -A
git commit -m "feat: add inventory CRUD API with duplicate guard and dashboard page"
```

---

---

## ⏸ Phase 2 — Start only after eBay API approval

> Tasks 8 and 9 require a live eBay App ID in `.env.local`. The app is fully functional without them — price fields show "coming soon" placeholders in the UI. Return here once eBay approves your developer account.

---

## Task 8: Price & Demand Fetcher

**Files:**
- Create: `src/lib/ebay.ts`
- Create: `src/app/api/prices/fetch/route.ts`
- Create: `src/__tests__/ebay.test.ts`

**Step 1: Write failing test**

Create `src/__tests__/ebay.test.ts`:
```typescript
import { normalizeDemandScore, parseEbayPrices } from '@/lib/ebay'

describe('normalizeDemandScore', () => {
  it('clamps score between 0 and 100', () => {
    expect(normalizeDemandScore(200, 50)).toBe(100)
    expect(normalizeDemandScore(0, 50)).toBe(0)
  })

  it('scales listings relative to reference max', () => {
    expect(normalizeDemandScore(50, 100)).toBe(50)
  })
})

describe('parseEbayPrices', () => {
  it('extracts avg, min, max from sold listing prices', () => {
    const prices = [100, 200, 300]
    const result = parseEbayPrices(prices)
    expect(result.avg_price_usd).toBe(200)
    expect(result.min_price_usd).toBe(100)
    expect(result.max_price_usd).toBe(300)
  })

  it('returns nulls for empty price list', () => {
    const result = parseEbayPrices([])
    expect(result.avg_price_usd).toBeNull()
  })
})
```

**Step 2: Run test to verify it fails**

```bash
npm test ebay.test.ts
```
Expected: FAIL

**Step 3: Create `src/lib/ebay.ts`**

```typescript
// Demand score: normalize sold listing count against a reference max (50 sold = score of 100)
export function normalizeDemandScore(listingsCount: number, referenceMax: number = 50): number {
  return Math.min(100, Math.round((listingsCount / referenceMax) * 100))
}

export function parseEbayPrices(prices: number[]): {
  avg_price_usd: number | null
  min_price_usd: number | null
  max_price_usd: number | null
} {
  if (prices.length === 0) return { avg_price_usd: null, min_price_usd: null, max_price_usd: null }
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length
  return {
    avg_price_usd: Math.round(avg * 100) / 100,
    min_price_usd: Math.min(...prices),
    max_price_usd: Math.max(...prices),
  }
}

export interface PriceSnapshot {
  source: string
  avg_price_usd: number | null
  min_price_usd: number | null
  max_price_usd: number | null
  demand_score: number
  listings_count: number
}

export async function fetchEbayPrices(setNumber: string): Promise<PriceSnapshot | null> {
  // eBay Finding API — findCompletedItems for sealed LEGO sets (category 19006 = LEGO Sets)
  const params = new URLSearchParams({
    'OPERATION-NAME': 'findCompletedItems',
    'SERVICE-VERSION': '1.0.0',
    'SECURITY-APPNAME': process.env.EBAY_APP_ID!,
    'RESPONSE-DATA-FORMAT': 'JSON',
    'keywords': `LEGO ${setNumber} sealed`,
    'categoryId': '19006',
    'itemFilter(0).name': 'SoldItemsOnly',
    'itemFilter(0).value': 'true',
    'itemFilter(1).name': 'Condition',
    'itemFilter(1).value': '1000', // New/Sealed
    'sortOrder': 'EndTimeSoonest',
    'paginationInput.entriesPerPage': '50',
  })

  const res = await fetch(
    `https://svcs.ebay.com/services/search/FindingService/v1?${params.toString()}`
  )
  if (!res.ok) return null

  const data = await res.json()
  const items = data?.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.item ?? []
  if (items.length === 0) return null

  const prices: number[] = items
    .map((item: Record<string, unknown>) => {
      const priceArr = (item.sellingStatus as Record<string, unknown>[])?.[0]?.currentPrice as Record<string, unknown>[] | undefined
      return priceArr ? parseFloat(priceArr[0]?.['__value__'] as string) : null
    })
    .filter((p: number | null): p is number => p !== null && !isNaN(p))

  const parsed = parseEbayPrices(prices)
  return {
    source: 'ebay',
    ...parsed,
    demand_score: normalizeDemandScore(prices.length),
    listings_count: prices.length,
  }
}
```

**Step 4: Run test to verify it passes**

```bash
npm test ebay.test.ts
```
Expected: PASS

**Step 5: Create `src/app/api/prices/fetch/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { fetchEbayPrices } from '@/lib/ebay'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const setNumber = request.nextUrl.searchParams.get('set_number')
  if (!setNumber) return NextResponse.json({ error: 'set_number required' }, { status: 400 })

  // Look up set_id
  const { data: set } = await supabase.from('sets').select('id').eq('set_number', setNumber).single()
  if (!set) return NextResponse.json({ error: 'Set not found in database — run /api/lego-status first' }, { status: 404 })

  const snapshot = await fetchEbayPrices(setNumber)
  if (!snapshot) return NextResponse.json({ error: 'Could not fetch prices from eBay' }, { status: 502 })

  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data, error } = await serviceSupabase
    .from('price_snapshots')
    .insert({ set_id: set.id, ...snapshot })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
```

**Step 6: Manual test**

```bash
curl "http://localhost:3000/api/prices/fetch?set_number=75192" \
  -H "Cookie: <session>"
```
Expected: JSON snapshot written to `price_snapshots` table. Verify in Supabase dashboard.

**Step 7: Commit**

```bash
git add -A
git commit -m "feat: add eBay price fetcher using completed sold listings"
```

---

## Task 9: Alerts & Recommendations (Phase 2)

**Files:**
- Create: `src/lib/alerts.ts`
- Create: `src/app/api/alerts/run/route.ts`
- Create: `src/app/(dashboard)/alerts/page.tsx`
- Create: `src/__tests__/alerts.test.ts`

**Step 1: Write failing test**

Create `src/__tests__/alerts.test.ts`:
```typescript
import { detectAlerts } from '@/lib/alerts'

describe('detectAlerts', () => {
  const settings = { price_spike_pct: 10, price_drop_pct: 10, demand_drop_pts: 20, retirement_alerts: true }

  it('detects price spike', () => {
    const result = detectAlerts({
      set_id: 'abc',
      previous_avg: 1000,
      current_avg: 1150,
      previous_demand: 70,
      current_demand: 70,
      just_retired: false,
      settings,
    })
    expect(result.some(a => a.type === 'price_spike')).toBe(true)
  })

  it('detects price drop', () => {
    const result = detectAlerts({
      set_id: 'abc',
      previous_avg: 1000,
      current_avg: 850,
      previous_demand: 70,
      current_demand: 70,
      just_retired: false,
      settings,
    })
    expect(result.some(a => a.type === 'price_drop')).toBe(true)
  })

  it('detects retirement', () => {
    const result = detectAlerts({
      set_id: 'abc',
      previous_avg: 1000,
      current_avg: 1000,
      previous_demand: 70,
      current_demand: 70,
      just_retired: true,
      settings,
    })
    expect(result.some(a => a.type === 'retirement')).toBe(true)
  })

  it('returns no alerts when nothing crosses thresholds', () => {
    const result = detectAlerts({
      set_id: 'abc',
      previous_avg: 1000,
      current_avg: 1005,
      previous_demand: 70,
      current_demand: 68,
      just_retired: false,
      settings,
    })
    expect(result).toHaveLength(0)
  })
})
```

**Step 2: Run test to verify it fails**

```bash
npm test alerts.test.ts
```
Expected: FAIL

**Step 3: Create `src/lib/alerts.ts`**

```typescript
interface AlertInput {
  set_id: string
  previous_avg: number
  current_avg: number
  previous_demand: number
  current_demand: number
  just_retired: boolean
  settings: {
    price_spike_pct: number
    price_drop_pct: number
    demand_drop_pts: number
    retirement_alerts: boolean
  }
}

interface AlertOutput {
  set_id: string
  type: 'price_spike' | 'price_drop' | 'demand_drop' | 'retirement'
  message: string
}

export function detectAlerts(input: AlertInput): AlertOutput[] {
  const alerts: AlertOutput[] = []
  const { set_id, previous_avg, current_avg, previous_demand, current_demand, just_retired, settings } = input

  const pctChange = previous_avg > 0
    ? ((current_avg - previous_avg) / previous_avg) * 100
    : 0

  if (pctChange >= settings.price_spike_pct) {
    alerts.push({
      set_id,
      type: 'price_spike',
      message: `Price increased by ${pctChange.toFixed(1)}% (now $${current_avg.toFixed(2)})`,
    })
  }

  if (pctChange <= -settings.price_drop_pct) {
    alerts.push({
      set_id,
      type: 'price_drop',
      message: `Price dropped by ${Math.abs(pctChange).toFixed(1)}% (now $${current_avg.toFixed(2)})`,
    })
  }

  const demandDrop = previous_demand - current_demand
  if (demandDrop >= settings.demand_drop_pts) {
    alerts.push({
      set_id,
      type: 'demand_drop',
      message: `Demand dropped by ${demandDrop} points (now ${current_demand}/100)`,
    })
  }

  if (just_retired && settings.retirement_alerts) {
    alerts.push({
      set_id,
      type: 'retirement',
      message: `This set has been officially retired by LEGO`,
    })
  }

  return alerts
}
```

**Step 4: Run test to verify it passes**

```bash
npm test alerts.test.ts
```
Expected: PASS

**Step 5: Create `src/app/api/alerts/run/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { detectAlerts } from '@/lib/alerts'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Get user settings
  const { data: settings } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', user.id)
    .single()

  const userSettings = settings ?? { price_spike_pct: 10, price_drop_pct: 10, demand_drop_pts: 20, retirement_alerts: true }

  // Get all sets in user's inventory
  const { data: items } = await supabase
    .from('inventory_items')
    .select('set_id')
    .eq('added_by', user.id)
    .eq('sold', false)

  const setIds = [...new Set(items?.map(i => i.set_id) ?? [])]
  const allAlerts: object[] = []

  for (const setId of setIds) {
    // Get last two price snapshots
    const { data: snapshots } = await serviceSupabase
      .from('price_snapshots')
      .select('avg_price_usd, demand_score')
      .eq('set_id', setId)
      .order('fetched_at', { ascending: false })
      .limit(2)

    if (!snapshots || snapshots.length < 2) continue

    const [current, previous] = snapshots
    const { data: set } = await serviceSupabase
      .from('sets')
      .select('retired')
      .eq('id', setId)
      .single()

    const newAlerts = detectAlerts({
      set_id: setId,
      previous_avg: previous.avg_price_usd,
      current_avg: current.avg_price_usd,
      previous_demand: previous.demand_score,
      current_demand: current.demand_score,
      just_retired: set?.retired ?? false,
      settings: userSettings,
    })

    for (const alert of newAlerts) {
      const { data } = await serviceSupabase
        .from('alerts')
        .insert({ ...alert, user_id: user.id })
        .select()
        .single()
      if (data) allAlerts.push(data)
    }
  }

  return NextResponse.json({ created: allAlerts.length, alerts: allAlerts })
}
```

**Step 6: Create `src/app/(dashboard)/alerts/page.tsx`**

```typescript
import { createClient } from '@/lib/supabase/server'

export default async function AlertsPage() {
  const supabase = await createClient()
  const { data: alerts } = await supabase
    .from('alerts')
    .select('*, sets(name, set_number)')
    .order('created_at', { ascending: false })
    .limit(50)

  const typeLabel: Record<string, string> = {
    price_spike: '📈 Price Spike',
    price_drop: '📉 Price Drop',
    demand_drop: '⚠️ Demand Drop',
    retirement: '🏁 Retired',
  }

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Alerts</h1>
      <div className="space-y-3">
        {alerts?.map(alert => (
          <div key={alert.id} className={`p-4 rounded-lg border ${alert.seen ? 'bg-white' : 'bg-blue-50 border-blue-200'}`}>
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs text-gray-400 font-medium">{typeLabel[alert.type]}</p>
                <p className="font-medium mt-1">{alert.sets?.name} <span className="text-gray-400 text-sm">#{alert.sets?.set_number}</span></p>
                <p className="text-sm text-gray-600 mt-1">{alert.message}</p>
              </div>
              <p className="text-xs text-gray-400 whitespace-nowrap ml-4">
                {new Date(alert.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
        ))}
        {!alerts?.length && <p className="text-gray-400 text-center py-8">No alerts yet.</p>}
      </div>
    </div>
  )
}
```

**Step 7: Manual test — run alert logic with QA seed data**

The QA seed data includes a price spike for set 75192. After seeding:

```bash
curl -X POST http://localhost:3000/api/alerts/run \
  -H "Cookie: <session>"
```
Expected: `{ "created": 1, "alerts": [{ "type": "price_spike", ... }] }`. Verify row in `alerts` table.

**Step 8: Commit**

```bash
git add -A
git commit -m "feat: add alert detection logic, run endpoint, and alerts page"
```

---

## Task 10: User Settings Page

**Files:**
- Create: `src/app/(dashboard)/settings/page.tsx`
- Create: `src/app/api/settings/route.ts`

**Step 1: Create `src/app/api/settings/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', user.id)
    .single()

  return NextResponse.json(data ?? { price_spike_pct: 10, price_drop_pct: 10, demand_drop_pts: 20, retirement_alerts: true })
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { data, error } = await supabase
    .from('user_settings')
    .upsert({ user_id: user.id, ...body, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
```

**Step 2: Create `src/app/(dashboard)/settings/page.tsx`**

```typescript
'use client'
import { useEffect, useState } from 'react'

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    price_spike_pct: 10,
    price_drop_pct: 10,
    demand_drop_pts: 20,
    retirement_alerts: true,
  })
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(setSettings)
  }, [])

  async function handleSave() {
    await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="max-w-lg mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Alert Settings</h1>
      <div className="bg-white rounded-xl shadow-sm p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700">Price spike alert threshold (%)</label>
          <p className="text-xs text-gray-400 mb-2">Alert when resale price rises by this percentage</p>
          <input type="number" min="1" max="100" value={settings.price_spike_pct}
            onChange={e => setSettings(s => ({ ...s, price_spike_pct: +e.target.value }))}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Price drop alert threshold (%)</label>
          <p className="text-xs text-gray-400 mb-2">Alert when resale price falls by this percentage</p>
          <input type="number" min="1" max="100" value={settings.price_drop_pct}
            onChange={e => setSettings(s => ({ ...s, price_drop_pct: +e.target.value }))}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Demand drop alert threshold (points)</label>
          <p className="text-xs text-gray-400 mb-2">Alert when demand score drops by this many points (0–100 scale)</p>
          <input type="number" min="1" max="100" value={settings.demand_drop_pts}
            onChange={e => setSettings(s => ({ ...s, demand_drop_pts: +e.target.value }))}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <label className="block text-sm font-medium text-gray-700">Retirement alerts</label>
            <p className="text-xs text-gray-400">Alert when a set is officially retired by LEGO</p>
          </div>
          <input type="checkbox" checked={settings.retirement_alerts}
            onChange={e => setSettings(s => ({ ...s, retirement_alerts: e.target.checked }))}
            className="w-5 h-5 rounded border-gray-300" />
        </div>
        <button onClick={handleSave}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md text-sm font-medium hover:bg-blue-700">
          {saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}
```

**Step 3: Manual test**

1. Navigate to `/settings`
2. Change price spike threshold to 20%
3. Click Save — verify row appears/updates in `user_settings` table in Supabase
4. Run `/api/alerts/run` — confirm it now uses the 20% threshold (no spike alert fires for a 15% increase)

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: add user settings page with configurable alert thresholds"
```

---

## Task 11: QA Verification Checklist

Run through each component end-to-end in the QA environment before promoting to prod.

### Phase 1 Checklist (complete before going to production)
- [ ] Login and logout work; unauthenticated routes redirect to `/login`
- [ ] Admin can invite a new user via `/admin/users`; invited user receives email
- [ ] Admin can change a user's role; member cannot access `/admin/users`
- [ ] Photo upload detects set numbers from a real LEGO box photo
- [ ] Manual set number entry looks up and adds a set correctly
- [ ] CSV upload previews rows correctly, rejects bad rows, imports valid rows
- [ ] Confirmed set numbers are fetched from Rebrickable and appear in `sets` table
- [ ] Adding an inventory item saves correctly; duplicate guard fires a warning at 3 existing copies
- [ ] Editing and deleting an inventory item works
- [ ] Marking a set as sold captures sale price and platform; item moves to Sold History view
- [ ] Price fields show "coming soon" placeholder cleanly — no broken UI
- [ ] Alert settings page loads and saves correctly
- [ ] All `.env.local` values are gitignored; `.env.example` is committed with blank values
- [ ] Run full test suite: `npm test` — all tests pass

### Phase 2 Checklist (complete after eBay API approval)
- [ ] `/api/prices/fetch?set_number=75192` writes a snapshot to `price_snapshots`
- [ ] Price history chart appears on set detail page
- [ ] `/api/alerts/run` detects the seeded price spike and creates an alert
- [ ] Alert appears on the `/alerts` page
- [ ] Changing alert thresholds in `/settings` affects what alerts are generated

---

## Task 12: Promote to Production

**Step 1: Create Supabase production project**

1. Go to [supabase.com](https://supabase.com) → New Project → name: `lego-inventory-prod`
2. Apply the same migration from Task 3 in the SQL editor
3. Do NOT run the seed script in prod

**Step 2: Create production environment variables**

Create `.env.production.local` (gitignored):
```
NEXT_PUBLIC_SUPABASE_URL=<prod project URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<prod anon key>
SUPABASE_SERVICE_ROLE_KEY=<prod service role key>
GOOGLE_CLOUD_VISION_API_KEY=<same>
REBRICKABLE_API_KEY=<same>
EBAY_APP_ID=<same>
```

**Step 3: Deploy to Vercel**

```bash
npm install -g vercel
vercel --prod
```

When prompted, import from GitHub. Add all production environment variables in the Vercel dashboard under **Settings → Environment Variables**.

**Step 4: Invite users**

In Supabase prod dashboard → **Authentication → Users** → **Invite user** → enter email. Users receive a magic link to set their password.

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: add production environment template and deployment notes"
```

---

## Running Tests

```bash
# All tests
npm test

# Single file
npm test ocr.test.ts

# Watch mode during development
npm test -- --watch

# Coverage report
npm test -- --coverage
```
