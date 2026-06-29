-- ============================================================
-- Allow hl_mls_uploads.run_id to be NULL so historical-backfill
-- uploads (outside any campaign run) can persist their lineage
-- alongside campaign-driven uploads.
--
-- Also adds a profile_id column so backfill uploads can be
-- attributed to the right tenant without needing a run.
-- ============================================================

ALTER TABLE hl_mls_uploads
  ALTER COLUMN run_id DROP NOT NULL;

ALTER TABLE hl_mls_uploads
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES platform_profiles(id) ON DELETE CASCADE;

ALTER TABLE hl_mls_uploads
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'run'
  CHECK (source IN ('run', 'backfill'));

CREATE INDEX IF NOT EXISTS hl_mls_uploads_profile_idx
  ON hl_mls_uploads (profile_id, uploaded_at DESC)
  WHERE profile_id IS NOT NULL;
