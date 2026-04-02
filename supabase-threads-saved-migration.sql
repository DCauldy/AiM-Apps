-- Add saved column to threads table for "Save for Later" feature
alter table public.threads add column if not exists saved boolean default false;

-- Create index for saved threads queries
create index if not exists idx_threads_saved on public.threads(saved) where saved = true;






