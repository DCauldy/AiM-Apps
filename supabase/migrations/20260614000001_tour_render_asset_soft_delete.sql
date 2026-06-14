alter table public.tour_render_assets
  add column if not exists deleted_at timestamptz,
  add column if not exists storage_deleted_at timestamptz,
  add column if not exists delete_reason text;

alter table public.tour_render_assets
  drop constraint if exists tour_render_assets_deleted_not_reusable_check;

alter table public.tour_render_assets
  add constraint tour_render_assets_deleted_not_reusable_check
  check (
    (deleted_at is null and storage_deleted_at is null)
    or reusable = false
  );

alter table public.tour_render_assets
  drop constraint if exists tour_render_assets_delete_reason_check;

alter table public.tour_render_assets
  add constraint tour_render_assets_delete_reason_check
  check (
    delete_reason is null
    or char_length(btrim(delete_reason)) > 0
  );

create index if not exists tour_render_assets_project_available_idx
  on public.tour_render_assets (project_id, created_at desc)
  where deleted_at is null and storage_deleted_at is null;

create index if not exists tour_render_assets_deleted_idx
  on public.tour_render_assets (project_id, deleted_at desc)
  where deleted_at is not null;
