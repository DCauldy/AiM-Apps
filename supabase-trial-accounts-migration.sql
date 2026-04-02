-- Trial Accounts Migration
-- Adds tier system, usage tracking, and account linking for trial users

-- ─── 1. Add tier columns to profiles ───────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'trial'
    CHECK (tier IN ('trial', 'full')),
  ADD COLUMN IF NOT EXISTS wp_user_id INT,
  ADD COLUMN IF NOT EXISTS linked_at TIMESTAMPTZ;

-- ─── 2. All existing AiM users are full members ─────────────────────────────
-- Only run this if you want to backfill existing users as 'full'.
-- Comment out if you want to start fresh.
UPDATE public.profiles SET tier = 'full' WHERE tier = 'trial';

-- ─── 3. Usage tracking table ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prompt_studio_usage (
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  period  TEXT NOT NULL,   -- 'YYYY-MM' format, e.g. '2026-03'
  count   INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, period)
);

ALTER TABLE public.prompt_studio_usage ENABLE ROW LEVEL SECURITY;

-- Users can only read their own usage
DROP POLICY IF EXISTS "Users can view own usage" ON public.prompt_studio_usage;
CREATE POLICY "Users can view own usage" ON public.prompt_studio_usage
  FOR SELECT USING (auth.uid() = user_id);

-- ─── 4. Atomic increment function (used by API routes) ───────────────────────
CREATE OR REPLACE FUNCTION public.increment_trial_usage(
  p_user_id UUID,
  p_period  TEXT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.prompt_studio_usage (user_id, period, count)
  VALUES (p_user_id, p_period, 1)
  ON CONFLICT (user_id, period)
  DO UPDATE SET count = prompt_studio_usage.count + 1;
END;
$$;
