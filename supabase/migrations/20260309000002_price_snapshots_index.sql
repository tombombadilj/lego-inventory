-- Performance index for fast "latest snapshot per set" queries
-- Used by /api/prices/fetch and dashboard to get most recent price data
create index if not exists idx_price_snapshots_set_fetched
  on public.price_snapshots (set_id, fetched_at desc);
