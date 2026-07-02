-- Heat: demand-intelligence app. Ranks area listings by buyer demand
-- (views/saves) via the Heat Score. See HEAT_PLAN.md.

insert into public.admin_settings (key, value, description)
values ('HEAT', 'true', 'Enable Heat — hottest-listings demand ranking app')
on conflict (key) do nothing;

-- ============================================================
-- heat_searches — a board an agent ran (params + status). User-owned.
-- ============================================================
create table if not exists public.heat_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  zips text[] not null,
  min_price int,
  max_price int,
  home_types text,
  mode text not null default 'magic' check (mode in ('magic', 'control')),
  audience text not null default 'buyer' check (audience in ('buyer', 'listing')),
  weights jsonb,
  status text not null default 'running' check (status in ('running', 'ready', 'error')),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.heat_searches enable row level security;

create policy "Users can read their own heat searches"
  on public.heat_searches for select
  using (auth.uid() = user_id);

create policy "Users can create their own heat searches"
  on public.heat_searches for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own heat searches"
  on public.heat_searches for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own heat searches"
  on public.heat_searches for delete
  using (auth.uid() = user_id);

create index if not exists heat_searches_user_created_idx
  on public.heat_searches (user_id, created_at desc);

-- ============================================================
-- heat_listings — per-zpid market cache, refreshed at most daily.
-- Shared market data (not user data): readable by any authed user,
-- written by the enrich task via the service role (bypasses RLS).
-- ============================================================
create table if not exists public.heat_listings (
  zpid text primary key,
  address text,
  city text,
  state text,
  zip text,
  price int,
  beds numeric,
  baths numeric,
  living_area int,
  days_on_market int,
  property_type text,
  img_src text,
  detail_url text,
  -- latest demand snapshot (also appended to heat_listing_snapshots for history)
  page_view_count int,
  favorite_count int,
  price_cut_count int,
  last_enriched_at timestamptz
);

alter table public.heat_listings enable row level security;

create policy "Authenticated users can read heat listings"
  on public.heat_listings for select
  to authenticated
  using (true);

-- ============================================================
-- heat_listing_snapshots — daily views/saves history. THE velocity
-- source; write from day one (flow data can't be backfilled).
-- ============================================================
create table if not exists public.heat_listing_snapshots (
  id bigint generated always as identity primary key,
  zpid text not null references public.heat_listings(zpid) on delete cascade,
  captured_on date not null,
  page_view_count int,
  favorite_count int,
  price int,
  unique (zpid, captured_on)
);

alter table public.heat_listing_snapshots enable row level security;

create policy "Authenticated users can read heat snapshots"
  on public.heat_listing_snapshots for select
  to authenticated
  using (true);

create index if not exists heat_listing_snapshots_zpid_date_idx
  on public.heat_listing_snapshots (zpid, captured_on desc);

-- ============================================================
-- heat_search_results — scored ranking for a given search. Readable
-- when the parent search belongs to the user; written by the task.
-- ============================================================
create table if not exists public.heat_search_results (
  search_id uuid not null references public.heat_searches(id) on delete cascade,
  zpid text not null references public.heat_listings(zpid) on delete cascade,
  heat_score numeric,
  score_breakdown jsonb,
  badges text[],
  blurb text,
  rank int,
  primary key (search_id, zpid)
);

alter table public.heat_search_results enable row level security;

create policy "Users can read results for their own searches"
  on public.heat_search_results for select
  using (
    exists (
      select 1 from public.heat_searches s
      where s.id = heat_search_results.search_id
        and s.user_id = auth.uid()
    )
  );

create index if not exists heat_search_results_search_rank_idx
  on public.heat_search_results (search_id, rank);

-- ============================================================
-- heat_saved_boards — boards an agent pinned to revisit. User-owned.
-- ============================================================
create table if not exists public.heat_saved_boards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  search_id uuid not null references public.heat_searches(id) on delete cascade,
  name text,
  created_at timestamptz not null default now()
);

alter table public.heat_saved_boards enable row level security;

create policy "Users can read their own saved boards"
  on public.heat_saved_boards for select
  using (auth.uid() = user_id);

create policy "Users can create their own saved boards"
  on public.heat_saved_boards for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own saved boards"
  on public.heat_saved_boards for delete
  using (auth.uid() = user_id);
