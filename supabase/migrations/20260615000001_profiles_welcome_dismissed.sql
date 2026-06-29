-- ============================================================
-- Track when a user has dismissed the new-user welcome modal.
--
-- The welcome modal on /apps fires for any user who has no active
-- platform profile AND has never dismissed the intro. Once stamped,
-- the modal stays gone across devices — DB-backed (not localStorage)
-- so the user can't accidentally re-trigger it by switching browsers.
--
-- A user who completes profile setup naturally won't see the modal
-- anyway (active_profile_id becomes non-null) — this column is the
-- escape hatch for the "I want to browse first" path even though we
-- ship without a labeled secondary CTA today: the modal's close X
-- writes here so that single click is a real, persistent dismiss.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS welcome_dismissed_at TIMESTAMPTZ;
