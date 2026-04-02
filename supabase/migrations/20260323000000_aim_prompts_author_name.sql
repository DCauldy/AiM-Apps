-- Add optional author_name override to aim_prompts
-- NULL = display "AiM Prompts" (default); set explicitly to show a custom author name
ALTER TABLE public.aim_prompts
  ADD COLUMN IF NOT EXISTS author_name TEXT;
