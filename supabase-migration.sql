-- Create profiles table (extends auth.users)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  full_name text,
  memberstack_id text unique,
  subscription_status text default 'active',
  subscription_plan text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Create threads table
create table if not exists public.threads (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  title text default 'New Conversation',
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Create messages table
create table if not exists public.messages (
  id uuid default gen_random_uuid() primary key,
  thread_id uuid references public.threads(id) on delete cascade not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamp with time zone default now()
);

-- Create indexes for performance
create index if not exists idx_threads_user_id on public.threads(user_id);
create index if not exists idx_threads_updated_at on public.threads(updated_at desc);
create index if not exists idx_messages_thread_id on public.messages(thread_id);
create index if not exists idx_messages_created_at on public.messages(created_at);

-- Enable Row Level Security
alter table public.profiles enable row level security;
alter table public.threads enable row level security;
alter table public.messages enable row level security;

-- Drop existing policies if they exist (for idempotency)
drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Users can view own threads" on public.threads;
drop policy if exists "Users can create own threads" on public.threads;
drop policy if exists "Users can update own threads" on public.threads;
drop policy if exists "Users can delete own threads" on public.threads;
drop policy if exists "Users can view messages in own threads" on public.messages;
drop policy if exists "Users can create messages in own threads" on public.messages;

-- Create RLS policies: Users can only access their own data
create policy "Users can view own profile" on public.profiles
  for select using (auth.uid() = id);

create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);

create policy "Users can view own threads" on public.threads
  for select using (auth.uid() = user_id);

create policy "Users can create own threads" on public.threads
  for insert with check (auth.uid() = user_id);

create policy "Users can update own threads" on public.threads
  for update using (auth.uid() = user_id);

create policy "Users can delete own threads" on public.threads
  for delete using (auth.uid() = user_id);

create policy "Users can view messages in own threads" on public.messages
  for select using (
    exists (
      select 1 from public.threads
      where threads.id = messages.thread_id
      and threads.user_id = auth.uid()
    )
  );

create policy "Users can create messages in own threads" on public.messages
  for insert with check (
    exists (
      select 1 from public.threads
      where threads.id = messages.thread_id
      and threads.user_id = auth.uid()
    )
  );

-- Function to automatically create profile on user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name'
  );
  return new;
end;
$$ language plpgsql security definer;

-- Trigger to create profile when user signs up
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

