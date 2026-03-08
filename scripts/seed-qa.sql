-- QA Seed Script
-- Run this in Supabase SQL Editor (QA project only) after applying the migration.
-- Provides realistic test data for all components.

-- Seed sets
insert into public.sets (set_number, name, theme, piece_count, retail_price_usd, retired, retirement_date)
values
  ('75192', 'Millennium Falcon', 'Star Wars', 7541, 849.99, false, null),
  ('10294', 'Titanic', 'Icons', 9090, 679.99, false, null),
  ('21325', 'Medieval Blacksmith', 'Ideas', 2164, 179.99, true, '2023-06-01'),
  ('42154', 'Ford GT', 'Technic', 1466, 239.99, false, null);

-- Seed price_snapshots (90 days of history for trend testing)
insert into public.price_snapshots (set_id, source, avg_price_usd, min_price_usd, max_price_usd, demand_score, listings_count, fetched_at)
select
  s.id,
  'ebay',
  case s.set_number
    when '75192' then round((950.00 + (random() * 100))::numeric, 2)
    when '10294' then round((720.00 + (random() * 80))::numeric, 2)
    when '21325' then round((280.00 + (random() * 60))::numeric, 2)
    when '42154' then round((260.00 + (random() * 40))::numeric, 2)
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
  floor(random() * 40 + 60)::integer,
  floor(random() * 50 + 10)::integer,
  now() - (n || ' days')::interval
from public.sets s, generate_series(1, 90, 10) as n
where s.set_number in ('75192', '10294', '21325', '42154');

-- Price spike scenario: 75192 recent jump (triggers price_spike alert in Phase 2)
insert into public.price_snapshots (set_id, source, avg_price_usd, min_price_usd, max_price_usd, demand_score, listings_count, fetched_at)
select id, 'ebay', 1200.00, 1100.00, 1350.00, 95, 42, now()
from public.sets where set_number = '75192';
