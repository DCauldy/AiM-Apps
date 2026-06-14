-- Tours listing-media authorization acknowledgement on Tour Projects.

drop table if exists public.tours_policy_acknowledgements;
drop table if exists public.tours_authorization_policies;

alter table public.tours_projects
  add column if not exists listing_media_acknowledged_at timestamptz;
