-- Add topic column to messages table
alter table public.messages add column if not exists topic text;

-- Create index for topic filtering performance
create index if not exists idx_messages_topic on public.messages(topic) where is_public = true and topic is not null;




