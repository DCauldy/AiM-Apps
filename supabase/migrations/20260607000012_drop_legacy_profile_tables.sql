-- ============================================================
-- Drop legacy per-app profile tables now that:
--   1. platform_profiles owns shared identity (Phase 1 + backfill).
--   2. bofu_schedules owns Blog Engine app-specific extras
--      (Phase 4 cleanup migration 20260607000003).
--   3. All app code reads/writes through platform_profiles +
--      bofu_schedules; the legacy CRUD endpoints have been deleted.
--
-- Order: drop the dependent FKs first so the parent tables can be
-- dropped without errors. The hl_runs columns sender_profile_id and
-- branding_profile_id stay on the table (they still hold legacy
-- snapshots from older runs) but their FK constraints to the
-- about-to-drop tables are removed.
-- ============================================================

ALTER TABLE hl_runs
  DROP CONSTRAINT IF EXISTS hl_runs_sender_profile_id_fkey,
  DROP CONSTRAINT IF EXISTS hl_runs_branding_profile_id_fkey;

DROP TABLE IF EXISTS platform_sender_profiles CASCADE;
DROP TABLE IF EXISTS platform_branding_profiles CASCADE;
DROP TABLE IF EXISTS user_profiles CASCADE;
