-- Add is_public column to messages table
alter table public.messages add column if not exists is_public boolean default false;
alter table public.messages add column if not exists title text;
alter table public.messages add column if not exists description text;

-- Create prompt_upvotes table
create table if not exists public.prompt_upvotes (
  id uuid default gen_random_uuid() primary key,
  message_id uuid references public.messages(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamp with time zone default now(),
  unique(message_id, user_id)
);

-- Create saved_prompts table
create table if not exists public.saved_prompts (
  id uuid default gen_random_uuid() primary key,
  message_id uuid references public.messages(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamp with time zone default now(),
  unique(message_id, user_id)
);

-- Create indexes for performance
create index if not exists idx_messages_is_public on public.messages(is_public) where is_public = true;
create index if not exists idx_prompt_upvotes_message_id on public.prompt_upvotes(message_id);
create index if not exists idx_prompt_upvotes_user_id on public.prompt_upvotes(user_id);
create index if not exists idx_saved_prompts_user_id on public.saved_prompts(user_id);
create index if not exists idx_saved_prompts_message_id on public.saved_prompts(message_id);

-- Enable Row Level Security
alter table public.prompt_upvotes enable row level security;
alter table public.saved_prompts enable row level security;

-- Drop existing policies if they exist
drop policy if exists "Anyone can view public messages" on public.messages;
drop policy if exists "Users can update own messages" on public.messages;
drop policy if exists "Anyone can view upvotes" on public.prompt_upvotes;
drop policy if exists "Users can create upvotes" on public.prompt_upvotes;
drop policy if exists "Authenticated users can create upvotes" on public.prompt_upvotes;
drop policy if exists "Users can delete own upvotes" on public.prompt_upvotes;
drop policy if exists "Users can view own saved prompts" on public.saved_prompts;
drop policy if exists "Users can create own saved prompts" on public.saved_prompts;
drop policy if exists "Users can delete own saved prompts" on public.saved_prompts;

-- RLS Policies for public messages
create policy "Anyone can view public messages" on public.messages
  for select using (is_public = true);

create policy "Users can update own messages" on public.messages
  for update using (
    exists (
      select 1 from public.threads
      where threads.id = messages.thread_id
      and threads.user_id = auth.uid()
    )
  );

-- RLS Policies for upvotes
create policy "Anyone can view upvotes" on public.prompt_upvotes
  for select using (true);

create policy "Authenticated users can create upvotes" on public.prompt_upvotes
  for insert with check (auth.uid() = user_id);

create policy "Users can delete own upvotes" on public.prompt_upvotes
  for delete using (auth.uid() = user_id);

-- RLS Policies for saved prompts
create policy "Users can view own saved prompts" on public.saved_prompts
  for select using (auth.uid() = user_id);

create policy "Users can create own saved prompts" on public.saved_prompts
  for insert with check (auth.uid() = user_id);

create policy "Users can delete own saved prompts" on public.saved_prompts
  for delete using (auth.uid() = user_id);

