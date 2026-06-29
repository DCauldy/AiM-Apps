-- ============================================================
-- Add nullable profile_id to all top-level app-scoped tables.
--
-- During Phase 1 the column is NULLABLE so existing rows stay
-- valid. Phase 4's backfill migration populates profile_id from
-- the user's default platform_profile, then flips NOT NULL.
--
-- Child tables (e.g. bofu_blog_versions, hl_emails, messages)
-- intentionally do NOT receive a profile_id column — they join
-- through their parent.
-- ============================================================

-- ============================================================
-- Blog Engine
-- ============================================================
ALTER TABLE bofu_cms_connections
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES platform_profiles(id) ON DELETE CASCADE;
ALTER TABLE bofu_schedules
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES platform_profiles(id) ON DELETE CASCADE;
ALTER TABLE bofu_discovery_runs
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES platform_profiles(id) ON DELETE CASCADE;
ALTER TABLE bofu_topics
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES platform_profiles(id) ON DELETE CASCADE;
ALTER TABLE bofu_blogs
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES platform_profiles(id) ON DELETE CASCADE;
ALTER TABLE bofu_usage
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES platform_profiles(id) ON DELETE CASCADE;
ALTER TABLE bofu_pack_purchases
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES platform_profiles(id) ON DELETE CASCADE;
ALTER TABLE bofu_onboarding_chats
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES platform_profiles(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS bofu_cms_connections_profile_idx ON bofu_cms_connections (profile_id);
CREATE INDEX IF NOT EXISTS bofu_schedules_profile_idx ON bofu_schedules (profile_id);
CREATE INDEX IF NOT EXISTS bofu_topics_profile_idx ON bofu_topics (profile_id);
CREATE INDEX IF NOT EXISTS bofu_blogs_profile_idx ON bofu_blogs (profile_id);
CREATE INDEX IF NOT EXISTS bofu_usage_profile_idx ON bofu_usage (profile_id);

-- ============================================================
-- Radar
-- ============================================================
ALTER TABLE radar_config
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES platform_profiles(id) ON DELETE CASCADE;
ALTER TABLE radar_competitors
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES platform_profiles(id) ON DELETE CASCADE;
ALTER TABLE radar_queries
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES platform_profiles(id) ON DELETE CASCADE;
ALTER TABLE radar_checks
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES platform_profiles(id) ON DELETE CASCADE;
ALTER TABLE radar_audits
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES platform_profiles(id) ON DELETE CASCADE;
ALTER TABLE radar_usage
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES platform_profiles(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS radar_config_profile_idx ON radar_config (profile_id);
CREATE INDEX IF NOT EXISTS radar_competitors_profile_idx ON radar_competitors (profile_id);
CREATE INDEX IF NOT EXISTS radar_queries_profile_idx ON radar_queries (profile_id);
CREATE INDEX IF NOT EXISTS radar_checks_profile_idx ON radar_checks (profile_id);
CREATE INDEX IF NOT EXISTS radar_audits_profile_idx ON radar_audits (profile_id);
CREATE INDEX IF NOT EXISTS radar_usage_profile_idx ON radar_usage (profile_id);

-- ============================================================
-- Hyperlocal
-- ============================================================
ALTER TABLE hl_campaigns
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES platform_profiles(id) ON DELETE CASCADE;
ALTER TABLE hl_crm_connections
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES platform_profiles(id) ON DELETE CASCADE;
ALTER TABLE hl_email_connections
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES platform_profiles(id) ON DELETE CASCADE;
ALTER TABLE hl_runs
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES platform_profiles(id) ON DELETE CASCADE;
ALTER TABLE hl_suppressions
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES platform_profiles(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS hl_campaigns_profile_idx ON hl_campaigns (profile_id);
CREATE INDEX IF NOT EXISTS hl_crm_connections_profile_idx ON hl_crm_connections (profile_id);
CREATE INDEX IF NOT EXISTS hl_email_connections_profile_idx ON hl_email_connections (profile_id);
CREATE INDEX IF NOT EXISTS hl_runs_profile_idx ON hl_runs (profile_id);
CREATE INDEX IF NOT EXISTS hl_suppressions_profile_idx ON hl_suppressions (profile_id);

-- ============================================================
-- Prompt Studio
-- ============================================================
ALTER TABLE public.threads
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES platform_profiles(id) ON DELETE CASCADE;
ALTER TABLE public.saved_prompts
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES platform_profiles(id) ON DELETE CASCADE;
ALTER TABLE public.prompt_studio_usage
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES platform_profiles(id) ON DELETE CASCADE;
ALTER TABLE public.prompt_pack_purchases
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES platform_profiles(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS threads_profile_idx ON public.threads (profile_id);
CREATE INDEX IF NOT EXISTS saved_prompts_profile_idx ON public.saved_prompts (profile_id);
CREATE INDEX IF NOT EXISTS prompt_studio_usage_profile_idx ON public.prompt_studio_usage (profile_id);
