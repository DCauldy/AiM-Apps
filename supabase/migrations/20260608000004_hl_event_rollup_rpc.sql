-- ============================================================
-- hl_event_rollup_upsert(p_rows JSONB) → void
--
-- Batch upsert helper for the events rollup cron. Takes a JSONB array
-- of {email_connection_id, day, event_type, total, unique_count} and
-- upserts into hl_email_event_daily in a single round-trip.
--
-- Critically the conflict path ADDS to the existing counts rather than
-- replaces them — a late-arriving event or a re-run of the cron on a
-- partially processed day must accumulate, not overwrite. The cron
-- always deletes the raw events it just rolled up, so double-counting
-- can't happen within a single tick. Across ticks, the arithmetic
-- merge is what keeps multi-pass rollups correct.
--
-- Without this RPC the cron falls back to per-row JS round-trips —
-- correct but slow at scale.
-- ============================================================

CREATE OR REPLACE FUNCTION hl_event_rollup_upsert(p_rows JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  INSERT INTO hl_email_event_daily (
    email_connection_id,
    day,
    event_type,
    total_event_count,
    unique_recipient_count,
    rolled_up_at
  )
  SELECT
    (r->>'email_connection_id')::UUID,
    (r->>'day')::DATE,
    r->>'event_type',
    (r->>'total')::INT,
    (r->>'unique_count')::INT,
    now()
  FROM jsonb_array_elements(p_rows) AS r
  ON CONFLICT (email_connection_id, day, event_type) DO UPDATE
  SET
    total_event_count =
      hl_email_event_daily.total_event_count + EXCLUDED.total_event_count,
    unique_recipient_count =
      hl_email_event_daily.unique_recipient_count + EXCLUDED.unique_recipient_count,
    rolled_up_at = now();
END;
$$;

-- The cron runs as service_role; lock execute to that role + the
-- postgres superuser. anon/authenticated have no business calling this.
REVOKE EXECUTE ON FUNCTION hl_event_rollup_upsert(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hl_event_rollup_upsert(JSONB) TO service_role;
