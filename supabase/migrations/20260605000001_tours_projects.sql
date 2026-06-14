-- Tours projects: one-property project shell for AiM Tours.

insert into public.admin_settings (key, value, description)
values ('TOURS', 'true', 'Enable Tours listing project workspace app')
on conflict (key) do nothing;

create table if not exists public.tours_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  property_address text not null,
  listing_url text,
  status text not null default 'open' check (status in ('open', 'archived')),
  listing_media_acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

alter table public.tours_projects enable row level security;

create policy "Users can read their own tour projects"
  on public.tours_projects for select
  using (auth.uid() = user_id);

create policy "Users can create their own tour projects"
  on public.tours_projects for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own tour projects"
  on public.tours_projects for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists tours_projects_user_status_created_idx
  on public.tours_projects (user_id, status, created_at desc);
