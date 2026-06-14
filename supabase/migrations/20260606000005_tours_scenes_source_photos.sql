-- Tours scene builder: ordered TourScenes with authoritative listing-photo source media.

create table if not exists public.tour_scenes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.tours_projects(id) on delete cascade,
  title text not null,
  sort_order integer not null,
  included boolean not null default true,
  camera_motion text not null default 'slow_push',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tour_scenes_sort_order_check check (sort_order >= 0),
  constraint tour_scenes_camera_motion_check
    check (camera_motion in ('slow_push', 'slow_pan', 'static_hold'))
);

create unique index if not exists tour_scenes_project_sort_order_idx
  on public.tour_scenes (project_id, sort_order);

create index if not exists tour_scenes_project_order_idx
  on public.tour_scenes (project_id, sort_order asc, created_at asc);

alter table public.tour_scenes enable row level security;

create policy "Users can read scenes for their tour projects"
  on public.tour_scenes for select
  using (
    exists (
      select 1
      from public.tours_projects p
      where p.id = project_id
        and p.user_id = auth.uid()
    )
  );

create policy "Users can create scenes for their open tour projects"
  on public.tour_scenes for insert
  with check (
    exists (
      select 1
      from public.tours_projects p
      where p.id = project_id
        and p.user_id = auth.uid()
        and p.status = 'open'
    )
  );

create policy "Users can update scenes for their open tour projects"
  on public.tour_scenes for update
  using (
    exists (
      select 1
      from public.tours_projects p
      where p.id = project_id
        and p.user_id = auth.uid()
        and p.status = 'open'
    )
  )
  with check (
    exists (
      select 1
      from public.tours_projects p
      where p.id = project_id
        and p.user_id = auth.uid()
        and p.status = 'open'
    )
  );

create table if not exists public.tour_scene_source_photos (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.tours_projects(id) on delete cascade,
  scene_id uuid not null references public.tour_scenes(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  content_type text not null,
  byte_size bigint not null,
  width integer,
  height integer,
  priority integer not null default 0,
  created_at timestamptz not null default now(),
  constraint tour_scene_source_photos_byte_size_check check (byte_size > 0),
  constraint tour_scene_source_photos_dimensions_check
    check ((width is null or width > 0) and (height is null or height > 0)),
  constraint tour_scene_source_photos_priority_check check (priority >= 0),
  constraint tour_scene_source_photos_content_type_check
    check (content_type in ('image/jpeg', 'image/png', 'image/webp'))
);

create unique index if not exists tour_scene_source_photos_scene_priority_idx
  on public.tour_scene_source_photos (scene_id, priority);

create index if not exists tour_scene_source_photos_scene_order_idx
  on public.tour_scene_source_photos (scene_id, priority asc, created_at asc);

alter table public.tour_scene_source_photos enable row level security;

create policy "Users can read source photos for their tour projects"
  on public.tour_scene_source_photos for select
  using (
    exists (
      select 1
      from public.tours_projects p
      where p.id = project_id
        and p.user_id = auth.uid()
    )
  );

create policy "Users can create source photos for their open tour projects"
  on public.tour_scene_source_photos for insert
  with check (
    exists (
      select 1
      from public.tours_projects p
      where p.id = project_id
        and p.user_id = auth.uid()
        and p.status = 'open'
    )
    and exists (
      select 1
      from public.tour_scenes s
      where s.id = scene_id
        and s.project_id = project_id
    )
  );

create policy "Users can update source photos for their open tour projects"
  on public.tour_scene_source_photos for update
  using (
    exists (
      select 1
      from public.tours_projects p
      where p.id = project_id
        and p.user_id = auth.uid()
        and p.status = 'open'
    )
  )
  with check (
    exists (
      select 1
      from public.tours_projects p
      where p.id = project_id
        and p.user_id = auth.uid()
        and p.status = 'open'
    )
    and exists (
      select 1
      from public.tour_scenes s
      where s.id = scene_id
        and s.project_id = project_id
    )
  );
