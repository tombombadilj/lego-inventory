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
  demand_score integer check (demand_score between 0 and 100) default 0,
  listings_count integer default 0,
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

-- All authenticated users can read sets and price_snapshots
create policy "Authenticated users can read sets"
  on public.sets for select to authenticated using (true);

create policy "Authenticated users can read price_snapshots"
  on public.price_snapshots for select to authenticated using (true);

-- All authenticated users can read and write all inventory
create policy "Authenticated users manage all inventory"
  on public.inventory_items for all to authenticated
  using (true) with check (true);

-- Users manage only their own settings
create policy "Users manage own settings"
  on public.user_settings for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Users see only their own alerts
create policy "Users manage own alerts"
  on public.alerts for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Service role has full access to all tables (used by API routes with service key)
create policy "Service role full access to sets"
  on public.sets for all to service_role using (true) with check (true);

create policy "Service role full access to price_snapshots"
  on public.price_snapshots for all to service_role using (true) with check (true);

create policy "Service role full access to alerts"
  on public.alerts for all to service_role using (true) with check (true);

create policy "Service role full access to inventory"
  on public.inventory_items for all to service_role using (true) with check (true);

create policy "Service role full access to user_settings"
  on public.user_settings for all to service_role using (true) with check (true);
