-- ============================================================
-- Restore RLS policy on ls_cma_runs (was cascaded with ls_listings
-- in 20260610000001_cma_pivot_schema_rip.sql).
--
-- v2 ownership chain:
--   cma_clients (RLS by user_id)
--     ↓
--   cma_client_deliveries.cma_run_id → ls_cma_runs.id
--
-- Authenticated reads have to walk that chain to prove ownership.
-- The service-role pipeline (cma-deliver Inngest fn) bypasses RLS
-- entirely, so no policy is needed for writes.
-- ============================================================

-- Drop any stale carryover policy with the old shape, just in case.
DROP POLICY IF EXISTS "users own cma_runs via listing" ON ls_cma_runs;
DROP POLICY IF EXISTS "users own cma_runs via delivery" ON ls_cma_runs;

CREATE POLICY "users own cma_runs via delivery" ON ls_cma_runs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM cma_client_deliveries d
        JOIN cma_clients c ON c.id = d.client_id
       WHERE d.cma_run_id = ls_cma_runs.id
         AND c.user_id = auth.uid()
    )
  );
