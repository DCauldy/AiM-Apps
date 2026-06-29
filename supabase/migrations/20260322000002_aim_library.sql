-- AiM Library tables for admin-curated prompt content.

create table if not exists public.aim_prompts (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  title text,
  description text,
  topic text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.aim_prompt_upvotes (
  id uuid primary key default gen_random_uuid(),
  aim_prompt_id uuid not null references public.aim_prompts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  unique (aim_prompt_id, user_id)
);

create table if not exists public.aim_saved_prompts (
  id uuid primary key default gen_random_uuid(),
  aim_prompt_id uuid not null references public.aim_prompts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  unique (aim_prompt_id, user_id)
);

alter table public.aim_prompts enable row level security;
alter table public.aim_prompt_upvotes enable row level security;
alter table public.aim_saved_prompts enable row level security;

create policy "Anyone can view aim_prompts"
  on public.aim_prompts for select
  using (true);

create policy "Anyone can view aim_prompt_upvotes"
  on public.aim_prompt_upvotes for select
  using (true);

create policy "Users can insert own aim upvotes"
  on public.aim_prompt_upvotes for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own aim upvotes"
  on public.aim_prompt_upvotes for delete
  using (auth.uid() = user_id);

create policy "Users can view own aim saved"
  on public.aim_saved_prompts for select
  using (auth.uid() = user_id);

create policy "Users can insert own aim saved"
  on public.aim_saved_prompts for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own aim saved"
  on public.aim_saved_prompts for delete
  using (auth.uid() = user_id);

create or replace function public.update_aim_prompts_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger aim_prompts_updated_at
  before update on public.aim_prompts
  for each row execute function public.update_aim_prompts_updated_at();
