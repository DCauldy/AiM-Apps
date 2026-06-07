-- ============================================================
-- Move Blog Engine app-specific fields off user_profiles onto
-- bofu_schedules where they belong with the rest of the
-- per-profile-per-app config (schedule, frequency tier).
--
-- These columns are NOT part of the shared platform_profiles
-- identity — they describe HOW Blog Engine writes for the active
-- profile, not WHO that profile is.
-- ============================================================

ALTER TABLE bofu_schedules
  ADD COLUMN IF NOT EXISTS cta_primary TEXT,
  ADD COLUMN IF NOT EXISTS cta_link TEXT,
  ADD COLUMN IF NOT EXISTS cta_secondary TEXT,
  ADD COLUMN IF NOT EXISTS cta_secondary_link TEXT,
  ADD COLUMN IF NOT EXISTS blog_tone TEXT DEFAULT 'professional'
    CHECK (blog_tone IN ('professional', 'conversational', 'authoritative')),
  ADD COLUMN IF NOT EXISTS include_disclaimers BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_chat_thread_id UUID;

-- ============================================================
-- Backfill the new columns from user_profiles for every existing
-- bofu_schedules row. Match by user_id since both tables are
-- 1:1 with auth.users.
-- ============================================================

UPDATE bofu_schedules s
SET
  cta_primary = up.cta_primary,
  cta_link = up.cta_link,
  cta_secondary = up.cta_secondary,
  cta_secondary_link = up.cta_secondary_link,
  blog_tone = COALESCE(up.blog_tone, 'professional'),
  include_disclaimers = COALESCE(up.include_disclaimers, true),
  onboarding_completed = COALESCE(up.onboarding_completed, false),
  onboarding_chat_thread_id = up.onboarding_chat_thread_id,
  updated_at = NOW()
FROM user_profiles up
WHERE s.user_id = up.user_id;

-- For any user with a user_profiles row but no bofu_schedules row,
-- create a default schedule so their onboarding flag carries over.
INSERT INTO bofu_schedules (
  user_id,
  profile_id,
  cta_primary,
  cta_link,
  cta_secondary,
  cta_secondary_link,
  blog_tone,
  include_disclaimers,
  onboarding_completed,
  onboarding_chat_thread_id
)
SELECT
  up.user_id,
  (SELECT id FROM platform_profiles WHERE user_id = up.user_id AND is_default LIMIT 1),
  up.cta_primary,
  up.cta_link,
  up.cta_secondary,
  up.cta_secondary_link,
  COALESCE(up.blog_tone, 'professional'),
  COALESCE(up.include_disclaimers, true),
  COALESCE(up.onboarding_completed, false),
  up.onboarding_chat_thread_id
FROM user_profiles up
WHERE NOT EXISTS (
  SELECT 1 FROM bofu_schedules s WHERE s.user_id = up.user_id
);
