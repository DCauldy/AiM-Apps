-- Radar setup: store LLM-suggested Otterly prompts alongside the
-- competitor suggestions. Ops copy/pastes these into Otterly's AI
-- Prompt Research tool when provisioning the brand report.

alter table public.radar_setup_requests
  add column if not exists suggested_prompts jsonb not null default '[]'::jsonb;

alter table public.radar_setup_requests
  drop constraint if exists radar_setup_requests_suggested_prompts_array_check;

alter table public.radar_setup_requests
  add constraint radar_setup_requests_suggested_prompts_array_check
  check (jsonb_typeof(suggested_prompts) = 'array');
