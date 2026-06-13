-- Tours render pipeline: product-owned run state, generated assets, and output storage.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tours-generated-media',
  'tours-generated-media',
  false,
  536870912,
  array[
    'application/json',
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'video/mp4',
    'video/webm'
  ]
)
on conflict (id) do nothing;

-- Path convention: {user_id}/{project_id}/{run_id}/{artifact}
create policy "Users can read their own Tours generated media"
  on storage.objects for select
  using (
    bucket_id = 'tours-generated-media'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users can upload their own Tours generated media"
  on storage.objects for insert
  with check (
    bucket_id = 'tours-generated-media'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users can update their own Tours generated media"
  on storage.objects for update
  using (
    bucket_id = 'tours-generated-media'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users can delete their own Tours generated media"
  on storage.objects for delete
  using (
    bucket_id = 'tours-generated-media'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create table if not exists public.tour_render_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.tours_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  trigger_run_id text,
  status text not null default 'queued',
  current_step text not null default 'queued',
  current_step_label text not null default 'Queued',
  progress_percent integer not null default 0,
  scene_clip_completed_count integer not null default 0,
  scene_clip_total_count integer not null default 0,
  options jsonb not null default '{}'::jsonb,
  error_message text,
  result_asset_id uuid,
  started_at timestamptz,
  completed_at timestamptz,
  heartbeat_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tour_render_runs_status_check
    check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  constraint tour_render_runs_progress_percent_check
    check (progress_percent between 0 and 100),
  constraint tour_render_runs_scene_clip_counts_check
    check (
      scene_clip_completed_count >= 0
      and scene_clip_total_count >= 0
      and scene_clip_completed_count <= scene_clip_total_count
    ),
  constraint tour_render_runs_options_object_check
    check (jsonb_typeof(options) = 'object'),
  constraint tour_render_runs_result_requires_completion_check
    check (result_asset_id is null or status = 'completed'),
  constraint tour_render_runs_error_status_check
    check (error_message is null or status in ('failed', 'cancelled'))
);

create index if not exists tour_render_runs_project_created_idx
  on public.tour_render_runs (project_id, created_at desc);

create index if not exists tour_render_runs_user_status_idx
  on public.tour_render_runs (user_id, status, created_at desc);

create index if not exists tour_render_runs_result_asset_idx
  on public.tour_render_runs (result_asset_id)
  where result_asset_id is not null;

create unique index if not exists tour_render_runs_trigger_run_id_idx
  on public.tour_render_runs (trigger_run_id)
  where trigger_run_id is not null;

create unique index if not exists tour_render_runs_id_project_idx
  on public.tour_render_runs (id, project_id);

create table if not exists public.tour_render_run_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.tour_render_runs(id) on delete cascade,
  project_id uuid not null references public.tours_projects(id) on delete cascade,
  step text not null,
  status text not null,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint tour_render_run_events_status_check
    check (status in ('queued', 'running', 'completed', 'failed', 'cancelled', 'info')),
  constraint tour_render_run_events_step_check
    check (char_length(btrim(step)) > 0),
  constraint tour_render_run_events_metadata_object_check
    check (jsonb_typeof(metadata) = 'object')
);

create index if not exists tour_render_run_events_run_created_idx
  on public.tour_render_run_events (run_id, created_at asc);

create index if not exists tour_render_run_events_project_created_idx
  on public.tour_render_run_events (project_id, created_at desc);

create table if not exists public.tour_render_assets (
  id uuid primary key default gen_random_uuid(),
  created_by_run_id uuid,
  project_id uuid not null references public.tours_projects(id) on delete cascade,
  scene_id uuid,
  kind text not null,
  storage_bucket text,
  storage_path text,
  content_type text,
  fingerprint_hash text not null,
  fingerprint jsonb not null,
  reusable boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint tour_render_assets_kind_check
    check (kind in (
      'script_plan',
      'narration_text',
      'voiceover_audio',
      'voiceover_transcript',
      'scene_transitions',
      'scene_durations',
      'scene_clip',
      'joined_scenes',
      'final_video'
    )),
  constraint tour_render_assets_storage_pair_check
    check (
      (storage_bucket is null and storage_path is null)
      or (storage_bucket is not null and storage_path is not null)
    ),
  constraint tour_render_assets_fingerprint_hash_check
    check (char_length(btrim(fingerprint_hash)) > 0),
  constraint tour_render_assets_fingerprint_object_check
    check (jsonb_typeof(fingerprint) = 'object'),
  constraint tour_render_assets_metadata_object_check
    check (jsonb_typeof(metadata) = 'object')
);

alter table public.tour_render_assets
  add constraint tour_render_assets_scene_project_fkey
  foreign key (scene_id, project_id)
  references public.tour_scenes(id, project_id)
  on delete set null (scene_id);

alter table public.tour_render_assets
  add constraint tour_render_assets_created_by_run_project_fkey
  foreign key (created_by_run_id, project_id)
  references public.tour_render_runs(id, project_id)
  on delete set null (created_by_run_id);

create unique index if not exists tour_render_assets_id_project_idx
  on public.tour_render_assets (id, project_id);

alter table public.tour_render_runs
  add constraint tour_render_runs_result_asset_project_fkey
  foreign key (result_asset_id, project_id)
  references public.tour_render_assets(id, project_id)
  on delete set null (result_asset_id);

create index if not exists tour_render_assets_project_kind_fingerprint_idx
  on public.tour_render_assets (project_id, kind, fingerprint_hash, created_at desc);

create index if not exists tour_render_assets_scene_kind_fingerprint_idx
  on public.tour_render_assets (scene_id, kind, fingerprint_hash, created_at desc)
  where scene_id is not null;

create index if not exists tour_render_assets_created_by_run_idx
  on public.tour_render_assets (created_by_run_id, created_at desc)
  where created_by_run_id is not null;

create table if not exists public.tour_render_run_assets (
  run_id uuid not null references public.tour_render_runs(id) on delete cascade,
  asset_id uuid not null references public.tour_render_assets(id) on delete restrict,
  usage text not null default 'used',
  created_at timestamptz not null default now(),
  primary key (run_id, asset_id, usage),
  constraint tour_render_run_assets_usage_check
    check (usage in ('created', 'reused', 'used', 'result'))
);

create index if not exists tour_render_run_assets_asset_idx
  on public.tour_render_run_assets (asset_id, created_at desc);

alter table public.tour_render_runs enable row level security;
alter table public.tour_render_run_events enable row level security;
alter table public.tour_render_assets enable row level security;
alter table public.tour_render_run_assets enable row level security;

create policy "Users can read their own tour render runs"
  on public.tour_render_runs for select
  using (user_id = (select auth.uid()));

create policy "Users can create render runs for their open tour projects"
  on public.tour_render_runs for insert
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.tours_projects p
      where p.id = project_id
        and p.user_id = (select auth.uid())
        and p.status = 'open'
    )
  );

create policy "Users can update their own tour render runs"
  on public.tour_render_runs for update
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.tours_projects p
      where p.id = project_id
        and p.user_id = (select auth.uid())
    )
  );

create policy "Users can read events for their tour render runs"
  on public.tour_render_run_events for select
  using (
    exists (
      select 1
      from public.tour_render_runs r
      where r.id = run_id
        and r.user_id = (select auth.uid())
    )
  );

create policy "Users can create events for their tour render runs"
  on public.tour_render_run_events for insert
  with check (
    exists (
      select 1
      from public.tour_render_runs r
      where r.id = run_id
        and r.project_id = project_id
        and r.user_id = (select auth.uid())
    )
  );

create policy "Users can read render assets for their tour projects"
  on public.tour_render_assets for select
  using (
    exists (
      select 1
      from public.tours_projects p
      where p.id = project_id
        and p.user_id = (select auth.uid())
    )
  );

create policy "Users can create render assets for their open tour projects"
  on public.tour_render_assets for insert
  with check (
    exists (
      select 1
      from public.tours_projects p
      where p.id = project_id
        and p.user_id = (select auth.uid())
        and p.status = 'open'
    )
  );

create policy "Users can update render assets for their open tour projects"
  on public.tour_render_assets for update
  using (
    exists (
      select 1
      from public.tours_projects p
      where p.id = project_id
        and p.user_id = (select auth.uid())
        and p.status = 'open'
    )
  )
  with check (
    exists (
      select 1
      from public.tours_projects p
      where p.id = project_id
        and p.user_id = (select auth.uid())
        and p.status = 'open'
    )
  );

create policy "Users can read render run assets for their tour render runs"
  on public.tour_render_run_assets for select
  using (
    exists (
      select 1
      from public.tour_render_runs r
      where r.id = run_id
        and r.user_id = (select auth.uid())
    )
  );

create policy "Users can create render run assets for their tour render runs"
  on public.tour_render_run_assets for insert
  with check (
    exists (
      select 1
      from public.tour_render_runs r
      join public.tour_render_assets a on a.id = asset_id
      where r.id = run_id
        and r.project_id = a.project_id
        and r.user_id = (select auth.uid())
    )
  );
