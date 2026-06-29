-- ============================================================
-- Hyperlocal — Service Area redesign
--   Campaigns can carry a default service area (list of ZIPs).
--   Runs go through an "awaiting_service_area" phase when the
--   campaign doesn't have one set, prompting the user to pick.
-- ============================================================

ALTER TABLE hl_campaigns
  ADD COLUMN IF NOT EXISTS service_area_zips TEXT[] DEFAULT '{}';

-- Add the new run phase. CHECK constraints can't be ALTERed in place;
-- we drop and re-add.
ALTER TABLE hl_runs DROP CONSTRAINT IF EXISTS hl_runs_phase_check;
ALTER TABLE hl_runs ADD CONSTRAINT hl_runs_phase_check CHECK (phase IN (
  'discover',
  'awaiting_service_area',
  'awaiting_mls',
  'generate',
  'review',
  'sending',
  'completed',
  'failed',
  'cancelled'
));
