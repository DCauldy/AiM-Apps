-- ============================================================
-- Drop the now-orphaned ls_cma_runs.listing_id column.
--
-- Wave 1 (20260610000001) dropped ls_listings and made listing_id
-- nullable on ls_cma_runs so the FK detach could land cleanly. The
-- v2 cma-deliver pipeline writes NULL into this column on every
-- insert; nothing reads it. The canonical link from a CMA run back
-- to its delivery now lives at cma_client_deliveries.cma_run_id.
--
-- Removing the column tightens the table shape and stops it from
-- showing up as "always NULL, why is this here?" in future schema
-- diffs. Safe — no in-flight code references it.
-- ============================================================

ALTER TABLE ls_cma_runs
  DROP COLUMN IF EXISTS listing_id;
