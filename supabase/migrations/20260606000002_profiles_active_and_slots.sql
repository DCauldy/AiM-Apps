-- ============================================================
-- Extend the global profiles table with multi-profile state.
--
-- - active_profile_id: which platform_profile the user is currently
--   operating under. Read by middleware on every /apps/* request.
-- - profile_slot_count: number of profile slots the user has paid
--   for (base 1 + Stripe per-seat add-ons). Updated by Stripe
--   webhook on subscription quantity change.
-- - slot_grace_period_ends_at: set when slot count drops below
--   active profile count; equals the end of the current Stripe
--   billing period. Past this date, middleware blocks /apps/*
--   except /apps/profile and /account until the user archives.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS active_profile_id UUID REFERENCES platform_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS profile_slot_count INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS slot_grace_period_ends_at TIMESTAMPTZ;

-- Sanity guard: slot count cannot be zero or negative
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_slot_count_positive
  CHECK (profile_slot_count >= 1);

-- Index for middleware lookup (already keyed by id, but explicit for clarity)
CREATE INDEX IF NOT EXISTS profiles_active_profile_idx
  ON public.profiles (active_profile_id)
  WHERE active_profile_id IS NOT NULL;
