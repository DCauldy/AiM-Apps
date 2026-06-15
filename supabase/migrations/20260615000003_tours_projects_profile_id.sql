-- ============================================================
-- Add profile_id to tours_projects.
--
-- Per-profile API keys (ElevenLabs/HeyGen) need a deterministic
-- mapping from a tour project to a profile. Without this, render
-- code would have to read profiles.active_profile_id at render
-- time and grab whichever profile is currently active — wrong if
-- the user switches profiles mid-render flow.
--
-- Same backfill rule as user_api_keys: prefer the user's default
-- platform_profile, else any active one. Tour projects orphaned
-- from any profile get the user's default forced through after
-- backfill — we keep the project rather than delete it.
-- ============================================================

ALTER TABLE public.tours_projects
  ADD COLUMN IF NOT EXISTS profile_id UUID
    REFERENCES public.platform_profiles(id) ON DELETE SET NULL;

WITH winning_profile AS (
  SELECT DISTINCT ON (user_id)
    user_id,
    id AS profile_id
  FROM public.platform_profiles
  WHERE archived_at IS NULL
  ORDER BY user_id, is_default DESC, created_at ASC
)
UPDATE public.tours_projects t
SET profile_id = w.profile_id
FROM winning_profile w
WHERE t.user_id = w.user_id
  AND t.profile_id IS NULL;

-- Backfill leaves profile_id null for users with no profile yet.
-- We don't NOT-NULL it: those projects predate the profile system
-- and a SET NULL on profile delete needs to stay valid. Render
-- code treats null as "use user's default profile at render time"
-- as a safety net (see lib/tours/rendering/*).

CREATE INDEX IF NOT EXISTS tours_projects_profile_id_idx
  ON public.tours_projects (profile_id)
  WHERE profile_id IS NOT NULL;
