-- ============================================================
-- Move user_api_keys from user-scoped to profile-scoped storage.
--
-- Today: one ElevenLabs/HeyGen key per user, used by Tours.
-- Tomorrow: one key per platform_profile, so multi-profile users
-- can run a different HeyGen account per team/persona.
--
-- Sequence:
--   1. Add nullable profile_id column.
--   2. Backfill from each user's default platform_profile (or
--      any active profile as fallback). Drop orphans whose user
--      has no profile at all — they couldn't have used Tours.
--   3. Lock profile_id NOT NULL.
--   4. Swap the unique constraint from (user_id, service_key) to
--      (profile_id, service_key). user_id stays for RLS efficiency
--      (no join needed in the policy).
--   5. Rewrite RLS so a user can manage keys whose profile they own.
-- ============================================================

-- 1. Column
ALTER TABLE public.user_api_keys
  ADD COLUMN IF NOT EXISTS profile_id UUID
    REFERENCES public.platform_profiles(id) ON DELETE CASCADE;

-- 2. Backfill — prefer the default profile, fall back to any active one.
--   The CTE finds the "winning" profile per user_id: default if exists,
--   otherwise the oldest non-archived.
WITH winning_profile AS (
  SELECT DISTINCT ON (user_id)
    user_id,
    id AS profile_id
  FROM public.platform_profiles
  WHERE archived_at IS NULL
  ORDER BY user_id, is_default DESC, created_at ASC
)
UPDATE public.user_api_keys k
SET profile_id = w.profile_id
FROM winning_profile w
WHERE k.user_id = w.user_id
  AND k.profile_id IS NULL;

-- Orphans (user has no profile at all): cannot belong to any profile,
-- drop them. These users haven't completed setup so the keys are dead.
DELETE FROM public.user_api_keys WHERE profile_id IS NULL;

-- 3. NOT NULL
ALTER TABLE public.user_api_keys
  ALTER COLUMN profile_id SET NOT NULL;

-- 4. Swap unique constraint
ALTER TABLE public.user_api_keys
  DROP CONSTRAINT IF EXISTS user_api_keys_one_per_service;
ALTER TABLE public.user_api_keys
  ADD CONSTRAINT user_api_keys_one_per_profile_service
  UNIQUE (profile_id, service_key);

-- Index for fast lookup by profile
CREATE INDEX IF NOT EXISTS user_api_keys_profile_id_idx
  ON public.user_api_keys (profile_id);

-- 5. RLS — user can manage keys whose profile they own
DROP POLICY IF EXISTS user_api_keys_select_own ON public.user_api_keys;
DROP POLICY IF EXISTS user_api_keys_insert_own ON public.user_api_keys;
DROP POLICY IF EXISTS user_api_keys_update_own ON public.user_api_keys;
DROP POLICY IF EXISTS user_api_keys_delete_own ON public.user_api_keys;

CREATE POLICY user_api_keys_select_own ON public.user_api_keys
  FOR SELECT USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.platform_profiles p
      WHERE p.id = user_api_keys.profile_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY user_api_keys_insert_own ON public.user_api_keys
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.platform_profiles p
      WHERE p.id = profile_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY user_api_keys_update_own ON public.user_api_keys
  FOR UPDATE USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.platform_profiles p
      WHERE p.id = user_api_keys.profile_id AND p.user_id = auth.uid()
    )
  ) WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.platform_profiles p
      WHERE p.id = profile_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY user_api_keys_delete_own ON public.user_api_keys
  FOR DELETE USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.platform_profiles p
      WHERE p.id = user_api_keys.profile_id AND p.user_id = auth.uid()
    )
  );
