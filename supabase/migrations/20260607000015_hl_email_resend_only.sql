-- ============================================================
-- Hyperlocal email — Resend-only + ZeroBounce + webhook events
--
-- Two architectural decisions baked into this migration:
--
--   1) BYO Resend. Every Resend connection brings its own API
--      key + webhook secret (encrypted, per-connection). The
--      customer owns the Resend account, sending domain, billing,
--      and reputation — AiM is never the sender of record.
--
--   2) AiM-owned ZeroBounce. List hygiene runs on a centralized
--      cache so the same email is not re-validated across users.
--      Validation TTL is 90 days; re-validate on cache miss or
--      expiry. Service role only — never exposed to the client.
--
-- Removes Gmail / Outlook from hl_email_connections.provider —
-- Resend is the only supported provider going forward.
-- ============================================================

-- ============================================================
-- 1. Tighten hl_email_connections.provider to 'resend' only.
-- ============================================================
ALTER TABLE hl_email_connections
  DROP CONSTRAINT IF EXISTS hl_email_connections_provider_check;
ALTER TABLE hl_email_connections
  ADD CONSTRAINT hl_email_connections_provider_check
  CHECK (provider = 'resend');

-- ============================================================
-- 2. Webhook secret + kill-switch state per Resend connection.
-- ============================================================
ALTER TABLE hl_email_connections
  ADD COLUMN IF NOT EXISTS resend_webhook_secret_encrypted TEXT;

ALTER TABLE hl_email_connections
  ADD COLUMN IF NOT EXISTS paused BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE hl_email_connections
  ADD COLUMN IF NOT EXISTS paused_reason TEXT;
ALTER TABLE hl_email_connections
  ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;

-- ============================================================
-- 3. hl_email_validation_cache — global ZeroBounce cache.
--    Server-side only (no RLS read policy for end users).
-- ============================================================
CREATE TABLE IF NOT EXISTS hl_email_validation_cache (
  email TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN (
    'valid', 'invalid', 'catch-all', 'unknown', 'spamtrap', 'abuse', 'do_not_mail'
  )),
  sub_status TEXT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hl_email_validation_cache_checked_at_idx
  ON hl_email_validation_cache (checked_at);

-- ============================================================
-- 4. hl_email_events — raw + normalized Resend webhook events.
--    Joined back to a recipient through provider_message_id;
--    email_connection_id is denormalized so kill-switch health
--    queries can scan one connection without a recipient join.
-- ============================================================
CREATE TABLE IF NOT EXISTS hl_email_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  email_connection_id UUID REFERENCES hl_email_connections(id) ON DELETE CASCADE,
  recipient_id UUID REFERENCES hl_recipients(id) ON DELETE SET NULL,
  provider_message_id TEXT,

  type TEXT NOT NULL CHECK (type IN (
    'sent', 'delivered', 'delivery_delayed',
    'bounced', 'complained',
    'opened', 'clicked',
    'unsubscribed', 'failed'
  )),
  bounce_type TEXT CHECK (bounce_type IN ('hard', 'soft')),
  reason TEXT,

  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hl_email_events_connection_idx
  ON hl_email_events (email_connection_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS hl_email_events_recipient_idx
  ON hl_email_events (recipient_id);
CREATE INDEX IF NOT EXISTS hl_email_events_message_id_idx
  ON hl_email_events (provider_message_id)
  WHERE provider_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS hl_email_events_type_occurred_idx
  ON hl_email_events (type, occurred_at DESC);

-- ============================================================
-- Row level security
-- ============================================================
ALTER TABLE hl_email_validation_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE hl_email_events ENABLE ROW LEVEL SECURITY;

-- Validation cache: service role only. Never exposed to the client.
CREATE POLICY "hl_email_validation_cache_service_all"
  ON hl_email_validation_cache FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- Email events: users can read events for their own connections;
-- the webhook ingester writes as service role.
CREATE POLICY "hl_email_events_user_policy"
  ON hl_email_events FOR SELECT
  USING (
    email_connection_id IN (
      SELECT id FROM hl_email_connections WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "hl_email_events_service_all"
  ON hl_email_events FOR ALL
  TO service_role USING (true) WITH CHECK (true);
