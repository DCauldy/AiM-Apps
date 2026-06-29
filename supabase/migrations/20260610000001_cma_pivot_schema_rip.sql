-- ============================================================
-- CMA pivot — schema rip + reseed (Wave 1 of the CMA_PLAN.md rebuild)
--
-- Listing Studio v1 had a per-listing workspace with five marketing outputs.
-- v2 collapses to a single output (the CMA) delivered automatically to past
-- clients pulled from the agent's CRM on a configurable cadence. This
-- migration tears down v1 and stands up the v2 schema.
--
-- Drops:    ls_listings, ls_outputs, ls_photos, ls_comps_uploads
--           try_reserve_active_listing_slot RPC
--           listing_studio_cleanup_expired_photos RPC
-- Keeps:    ls_cma_runs (the per-CMA execution record — the v2 pipeline
--             still writes here; cma_client_deliveries FKs into it)
--           ls_user_packs (functionally unchanged — meter semantics shift
--             but the row shape doesn't)
--           ls_usage (column repurposed below)
-- Creates:  cma_crm_connections, cma_email_connections, cma_clients,
--           cma_client_deliveries, cma_agent_settings
--           try_reserve_client_slot RPC (semantic rename of the slot RPC)
-- Reseeds:  admin_pack_configs rows for the new active-clients ladder
--             (25 / 100 / 250 / 500 / unlimited)
--
-- Safe to apply on the existing remote DB because only one test row was
-- ever created in ls_listings.
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. Detach ls_cma_runs from ls_listings so the table can be dropped
--
-- ls_cma_runs.listing_id used to FK into ls_listings. v2 wires CMA runs
-- to the new cma_client_deliveries row instead. Drop the FK + index so
-- the column can be reused (NULLable) by the legacy backfill row and by
-- ad-hoc/diagnostic CMAs that aren't tied to a delivery yet.
-- ---------------------------------------------------------------------------

ALTER TABLE ls_cma_runs
  DROP CONSTRAINT IF EXISTS ls_cma_runs_listing_id_fkey;

ALTER TABLE ls_cma_runs
  ALTER COLUMN listing_id DROP NOT NULL;

-- The old per-listing index becomes useless. The replacement query path is
-- cma_client_deliveries.cma_run_id → ls_cma_runs.id (PK already indexed).
DROP INDEX IF EXISTS idx_ls_cma_runs_listing;

-- ---------------------------------------------------------------------------
-- 2. Drop the v1 listing tables
--
-- CASCADE not strictly required after the FK detach above, but it covers
-- any RLS policies or dependent views we might have missed.
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS ls_comps_uploads CASCADE;
DROP TABLE IF EXISTS ls_photos        CASCADE;
DROP TABLE IF EXISTS ls_outputs       CASCADE;
DROP TABLE IF EXISTS ls_listings      CASCADE;

-- Helpers tied to the dropped tables.
DROP FUNCTION IF EXISTS try_reserve_active_listing_slot(UUID, DATE, INT);
DROP FUNCTION IF EXISTS listing_studio_cleanup_expired_photos();

-- ---------------------------------------------------------------------------
-- 3. Repurpose ls_usage for the new active-clients meter
--
-- v1 tracked active_listings_promoted + cma_runs_count per month. v2's
-- billing meter is "currently enrolled clients" (a snapshot, not a
-- monthly counter), but we still want a monthly send count for usage
-- visibility. Rename the columns to match the new semantics; drop the
-- listings counter.
-- ---------------------------------------------------------------------------

ALTER TABLE ls_usage
  DROP COLUMN IF EXISTS active_listings_promoted;

ALTER TABLE ls_usage
  RENAME COLUMN cma_runs_count TO deliveries_sent;

ALTER TABLE ls_usage
  ADD COLUMN IF NOT EXISTS manual_sends INT DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 4. cma_crm_connections — past-client source CRMs
--
-- Mirrors hl_crm_connections (post-evolution shape), scoped to the four
-- platforms the CMA app supports today. Adding more later is a single
-- CHECK swap.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS cma_crm_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES platform_profiles(id) ON DELETE CASCADE,

  platform TEXT NOT NULL CHECK (platform IN (
    'followupboss', 'lofty', 'sierra', 'boldtrail'
  )),
  label TEXT,

  api_key_encrypted TEXT,
  oauth_access_token_encrypted TEXT,
  oauth_refresh_token_encrypted TEXT,
  oauth_expires_at TIMESTAMPTZ,
  base_url TEXT,

  -- Filter that narrows the contact pull to past clients only. Most CRMs
  -- expose this as a tag ("Closed Client"), some as a stage/status field.
  past_client_source TEXT CHECK (past_client_source IN ('tag', 'stage', 'all')),
  past_client_value  TEXT,   -- the tag name or stage value to match

  is_active BOOLEAN DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  last_error TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cma_crm_connections_user_idx
  ON cma_crm_connections (user_id, is_active);
CREATE INDEX IF NOT EXISTS cma_crm_connections_profile_idx
  ON cma_crm_connections (profile_id);

-- ---------------------------------------------------------------------------
-- 5. cma_email_connections — ESP for delivering CMA emails
--
-- Same multi-ESP shape as hl_email_connections final state. Resend keeps
-- its dedicated columns; OAuth + generic API-key columns cover the others.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS cma_email_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES platform_profiles(id) ON DELETE CASCADE,

  provider TEXT NOT NULL CHECK (provider IN (
    'resend', 'sendgrid',
    'mailchimp', 'activecampaign', 'constantcontact', 'klaviyo'
  )),
  email_address TEXT NOT NULL,
  display_name TEXT,

  -- Resend-specific (dedicated domain + DKIM verification flow)
  resend_api_key_encrypted TEXT,
  resend_domain TEXT,
  resend_domain_id TEXT,
  resend_dkim_status TEXT CHECK (resend_dkim_status IN ('pending', 'verified', 'failed')),
  resend_webhook_id TEXT,

  -- Generic provider credentials (everything not Resend)
  provider_api_key_encrypted TEXT,
  provider_oauth_access_token_encrypted TEXT,
  provider_oauth_refresh_token_encrypted TEXT,
  provider_oauth_expires_at TIMESTAMPTZ,
  provider_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  last_send_at TIMESTAMPTZ,
  last_error TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cma_email_connections_user_idx
  ON cma_email_connections (user_id, is_active, is_default);
CREATE INDEX IF NOT EXISTS cma_email_connections_profile_idx
  ON cma_email_connections (profile_id);

-- ---------------------------------------------------------------------------
-- 6. cma_clients — past clients enrolled in the cadence
--
-- Sourced from a connected CRM (crm_connection_id + crm_contact_id) OR
-- created manually (both nullable). property_facts caches the zpid +
-- lat/lon + sqft/beds/baths from the first RapidAPI lookup so subsequent
-- deliveries skip the re-lookup unless something changes.
--
-- next_due_at is the cadence scheduler's hot path — partial index keeps
-- the cron tick fast even at 10k+ enrolled clients.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS cma_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES platform_profiles(id) ON DELETE CASCADE,

  crm_connection_id UUID REFERENCES cma_crm_connections(id) ON DELETE SET NULL,
  crm_contact_id TEXT,                       -- provider-native id (FUB person id, etc.)

  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('crm', 'manual')),

  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  address_normalized TEXT,                   -- lowercased + trimmed for dedup

  property_facts JSONB DEFAULT '{}'::jsonb,  -- zpid, lat, lon, sqft, beds, baths, image_url, …

  enrolled BOOLEAN DEFAULT FALSE,            -- agent opted in; false = visible but skipped
  paused BOOLEAN DEFAULT FALSE,              -- temporary stop (vs unsubscribe)
  cadence_days INT,                          -- per-client override; NULL = agent default
  next_due_at TIMESTAMPTZ,                   -- when the cadence scheduler should fire
  last_delivered_at TIMESTAMPTZ,
  delivered_count INT NOT NULL DEFAULT 0,

  -- CAN-SPAM unsubscribe state (distinct from `paused`, which is reversible)
  unsubscribed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- One CRM contact maps to at most one cma_clients row per user. The
-- partial unique covers the (likely) majority case while letting manual
-- entries (crm_contact_id NULL) coexist freely.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cma_clients_user_crm_contact
  ON cma_clients (user_id, crm_connection_id, crm_contact_id)
  WHERE crm_contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS cma_clients_user_idx
  ON cma_clients (user_id, enrolled, paused);

CREATE INDEX IF NOT EXISTS cma_clients_profile_idx
  ON cma_clients (profile_id);

-- Hot path for the cadence scheduler: "give me everyone due in the next hour".
CREATE INDEX IF NOT EXISTS cma_clients_due_idx
  ON cma_clients (next_due_at)
  WHERE enrolled = TRUE AND paused = FALSE AND unsubscribed_at IS NULL;

-- ---------------------------------------------------------------------------
-- 7. cma_client_deliveries — per-cadence-cycle delivery record
--
-- 1 row per CMA actually delivered. Links the client to the ls_cma_runs
-- execution and stores the email artifact + engagement signals + value
-- snapshot for "vs your last CMA" comparisons.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS cma_client_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES cma_clients(id) ON DELETE CASCADE,
  cma_run_id UUID REFERENCES ls_cma_runs(id) ON DELETE SET NULL,

  -- Public landing page URL token — long random string, no auth required
  landing_page_token TEXT NOT NULL UNIQUE,

  email_subject TEXT,
  email_html TEXT,

  delivered_at TIMESTAMPTZ,                  -- NULL until the send completes
  send_error TEXT,                           -- non-null if the send failed

  -- Engagement (filled by ESP webhook handler in Wave 5)
  opened_at TIMESTAMPTZ,
  opened_count INT NOT NULL DEFAULT 0,
  clicked_at TIMESTAMPTZ,
  clicked_count INT NOT NULL DEFAULT 0,
  replied_at TIMESTAMPTZ,
  bounced_at TIMESTAMPTZ,
  complained_at TIMESTAMPTZ,

  -- Value snapshot — copied off ls_cma_runs at delivery time so the
  -- "vs last CMA" panel survives even if the run row is later purged.
  recommended_price_cents BIGINT,
  estimated_value_cents BIGINT,
  marketable_value_cents BIGINT,

  -- Cadence triggering source (cron vs manual force-send)
  trigger_source TEXT NOT NULL DEFAULT 'cadence'
    CHECK (trigger_source IN ('cadence', 'manual', 'first_enrollment')),

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cma_client_deliveries_client_idx
  ON cma_client_deliveries (client_id, delivered_at DESC);

CREATE INDEX IF NOT EXISTS cma_client_deliveries_run_idx
  ON cma_client_deliveries (cma_run_id)
  WHERE cma_run_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 8. cma_agent_settings — per-agent global prefs
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS cma_agent_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  default_cadence_days INT NOT NULL DEFAULT 90
    CHECK (default_cadence_days >= 7),       -- 7-day floor — per CMA_PLAN.md §5

  default_email_connection_id UUID
    REFERENCES cma_email_connections(id) ON DELETE SET NULL,

  -- Pre-send draft notification — agent sees what's going out N days
  -- before it sends, can edit or cancel.
  reminder_lead_days INT NOT NULL DEFAULT 7,

  -- When true, the cadence scheduler stages a draft instead of sending.
  -- Agent must explicitly approve each one. Useful for hands-on agents
  -- or as a kill-switch during onboarding.
  manual_review_required BOOLEAN NOT NULL DEFAULT FALSE,

  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 9. try_reserve_client_slot — atomic enrollment guard
--
-- "Active clients" is a snapshot meter (current enrolled count vs cap),
-- not a monthly counter. Reserving a slot = counting the user's enrolled
-- rows under a row-level lock, comparing to the supplied cap, and only
-- letting the caller flip enrolled=true if there's room.
--
-- Pattern matches try_reserve_active_listing_slot but counts the live
-- table (cma_clients) instead of a usage row, because the meter is a
-- snapshot of state rather than a monthly tally.
--
-- Returns JSONB:
--   { reserved: true,  active_clients, active_clients_limit }
--   { reserved: false, active_clients, active_clients_limit }
--
-- -1 limit = UNLIMITED (Diamond tier).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION try_reserve_client_slot(
  p_user_id UUID,
  p_client_id UUID,
  p_limit INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_active INT;
  v_already_enrolled BOOLEAN;
BEGIN
  -- Lock the row we're about to enroll so concurrent enrollment requests
  -- on the *same* client serialize.
  SELECT enrolled INTO v_already_enrolled
    FROM cma_clients
   WHERE id = p_client_id
     AND user_id = p_user_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'reserved', FALSE,
      'error', 'client_not_found'
    );
  END IF;

  -- Idempotent: re-enrolling an already-enrolled client succeeds without
  -- double-counting against the cap.
  IF v_already_enrolled THEN
    SELECT COUNT(*) INTO v_active
      FROM cma_clients
     WHERE user_id = p_user_id AND enrolled = TRUE;
    RETURN jsonb_build_object(
      'reserved', TRUE,
      'active_clients', v_active,
      'active_clients_limit', p_limit
    );
  END IF;

  SELECT COUNT(*) INTO v_active
    FROM cma_clients
   WHERE user_id = p_user_id AND enrolled = TRUE;

  IF p_limit <> -1 AND v_active >= p_limit THEN
    RETURN jsonb_build_object(
      'reserved', FALSE,
      'active_clients', v_active,
      'active_clients_limit', p_limit
    );
  END IF;

  UPDATE cma_clients
     SET enrolled = TRUE,
         updated_at = now()
   WHERE id = p_client_id;

  RETURN jsonb_build_object(
    'reserved', TRUE,
    'active_clients', v_active + 1,
    'active_clients_limit', p_limit
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 10. Delivery counter helper (best-effort, no locking)
--
-- Bumps the monthly meter on the existing ls_usage row whenever a
-- delivery completes. Mirrors the ls_increment_cma_count pattern.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION cma_increment_delivery_count(
  p_user_id UUID,
  p_month_start DATE,
  p_is_manual BOOLEAN DEFAULT FALSE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO ls_usage (user_id, month_start, deliveries_sent, manual_sends)
  VALUES (
    p_user_id,
    p_month_start,
    1,
    CASE WHEN p_is_manual THEN 1 ELSE 0 END
  )
  ON CONFLICT (user_id, month_start)
  DO UPDATE SET
    deliveries_sent = ls_usage.deliveries_sent + 1,
    manual_sends    = ls_usage.manual_sends + (CASE WHEN p_is_manual THEN 1 ELSE 0 END),
    updated_at      = now();
END;
$$;

-- Old per-month CMA-runs counter is no longer the right shape (v2's meter
-- is per-delivery). Drop it so nothing keeps calling it by mistake.
DROP FUNCTION IF EXISTS ls_increment_cma_count(UUID, DATE);

-- ---------------------------------------------------------------------------
-- 11. Row-level security
-- ---------------------------------------------------------------------------

ALTER TABLE cma_crm_connections     ENABLE ROW LEVEL SECURITY;
ALTER TABLE cma_email_connections   ENABLE ROW LEVEL SECURITY;
ALTER TABLE cma_clients             ENABLE ROW LEVEL SECURITY;
ALTER TABLE cma_client_deliveries   ENABLE ROW LEVEL SECURITY;
ALTER TABLE cma_agent_settings      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users own crm connections" ON cma_crm_connections
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users own email connections" ON cma_email_connections
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users own clients" ON cma_clients
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users own deliveries via client" ON cma_client_deliveries
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM cma_clients
     WHERE cma_clients.id = cma_client_deliveries.client_id
       AND cma_clients.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM cma_clients
     WHERE cma_clients.id = cma_client_deliveries.client_id
       AND cma_clients.user_id = auth.uid()
  ));

CREATE POLICY "users own settings" ON cma_agent_settings
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 12. admin_pack_configs — swap v1 ladder for v2 active-clients ladder
--
-- Old columns active_listings_limit + cma_soft_limit no longer apply.
-- New columns: active_clients_limit + manual_sends_per_month.
-- ---------------------------------------------------------------------------

ALTER TABLE admin_pack_configs
  ADD COLUMN IF NOT EXISTS active_clients_limit INT,
  ADD COLUMN IF NOT EXISTS manual_sends_per_month INT;

-- The v1 columns stay on the table for now (other apps don't use them,
-- and dropping requires coordinating with any in-flight migrations).
-- They're harmless as NULL on the new rows.

DELETE FROM admin_pack_configs WHERE app = 'listing_studio';

INSERT INTO admin_pack_configs
  (id, app, tier, price_cents, stripe_price_id, label, best_value, is_active, sort_order, active_clients_limit, manual_sends_per_month)
VALUES
  ('listing_studio_bronze',  'listing_studio', 'Bronze',  4900,  'price_TODO', '100 active clients · automated quarterly CMAs', false, true, 1, 100, 50),
  ('listing_studio_silver',  'listing_studio', 'Silver',  9900,  'price_TODO', '250 active clients · automated quarterly CMAs', false, true, 2, 250, 50),
  ('listing_studio_gold',    'listing_studio', 'Gold',    17900, 'price_TODO', '500 active clients · automated quarterly CMAs', true,  true, 3, 500, 50),
  ('listing_studio_diamond', 'listing_studio', 'Diamond', 29900, 'price_TODO', 'Unlimited active clients (fair use)',           false, true, 4, -1,  50)
ON CONFLICT (id) DO UPDATE SET
  price_cents            = EXCLUDED.price_cents,
  label                  = EXCLUDED.label,
  best_value             = EXCLUDED.best_value,
  sort_order             = EXCLUDED.sort_order,
  active_clients_limit   = EXCLUDED.active_clients_limit,
  manual_sends_per_month = EXCLUDED.manual_sends_per_month,
  active_listings_limit  = NULL,
  cma_soft_limit         = NULL;
