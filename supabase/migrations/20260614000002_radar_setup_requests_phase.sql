-- Radar setup: granular phase tracking for the Trigger.dev research task.
--
-- The setup API insert returns immediately and dispatches a background
-- Trigger.dev task; the client polls /api/apps/radar/setup/[id]/status
-- and advances its UX phases based on `phase` here. Trigger.dev's run
-- ID is captured so we can surface it in admin tooling and (later)
-- subscribe to live runs if we move from polling to SSE.

alter table public.radar_setup_requests
  add column if not exists phase text not null default 'created',
  add column if not exists trigger_run_id text;

alter table public.radar_setup_requests
  drop constraint if exists radar_setup_requests_phase_check;

alter table public.radar_setup_requests
  add constraint radar_setup_requests_phase_check
  check (phase in ('created', 'started', 'researching', 'merging', 'ready_for_ops', 'failed'));

create index if not exists radar_setup_requests_trigger_run_id_idx
  on public.radar_setup_requests (trigger_run_id)
  where trigger_run_id is not null;
