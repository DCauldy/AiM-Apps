-- Heat: share a hot listing with a client via email/text, with a tracked
-- public "Request a Showing" landing page that closes the loop to an appointment.

create table if not exists public.heat_shares (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  zpid text,
  -- snapshot so the public landing page renders without a provider call
  listing jsonb,
  contact_name text,
  contact_email text,
  contact_phone text,
  channel text not null check (channel in ('email', 'text')),
  audience text not null default 'buyer' check (audience in ('buyer', 'listing')),
  message text,
  status text not null default 'sent'
    check (status in ('draft', 'sent', 'showing_requested')),
  showing_name text,
  showing_phone text,
  showing_note text,
  showing_requested_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.heat_shares enable row level security;

-- Owner-scoped access. The public landing page reads/writes by token via the
-- service role (server-side), so no public RLS policy is needed.
create policy "Users can read their own heat shares"
  on public.heat_shares for select
  using (auth.uid() = user_id);

create policy "Users can create their own heat shares"
  on public.heat_shares for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own heat shares"
  on public.heat_shares for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists heat_shares_user_created_idx
  on public.heat_shares (user_id, created_at desc);
