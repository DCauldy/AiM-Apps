-- Listing Studio — full schema
--
-- Per-listing stateful workspace with lifecycle (prospect → active → archived).
-- Mirrors the patterns established by Hyperlocal (per-project state, pack
-- billing, atomic reservation) and Blog Engine (atomic check-and-increment
-- RPC, pipeline_error column for UI surfacing).
--
-- Tables (prefix ls_*):
--   ls_listings         core project — address, facts, stage
--   ls_cma_runs         per-CMA execution
--   ls_outputs          generated marketing assets (description, captions, emails)
--   ls_photos           temporary photo metadata (1hr TTL)
--   ls_comps_uploads    optional CSV override for CMA
--   ls_user_packs       pack subscription (mirrors hl_user_packs)
--   ls_usage            monthly meter
--
-- Functions:
--   try_reserve_active_listing_slot  atomic check-and-increment on promote
--   listing_studio_cleanup_expired_photos  delete expired photo rows + storage

-- ---------------------------------------------------------------------------
-- 1. Core listing project
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ls_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES platform_profiles(id) ON DELETE SET NULL,

  address TEXT NOT NULL,
  address_normalized TEXT,        -- lowercased + trimmed for dedup checks
  property_facts JSONB DEFAULT '{}'::jsonb,
  prefilled_from_api BOOLEAN DEFAULT FALSE,

  stage TEXT NOT NULL DEFAULT 'prospect'
    CHECK (stage IN ('prospect', 'active', 'archived')),
  promoted_at TIMESTAMPTZ,        -- when stage flipped to active (consumes slot)
  archived_at TIMESTAMPTZ,

  notes TEXT,                     -- agent's freeform notes

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ls_listings_user_stage
  ON ls_listings (user_id, stage, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ls_listings_profile
  ON ls_listings (profile_id)
  WHERE profile_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. CMA execution records
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ls_cma_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES ls_listings(id) ON DELETE CASCADE,

  comps_source TEXT
    CHECK (comps_source IN ('rapidapi', 'csv', 'both')),
  comps JSONB,                    -- final merged comp set with adjustments
  adjustment_grid JSONB,          -- math breakdown for transparency

  appraised_value_cents BIGINT,
  marketable_value_cents BIGINT,
  recommended_price_cents BIGINT,

  seller_narrative_md TEXT,
  internal_memo_md TEXT,

  pipeline_error TEXT,
  generated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ls_cma_runs_listing
  ON ls_cma_runs (listing_id, generated_at DESC);

-- ---------------------------------------------------------------------------
-- 3. Generated marketing outputs
--
-- One row per (listing_id, type[, variant]) combination. Re-generating
-- replaces the existing row's content (or inserts a new one for variant
-- combos that don't yet exist).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ls_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES ls_listings(id) ON DELETE CASCADE,

  type TEXT NOT NULL
    CHECK (type IN ('description', 'captions_doc', 'dotw_email', 'html_email')),
  variant TEXT,                   -- 'a'/'b' for dotw; 'announcement'/'pricing' for html
  content TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'finalized')),

  compliance_warning TEXT,        -- set by validator pass; UI surfaces a banner
  pipeline_error TEXT,

  generated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ls_outputs_listing_type
  ON ls_outputs (listing_id, type);

-- Each (listing, type, variant) is unique. Re-running an output upserts.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ls_outputs_listing_type_variant
  ON ls_outputs (listing_id, type, COALESCE(variant, ''));

-- ---------------------------------------------------------------------------
-- 4. Photos (temporary, 1hr TTL)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ls_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES ls_listings(id) ON DELETE CASCADE,

  original_filename TEXT NOT NULL,
  suggested_order INT,            -- AI-determined display order, NULL until processed
  caption TEXT,
  storage_path TEXT NOT NULL,     -- Supabase Storage key

  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '1 hour'),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ls_photos_listing_order
  ON ls_photos (listing_id, suggested_order NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_ls_photos_expires
  ON ls_photos (expires_at);

-- ---------------------------------------------------------------------------
-- 5. Optional CSV comp uploads
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ls_comps_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES ls_listings(id) ON DELETE CASCADE,

  raw_csv TEXT,                   -- original CSV text (for re-parse on schema bump)
  parsed_rows JSONB,              -- normalized comp rows
  row_count INT,

  uploaded_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ls_comps_uploads_listing
  ON ls_comps_uploads (listing_id, uploaded_at DESC);

-- ---------------------------------------------------------------------------
-- 6. Pack subscriptions (mirrors hl_user_packs)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ls_user_packs (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  pack_id TEXT,                   -- e.g. listing_studio_bronze
  tier TEXT,                      -- bronze / silver / gold / diamond
  stripe_subscription_id TEXT,
  stripe_customer_id TEXT,
  status TEXT,                    -- active / past_due / canceled / etc.
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ls_user_packs_subscription
  ON ls_user_packs (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 7. Monthly usage meter
--
-- One row per (user, month). Atomic reserve writes here. Both meters
-- (active_listings_promoted, cma_runs_count) tracked on the same row.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ls_usage (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month_start DATE NOT NULL,
  active_listings_promoted INT DEFAULT 0,
  cma_runs_count INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, month_start)
);

-- ---------------------------------------------------------------------------
-- 8. Atomic slot reservation for "Promote to Active Listing"
--
-- SELECT … FOR UPDATE on the usage row serializes concurrent promote
-- requests. Mirrors try_reserve_blog_slot from Blog Engine.
--
-- Returns JSONB:
--   { reserved: true,  active_listings_promoted, active_listings_limit }
--   { reserved: false, active_listings_promoted, active_listings_limit }
--
-- Note: active_listings_limit is passed in (not read from DB) because
-- it's defined in lib/listing-studio-packs.ts and resolved per-user via
-- the admin_pack_configs join at the application layer. The RPC just
-- enforces "did we already hit the limit"; the limit value is the
-- caller's responsibility to supply correctly.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION try_reserve_active_listing_slot(
  p_user_id UUID,
  p_month_start DATE,
  p_limit INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_promoted INT;
BEGIN
  -- Lock + read (insert if missing)
  SELECT active_listings_promoted INTO v_promoted
    FROM ls_usage
   WHERE user_id = p_user_id
     AND month_start = p_month_start
     FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO ls_usage (user_id, month_start, active_listings_promoted, cma_runs_count)
    VALUES (p_user_id, p_month_start, 0, 0)
    ON CONFLICT (user_id, month_start) DO NOTHING;

    SELECT active_listings_promoted INTO v_promoted
      FROM ls_usage
     WHERE user_id = p_user_id
       AND month_start = p_month_start
       FOR UPDATE;
  END IF;

  -- -1 sentinel = UNLIMITED (Diamond tier); skip cap check.
  IF p_limit <> -1 AND v_promoted >= p_limit THEN
    RETURN jsonb_build_object(
      'reserved', FALSE,
      'active_listings_promoted', v_promoted,
      'active_listings_limit', p_limit
    );
  END IF;

  UPDATE ls_usage
     SET active_listings_promoted = active_listings_promoted + 1,
         updated_at = now()
   WHERE user_id = p_user_id
     AND month_start = p_month_start;

  RETURN jsonb_build_object(
    'reserved', TRUE,
    'active_listings_promoted', v_promoted + 1,
    'active_listings_limit', p_limit
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. CMA soft-cap counter — increment helper (best-effort, no locking)
--
-- Used by /api/.../cma to track running CMAs against the across-tier soft
-- cap (default 30/mo on every tier). We don't gate atomically here — the
-- prospect CMAs cap is a soft-ish guardrail, not a strict billing event.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION ls_increment_cma_count(
  p_user_id UUID,
  p_month_start DATE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO ls_usage (user_id, month_start, active_listings_promoted, cma_runs_count)
  VALUES (p_user_id, p_month_start, 0, 1)
  ON CONFLICT (user_id, month_start)
  DO UPDATE SET cma_runs_count = ls_usage.cma_runs_count + 1,
                updated_at = now();
END;
$$;

-- ---------------------------------------------------------------------------
-- 10. Photo cleanup (scheduled via Supabase cron or manual via API)
--
-- Deletes ls_photos rows whose expires_at has passed. The Storage objects
-- themselves are cleaned by the API route at process completion; this
-- function handles drift (process never completed, agent abandoned upload).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION listing_studio_cleanup_expired_photos()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted INT;
BEGIN
  DELETE FROM ls_photos
   WHERE expires_at < now();
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- ---------------------------------------------------------------------------
-- 11. Row-level security
--
-- All tables scoped by user_id. Service role bypasses for pipeline + admin.
-- ---------------------------------------------------------------------------

ALTER TABLE ls_listings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE ls_cma_runs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE ls_outputs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ls_photos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE ls_comps_uploads   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ls_user_packs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ls_usage           ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users own listings" ON ls_listings
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users own cma_runs via listing" ON ls_cma_runs
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM ls_listings WHERE ls_listings.id = ls_cma_runs.listing_id AND ls_listings.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM ls_listings WHERE ls_listings.id = ls_cma_runs.listing_id AND ls_listings.user_id = auth.uid()
  ));

CREATE POLICY "users own outputs via listing" ON ls_outputs
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM ls_listings WHERE ls_listings.id = ls_outputs.listing_id AND ls_listings.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM ls_listings WHERE ls_listings.id = ls_outputs.listing_id AND ls_listings.user_id = auth.uid()
  ));

CREATE POLICY "users own photos via listing" ON ls_photos
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM ls_listings WHERE ls_listings.id = ls_photos.listing_id AND ls_listings.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM ls_listings WHERE ls_listings.id = ls_photos.listing_id AND ls_listings.user_id = auth.uid()
  ));

CREATE POLICY "users own comps_uploads via listing" ON ls_comps_uploads
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM ls_listings WHERE ls_listings.id = ls_comps_uploads.listing_id AND ls_listings.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM ls_listings WHERE ls_listings.id = ls_comps_uploads.listing_id AND ls_listings.user_id = auth.uid()
  ));

CREATE POLICY "users read own pack" ON ls_user_packs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "users read own usage" ON ls_usage
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 12. admin_pack_configs — Listing Studio columns + seed rows
--
-- The platform's admin_pack_configs table already exists and is constrained
-- by app ∈ ('prompt_studio','blog_engine','radar','hyperlocal'). Extend
-- the CHECK to allow 'listing_studio' and add the pack-specific columns
-- (active_listings_limit, cma_soft_limit) alongside the existing per-app
-- limit columns.
-- ---------------------------------------------------------------------------

ALTER TABLE admin_pack_configs
  ADD COLUMN IF NOT EXISTS active_listings_limit INT,
  ADD COLUMN IF NOT EXISTS cma_soft_limit INT;

ALTER TABLE admin_pack_configs
  DROP CONSTRAINT IF EXISTS admin_pack_configs_app_check;
ALTER TABLE admin_pack_configs
  ADD CONSTRAINT admin_pack_configs_app_check
  CHECK (app IN ('prompt_studio','blog_engine','radar','hyperlocal','listing_studio'));

INSERT INTO admin_pack_configs
  (id, app, tier, price_cents, stripe_price_id, label, best_value, is_active, sort_order, active_listings_limit, cma_soft_limit)
VALUES
  ('listing_studio_bronze',  'listing_studio', 'Bronze',  4900,  'price_TODO', '3 listings/mo · 20 prospect CMAs', false, true, 1, 3,  20),
  ('listing_studio_silver',  'listing_studio', 'Silver',  9900,  'price_TODO', '6 listings/mo · 30 prospect CMAs', false, true, 2, 6,  30),
  ('listing_studio_gold',    'listing_studio', 'Gold',    17900, 'price_TODO', '10 listings/mo · 30 prospect CMAs', true,  true, 3, 10, 30),
  ('listing_studio_diamond', 'listing_studio', 'Diamond', 29900, 'price_TODO', 'Unlimited listings · 30 prospect CMAs', false, true, 4, -1, 30)
ON CONFLICT (id) DO NOTHING;
