-- Tours optional scene enrichment: durable per-scene fact/proof model.

create unique index if not exists tour_scenes_id_project_id_idx
  on public.tour_scenes (id, project_id);

create unique index if not exists tour_scene_source_photos_id_scene_project_idx
  on public.tour_scene_source_photos (id, scene_id, project_id);

create table if not exists public.tour_scene_facts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.tours_projects(id) on delete cascade,
  scene_id uuid not null,
  fact_text text not null,
  source_type text not null default 'human',
  source_label text,
  source_photo_id uuid,
  provenance jsonb not null default '{}'::jsonb,
  proof_status text not null default 'proofed',
  proofed_at timestamptz default now(),
  proofed_by uuid references auth.users(id) on delete set null,
  proof_metadata jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tour_scene_facts_scene_project_fk
    foreign key (scene_id, project_id)
    references public.tour_scenes(id, project_id)
    on delete cascade,
  constraint tour_scene_facts_source_photo_scope_fk
    foreign key (source_photo_id, scene_id, project_id)
    references public.tour_scene_source_photos(id, scene_id, project_id)
    on delete set null (source_photo_id),
  constraint tour_scene_facts_text_check
    check (char_length(btrim(fact_text)) > 0),
  constraint tour_scene_facts_source_type_check
    check (source_type in ('human', 'ai_suggestion')),
  constraint tour_scene_facts_proof_status_check
    check (proof_status in ('proofed', 'suggested', 'rejected')),
  constraint tour_scene_facts_sort_order_check
    check (sort_order >= 0),
  constraint tour_scene_facts_human_proofed_check
    check (source_type <> 'human' or proof_status = 'proofed'),
  constraint tour_scene_facts_proof_metadata_check
    check (
      (proof_status = 'proofed' and proofed_at is not null)
      or (proof_status <> 'proofed' and proofed_at is null and proofed_by is null)
    )
);

create unique index if not exists tour_scene_facts_scene_sort_order_idx
  on public.tour_scene_facts (scene_id, sort_order);

create index if not exists tour_scene_facts_project_scene_order_idx
  on public.tour_scene_facts (project_id, scene_id, sort_order asc, created_at asc);

create index if not exists tour_scene_facts_proofed_scene_order_idx
  on public.tour_scene_facts (scene_id, sort_order asc, created_at asc)
  where proof_status = 'proofed';

alter table public.tour_scene_facts enable row level security;

create policy "Users can read facts for their tour projects"
  on public.tour_scene_facts for select
  using (
    exists (
      select 1
      from public.tours_projects p
      where p.id = project_id
        and p.user_id = (select auth.uid())
    )
  );

create policy "Users can create facts for their open tour projects"
  on public.tour_scene_facts for insert
  with check (
    exists (
      select 1
      from public.tours_projects p
      where p.id = project_id
        and p.user_id = (select auth.uid())
        and p.status = 'open'
    )
  );

create policy "Users can update facts for their open tour projects"
  on public.tour_scene_facts for update
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

create policy "Users can delete facts for their open tour projects"
  on public.tour_scene_facts for delete
  using (
    exists (
      select 1
      from public.tours_projects p
      where p.id = project_id
        and p.user_id = (select auth.uid())
        and p.status = 'open'
    )
  );
