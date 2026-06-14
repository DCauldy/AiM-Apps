-- Radar customer self-service: change requests + notification state.
--
-- radar_change_requests
--   Customer-submitted "add a prompt" / "add a competitor" requests.
--   Until Otterly's partner API exposes write endpoints for these,
--   ops fulfills them manually in Otterly's UI (same pattern as
--   radar_setup_requests).
--
-- radar_notification_state
--   Per-profile snapshot for daily alert diffing + per-customer
--   email opt-out toggles. One row per profile; created lazily on
--   first notification send (or first toggle write).

create table if not exists public.radar_change_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.platform_profiles(id) on delete cascade,
  type text not null,
  -- Free-form payload by type:
  --   add_prompt:     { prompt: string }
  --   add_competitor: { brand: string, domain?: string }
  payload jsonb not null,
  status text not null default 'pending',
  ops_notes text,
  completed_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint radar_change_requests_type_check
    check (type in ('add_prompt', 'add_competitor')),
  constraint radar_change_requests_status_check
    check (status in ('pending', 'completed', 'rejected', 'cancelled')),
  constraint radar_change_requests_payload_object_check
    check (jsonb_typeof(payload) = 'object'),
  constraint radar_change_requests_completed_requires_ts_check
    check (status <> 'completed' or completed_at is not null)
);

create index if not exists radar_change_requests_user_status_idx
  on public.radar_change_requests (user_id, status, requested_at desc);

create index if not exists radar_change_requests_status_requested_idx
  on public.radar_change_requests (status, requested_at desc);

create index if not exists radar_change_requests_profile_idx
  on public.radar_change_requests (profile_id, requested_at desc);

alter table public.radar_change_requests enable row level security;

create policy "Users can read their own radar change requests"
  on public.radar_change_requests for select
  using (user_id = (select auth.uid()));

create policy "Users can create their own radar change requests"
  on public.radar_change_requests for insert
  with check (user_id = (select auth.uid()));

create or replace function public.radar_change_requests_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists radar_change_requests_updated_at_trg
  on public.radar_change_requests;

create trigger radar_change_requests_updated_at_trg
  before update on public.radar_change_requests
  for each row
  execute function public.radar_change_requests_set_updated_at();

-- ---------------------------------------------------------------------------

create table if not exists public.radar_notification_state (
  profile_id uuid primary key references public.platform_profiles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Opt-out toggles. Default both on; user disables from Settings.
  alerts_enabled boolean not null default true,
  digest_enabled boolean not null default true,
  -- Snapshot of yesterday's tracked state so the daily-alerts task
  -- can detect rank drops + competitor passes. Populated by the task.
  last_main_brand_rank integer,
  last_top_competitor_brand text,
  last_top_competitor_rank integer,
  last_snapshot_at timestamptz,
  -- Send-history dedup so we don't spam if the same condition holds
  -- for multiple consecutive days.
  last_alert_sent_at timestamptz,
  last_alert_reason text,
  last_digest_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists radar_notification_state_user_idx
  on public.radar_notification_state (user_id);

alter table public.radar_notification_state enable row level security;

create policy "Users can read their own radar notification state"
  on public.radar_notification_state for select
  using (user_id = (select auth.uid()));

create policy "Users can update their own radar notification state"
  on public.radar_notification_state for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Users can insert their own radar notification state"
  on public.radar_notification_state for insert
  with check (user_id = (select auth.uid()));

create or replace function public.radar_notification_state_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists radar_notification_state_updated_at_trg
  on public.radar_notification_state;

create trigger radar_notification_state_updated_at_trg
  before update on public.radar_notification_state
  for each row
  execute function public.radar_notification_state_set_updated_at();
