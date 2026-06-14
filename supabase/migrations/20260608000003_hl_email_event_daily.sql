-- ============================================================
-- hl_email_event_daily — per-day rollups of hl_email_events.
--
-- The raw events table grows fast (~5 rows per send: sent, delivered,
-- opened, clicked, sometimes unsubscribed/bounced). At 6k agents × 300
-- weekly sends × 5 events = ~470M rows/year, ~190GB.
--
-- Daily rollup keeps recent-window dashboards on the raw events table
-- (last 30 days, where event-grain detail like "which contact opened
-- which email" matters), while older data collapses to a tiny per-day
-- per-connection per-type counter. The aggregate is what survives —
-- raw events outside the recent window get deleted by the same cron.
--
-- Sizing: ~120 bytes/row. One connection × one type × 365 days = 365
-- rows. 6k agents with avg 1 connection × 9 event types = ~20M rows
-- after a full year ≈ 2.4GB. Trivial.
-- ============================================================

CREATE TABLE IF NOT EXISTS hl_email_event_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_connection_id UUID NOT NULL REFERENCES hl_email_connections(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'sent', 'delivered', 'delivery_delayed',
    'bounced', 'complained',
    'opened', 'clicked',
    'unsubscribed', 'failed'
  )),

  /** Distinct recipients that produced this event on this day. */
  unique_recipient_count INT NOT NULL DEFAULT 0,
  /** Raw event volume (a single recipient can click twice in a day). */
  total_event_count INT NOT NULL DEFAULT 0,

  rolled_up_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (email_connection_id, day, event_type)
);

CREATE INDEX IF NOT EXISTS hl_email_event_daily_connection_day_idx
  ON hl_email_event_daily (email_connection_id, day DESC);

ALTER TABLE hl_email_event_daily ENABLE ROW LEVEL SECURITY;

-- Owners read their own connections' rollups.
CREATE POLICY "hl_email_event_daily_user_read"
  ON hl_email_event_daily FOR SELECT
  USING (
    email_connection_id IN (
      SELECT id FROM hl_email_connections WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "hl_email_event_daily_service_all"
  ON hl_email_event_daily FOR ALL
  TO service_role USING (true) WITH CHECK (true);
