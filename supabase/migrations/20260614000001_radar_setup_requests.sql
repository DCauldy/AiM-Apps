-- Radar setup requests: customer-initiated "start tracking my brand" pipeline.
--
-- Created when a user with an active profile hits /apps/radar and there is
-- no matching brand report yet. Auto-research populates suggested_competitors
-- inline so ops doesn't have to guess; ops marks ready + links the brand
-- report ID once it's provisioned in the underlying tracking platform.

create table if not exists public.radar_setup_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.platform_profiles(id) on delete cascade,
  hostname text not null,
  status text not null default 'pending',
  -- Linkage back to the brand report once ops provisions it. Free-form
  -- string because Otterly uses ULIDs, not UUIDs.
  otterly_report_id text,
  -- Auto-research results: array of { name, domain?, source, rationale }
  -- where source is one of 'otterly_audit' | 'llm_profile'. Surfaced to
  -- ops verbatim in the admin page — never shown to the customer.
  suggested_competitors jsonb not null default '[]'::jsonb,
  research_error text,
  -- Ops workflow
  ops_notes text,
  completed_by uuid references auth.users(id) on delete set null,
  -- Timestamps
  requested_at timestamptz not null default now(),
  research_completed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint radar_setup_requests_status_check
    check (status in ('pending', 'researching', 'ready_for_ops', 'completed', 'failed', 'cancelled')),
  constraint radar_setup_requests_hostname_nonempty_check
    check (char_length(btrim(hostname)) > 0),
  constraint radar_setup_requests_suggested_competitors_array_check
    check (jsonb_typeof(suggested_competitors) = 'array'),
  constraint radar_setup_requests_completed_requires_report_check
    check (
      status <> 'completed'
      or (otterly_report_id is not null and completed_at is not null)
    )
);

-- Only one active (not-terminal) request per profile, so the dashboard
-- always knows which one to render the "warming up" state from.
create unique index if not exists radar_setup_requests_one_active_per_profile_idx
  on public.radar_setup_requests (profile_id)
  where status in ('pending', 'researching', 'ready_for_ops');

create index if not exists radar_setup_requests_user_status_idx
  on public.radar_setup_requests (user_id, status, requested_at desc);

create index if not exists radar_setup_requests_status_requested_idx
  on public.radar_setup_requests (status, requested_at desc);

alter table public.radar_setup_requests enable row level security;

-- Users read + insert their own. Admin reads/updates live in
-- service-role API routes (matches how the rest of the admin tooling
-- works in this repo) so we don't need a JWT-claim policy here.
create policy "Users can read their own radar setup requests"
  on public.radar_setup_requests for select
  using (user_id = (select auth.uid()));

create policy "Users can create their own radar setup requests"
  on public.radar_setup_requests for insert
  with check (user_id = (select auth.uid()));

create or replace function public.radar_setup_requests_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists radar_setup_requests_updated_at_trg
  on public.radar_setup_requests;

create trigger radar_setup_requests_updated_at_trg
  before update on public.radar_setup_requests
  for each row
  execute function public.radar_setup_requests_set_updated_at();
