-- ============================================================
-- Wave 5 — engagement tracking. ESP webhooks need three things the
-- v2 schema doesn't yet have:
--
--   1. cma_client_deliveries.provider_message_id — the ESP's own id
--      for the sent email (Resend email_id, SendGrid sg_message_id).
--      Webhook lookups by this column resolve events back to the
--      correct delivery row in O(1).
--   2. cma_client_deliveries.email_connection_id — the connection
--      this delivery was sent through. The Resend webhook handler
--      needs it to find the per-connection signing secret; SendGrid
--      uses it to load the per-connection public key.
--   3. cma_email_connections.resend_webhook_secret_encrypted — the
--      per-connection signing secret returned by Resend's
--      /webhooks API. AES-GCM at rest; mirrors Hyperlocal's column.
-- ============================================================

ALTER TABLE cma_client_deliveries
  ADD COLUMN IF NOT EXISTS provider_message_id TEXT,
  ADD COLUMN IF NOT EXISTS email_connection_id UUID
    REFERENCES cma_email_connections(id) ON DELETE SET NULL;

-- Partial index — only sent rows have a provider_message_id, and the
-- webhook lookup is always for a sent row. Saves storage on the (large)
-- subset of pending/failed rows where the column stays NULL.
CREATE INDEX IF NOT EXISTS cma_client_deliveries_provider_msg_idx
  ON cma_client_deliveries (provider_message_id)
  WHERE provider_message_id IS NOT NULL;

ALTER TABLE cma_email_connections
  ADD COLUMN IF NOT EXISTS resend_webhook_secret_encrypted TEXT;
