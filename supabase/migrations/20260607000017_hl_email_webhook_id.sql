-- ============================================================
-- Track the Resend webhook id we provisioned for each connection.
--
-- Why: when the agent opts into auto-provisioning, we create a
-- webhook in their Resend account via API. Persisting the
-- returned id lets us:
--   1. Re-fetch the signing secret on demand (Resend's GET
--      endpoint returns the secret given the id; the LIST
--      endpoint does not).
--   2. Detect that this connection already has a webhook —
--      avoids duplicates when an API key is shared across
--      multiple connections.
--   3. Delete the webhook when the agent disconnects the
--      sending account, leaving their Resend account tidy.
--
-- Nullable: manual-paste flow still works for agents whose API
-- key lacks webhook scope, and pre-existing rows have nothing
-- to backfill.
-- ============================================================

ALTER TABLE hl_email_connections
  ADD COLUMN IF NOT EXISTS resend_webhook_id TEXT;

CREATE INDEX IF NOT EXISTS hl_email_connections_webhook_id_idx
  ON hl_email_connections (resend_webhook_id)
  WHERE resend_webhook_id IS NOT NULL;
