-- ============================================================
-- hl_market_snapshots — permanent per-month aggregates per geo.
--
-- Today's pipeline computes hl_segments.mls_metrics from an MLS
-- upload, uses it once to render emails, then forgets it. There's
-- no way to compare this month to last month, do YoY, or talk
-- about trends — the data dissolves the moment a run completes.
--
-- This table captures one row per (profile, geo, year, month)
-- aggregated from whatever MLS row data the agent uploads. Future
-- uploads of the same month overwrite cleanly via ON CONFLICT.
-- The snapshot is permanent even after the source file is deleted
-- by the lifecycle job.
--
-- Sizing: ~200 bytes/row. At 6k agents × 10 geos × 36 months
-- (3-year backfill) that's ~2.2M rows / ~440MB — negligible.
-- ============================================================

CREATE TABLE IF NOT EXISTS hl_market_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES platform_profiles(id) ON DELETE CASCADE,

  geo_key TEXT NOT NULL,
  geo_label TEXT,
  geo_type TEXT CHECK (geo_type IN ('zip', 'city', 'county', 'subdivision', 'neighborhood', 'custom')),

  period_year INT NOT NULL,
  period_month INT NOT NULL CHECK (period_month BETWEEN 1 AND 12),

  -- Aggregated metrics for this month. Same shape as MlsMetrics on
  -- hl_segments, kept as discrete columns (not JSONB) so trend queries
  -- can do real SQL aggregates.
  median_sale_price INT,
  median_days_on_market INT,
  list_to_sale_ratio NUMERIC(6, 2),
  closed_count INT NOT NULL DEFAULT 0,
  active_inventory INT,
  new_listing_count INT NOT NULL DEFAULT 0,

  source_upload_id UUID REFERENCES hl_mls_uploads(id) ON DELETE SET NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (profile_id, geo_key, period_year, period_month)
);

-- Index targets the common read pattern: "give me the last N months
-- for this geo on this profile, newest first."
CREATE INDEX IF NOT EXISTS hl_market_snapshots_lookup_idx
  ON hl_market_snapshots (profile_id, geo_key, period_year DESC, period_month DESC);

ALTER TABLE hl_market_snapshots ENABLE ROW LEVEL SECURITY;

-- Users read snapshots only for profiles they own.
CREATE POLICY "hl_market_snapshots_user_read"
  ON hl_market_snapshots FOR SELECT
  USING (
    profile_id IN (
      SELECT id FROM platform_profiles WHERE user_id = auth.uid()
    )
  );

-- The MLS-upload routes write as service role.
CREATE POLICY "hl_market_snapshots_service_all"
  ON hl_market_snapshots FOR ALL
  TO service_role USING (true) WITH CHECK (true);
