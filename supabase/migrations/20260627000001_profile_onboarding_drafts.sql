-- ============================================================
-- profile_onboarding_drafts — save/resume for new-profile onboarding.
--
-- One in-progress draft per user, capturing which mode they were in
-- (AI Magic or Control Freak) plus the mode-specific state, so they can
-- leave and come back. The row is cleared once a profile is created.
-- ============================================================

CREATE TABLE IF NOT EXISTS profile_onboarding_drafts (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('magic', 'control')),
  -- Mode-specific snapshot: magic = { draft, found, lowConfidence, url };
  -- control = { messages } (the chat transcript).
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- RLS — users see/write only their own draft.
-- ============================================================
ALTER TABLE profile_onboarding_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY profile_onboarding_drafts_select_own ON profile_onboarding_drafts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY profile_onboarding_drafts_insert_own ON profile_onboarding_drafts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY profile_onboarding_drafts_update_own ON profile_onboarding_drafts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY profile_onboarding_drafts_delete_own ON profile_onboarding_drafts
  FOR DELETE USING (auth.uid() = user_id);

-- Service role for server-side cleanup / admin.
CREATE POLICY profile_onboarding_drafts_service_all ON profile_onboarding_drafts
  FOR ALL TO service_role USING (true) WITH CHECK (true);
