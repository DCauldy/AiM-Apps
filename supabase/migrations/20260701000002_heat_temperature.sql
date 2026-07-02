-- Heat: sold-comp baseline + absolute temperature tier.
-- baseline (90-day sold comps) is stored per search so the board can show
-- "what typical looks like"; temperature is the headline tier per result.

alter table public.heat_searches
  add column if not exists baseline jsonb;

alter table public.heat_search_results
  add column if not exists temperature text;
