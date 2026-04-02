-- Rename 'saved' column to 'starred' in threads table
-- This migration renames the column for clarity: 'saved' is for community prompts, 'starred' is for threads

-- Add the new 'starred' column if it doesn't exist
alter table public.threads add column if not exists starred boolean default false;

-- Copy data from 'saved' to 'starred' if 'saved' column exists
do $$
begin
  if exists (select 1 from information_schema.columns 
             where table_schema = 'public' 
             and table_name = 'threads' 
             and column_name = 'saved') then
    update public.threads 
    set starred = coalesce(saved, false)
    where starred = false;
    
    -- Drop the old 'saved' column
    alter table public.threads drop column saved;
  end if;
end $$;

-- Drop old index if it exists
drop index if exists idx_threads_saved;

-- Create index for starred column for faster filtering
create index if not exists idx_threads_starred on public.threads(starred) where starred = true;

