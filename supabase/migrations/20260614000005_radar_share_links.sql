-- Radar share links: customer-generated public read-only URLs
-- for a sanitized Radar dashboard. Word-of-mouth driver — agents
-- share their AI visibility with broker, team, lender.
--
-- Tokens are opaque random strings (not UUIDs) so the URL stays
-- short and the underlying profile_id is never leaked. Lookup is
-- token → profile_id → live Otterly data fetch (no snapshot stored
-- on this row — always shows current).

create table if not exists public.radar_share_links (
  id uuid primary key default gen_random_uuid(),
  -- 16-32 char opaque slug. Generated server-side, never derivable.
  token text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.platform_profiles(id) on delete cascade,
  -- Optional human label so the owner can tell their links apart.
  label text,
  is_active boolean not null default true,
  view_count integer not null default 0,
  last_viewed_at timestamptz,
  created_at timestamptz not null default now(),
  -- Null = never expires. Owner can set a cutoff at create time.
  expires_at timestamptz,
  constraint radar_share_links_token_format
    check (char_length(token) between 16 and 64),
  constraint radar_share_links_label_length
    check (label is null or char_length(label) <= 80)
);

create index if not exists radar_share_links_user_created_idx
  on public.radar_share_links (user_id, created_at desc);

-- Active-only lookup path used by the public /r/[token] route.
create index if not exists radar_share_links_token_active_idx
  on public.radar_share_links (token)
  where is_active = true;

alter table public.radar_share_links enable row level security;

-- Owner-only policies. Public reads go through a service-role API
-- route (/api/public/radar/[token]) — not direct from the browser.
create policy "Users can read their own radar share links"
  on public.radar_share_links for select
  using (user_id = (select auth.uid()));

create policy "Users can create their own radar share links"
  on public.radar_share_links for insert
  with check (user_id = (select auth.uid()));

create policy "Users can update their own radar share links"
  on public.radar_share_links for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Users can delete their own radar share links"
  on public.radar_share_links for delete
  using (user_id = (select auth.uid()));
