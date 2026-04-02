-- Persist questions and answers on threads so they survive page refreshes
ALTER TABLE public.threads
  ADD COLUMN IF NOT EXISTS questions JSONB,
  ADD COLUMN IF NOT EXISTS answers   JSONB;
