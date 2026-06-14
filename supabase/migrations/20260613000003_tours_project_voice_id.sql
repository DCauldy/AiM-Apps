alter table public.tours_projects
  add column if not exists elevenlabs_voice_id text;
