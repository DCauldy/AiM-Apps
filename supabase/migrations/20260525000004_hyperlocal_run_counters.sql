-- Atomic increment RPCs for hl_runs send counters.
-- These avoid race conditions when many hl-send-one functions run in parallel.

CREATE OR REPLACE FUNCTION hl_increment_run_sent(p_run_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE hl_runs
    SET emails_sent = emails_sent + 1,
        updated_at = now()
    WHERE id = p_run_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION hl_increment_run_failed(p_run_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE hl_runs
    SET emails_failed = emails_failed + 1,
        updated_at = now()
    WHERE id = p_run_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
