-- ============================================================
-- Wave 9 — collapse per-app CRM + ESP connection tables into a
-- shared platform layer with per-app state on top.
--
-- Before:
--   hl_crm_connections          ← Hyperlocal-owned
--   hl_email_connections        ← Hyperlocal-owned
--   cma_crm_connections         ← CMA-owned (duplicate auth)
--   cma_email_connections       ← CMA-owned (duplicate auth)
--
-- After:
--   platform_crm_connections    ← shared identity + auth, profile-scoped
--   app_crm_connection_state    ← per-app filter config + sync state
--   platform_email_connections  ← shared provider + domain verification
--   app_email_connection_state  ← per-app webhook ids + send state
--
-- Each (connection_id, app) pair is unique on the app_state tables —
-- one connection can be wired into multiple apps without duplication.
-- The third+ apps we ship just add another app value to the CHECK list.
--
-- Pre-launch clean cutover — nothing live, no dual-write window. Data
-- in referencing tables (hl_runs / hl_emails / hl_email_events /
-- hl_email_event_daily / cma_clients / cma_client_deliveries) gets
-- nulled out before the FK retarget; their consumers handle null
-- connection_ids already.
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. platform_crm_connections — identity + auth (profile-scoped)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS platform_crm_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES platform_profiles(id) ON DELETE CASCADE,

  -- Superset of every supported CRM platform across all apps. App-side
  -- types narrow this per-app (CmaCrmPlatform is a subset). Adding a
  -- new CRM = expand this CHECK + register the connector in
  -- lib/hyperlocal/crm/.
  platform TEXT NOT NULL CHECK (platform IN (
    'followupboss', 'lofty', 'sierra', 'boldtrail',
    'cinc', 'cloze', 'gohighlevel', 'csv'
  )),
  label TEXT,

  -- Auth blobs — at most one of api_key / oauth tokens populated
  -- depending on the platform.
  api_key_encrypted TEXT,
  oauth_access_token_encrypted TEXT,
  oauth_refresh_token_encrypted TEXT,
  oauth_expires_at TIMESTAMPTZ,
  base_url TEXT,

  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_crm_connections_user_idx
  ON platform_crm_connections (user_id, is_active);
CREATE INDEX IF NOT EXISTS platform_crm_connections_profile_idx
  ON platform_crm_connections (profile_id);

-- ---------------------------------------------------------------------------
-- 2. app_crm_connection_state — per-app filter config + sync tracking
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app_crm_connection_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL
    REFERENCES platform_crm_connections(id) ON DELETE CASCADE,

  -- Internal app slug — kept on this column so the existing internal
  -- naming (listing_studio = CMA) doesn't have to change. New apps
  -- expand the CHECK.
  app TEXT NOT NULL CHECK (app IN ('hyperlocal', 'listing_studio')),

  -- App-specific filter config. Shape varies by app:
  --   hyperlocal: { search_area_source, search_area_column,
  --                 search_area_tag_pattern, column_mapping }
  --   listing_studio (CMA): { past_client_source, past_client_value }
  -- App code is the schema owner — DB enforces only shape-agnostic
  -- presence.
  filter_config JSONB NOT NULL DEFAULT '{}'::jsonb,

  last_synced_at TIMESTAMPTZ,
  last_error TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One state row per (connection, app) — re-running the connect flow
  -- for the same app upserts here.
  UNIQUE (connection_id, app)
);

CREATE INDEX IF NOT EXISTS app_crm_connection_state_app_idx
  ON app_crm_connection_state (app, connection_id);

-- ---------------------------------------------------------------------------
-- 3. platform_email_connections — provider + domain verification (shared)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS platform_email_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES platform_profiles(id) ON DELETE CASCADE,

  provider TEXT NOT NULL CHECK (provider IN (
    'resend', 'sendgrid',
    'mailchimp', 'activecampaign', 'constantcontact', 'klaviyo'
  )),
  email_address TEXT NOT NULL,
  display_name TEXT,

  -- Resend-specific (dedicated domain + DKIM verification).
  resend_api_key_encrypted TEXT,
  resend_domain TEXT,
  resend_domain_id TEXT,
  resend_dkim_status TEXT CHECK (resend_dkim_status IN ('pending', 'verified', 'failed')),

  -- Generic provider credentials (non-Resend).
  provider_api_key_encrypted TEXT,
  provider_oauth_access_token_encrypted TEXT,
  provider_oauth_refresh_token_encrypted TEXT,
  provider_oauth_expires_at TIMESTAMPTZ,

  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_email_connections_user_idx
  ON platform_email_connections (user_id, is_active);
CREATE INDEX IF NOT EXISTS platform_email_connections_profile_idx
  ON platform_email_connections (profile_id);

-- ---------------------------------------------------------------------------
-- 4. app_email_connection_state — per-app webhook + send state
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app_email_connection_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL
    REFERENCES platform_email_connections(id) ON DELETE CASCADE,

  app TEXT NOT NULL CHECK (app IN ('hyperlocal', 'listing_studio')),

  -- Webhook is per-app because the callback URL differs per app
  -- (/api/webhooks/resend vs /api/cma/webhooks/resend). Resend
  -- webhooks are account-scoped, so two apps under one API key get
  -- two separate webhook records on the Resend side.
  webhook_id TEXT,
  webhook_secret_encrypted TEXT,

  -- Per-app default flag — Hyperlocal might default to Mailchimp
  -- while CMA defaults to Resend on the same profile.
  is_default BOOLEAN NOT NULL DEFAULT FALSE,

  -- Per-ESP grab-bag — Mailchimp audience id, AC list id, SendGrid
  -- webhook public key, etc. App code owns the shape.
  provider_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Per-app send health.
  last_send_at TIMESTAMPTZ,
  last_error TEXT,
  paused BOOLEAN NOT NULL DEFAULT FALSE,
  paused_reason TEXT,
  paused_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (connection_id, app)
);

CREATE INDEX IF NOT EXISTS app_email_connection_state_app_idx
  ON app_email_connection_state (app, connection_id);
CREATE INDEX IF NOT EXISTS app_email_connection_state_default_idx
  ON app_email_connection_state (app, is_default)
  WHERE is_default = TRUE;

-- ---------------------------------------------------------------------------
-- 5. Retarget FKs on referencing tables.
--
-- Pre-launch: NULL out the existing connection_id values (they point
-- at rows in the soon-to-be-dropped tables), drop the FK, re-add it
-- to point at the new table. Wave 10 backfills these from the app
-- layer once new connections exist.
-- ---------------------------------------------------------------------------

-- Hyperlocal: hl_runs
UPDATE hl_runs SET crm_connection_id = NULL WHERE crm_connection_id IS NOT NULL;
UPDATE hl_runs SET email_connection_id = NULL WHERE email_connection_id IS NOT NULL;
ALTER TABLE hl_runs
  DROP CONSTRAINT IF EXISTS hl_runs_crm_connection_id_fkey,
  DROP CONSTRAINT IF EXISTS hl_runs_email_connection_id_fkey;
ALTER TABLE hl_runs
  ADD CONSTRAINT hl_runs_crm_connection_id_fkey
    FOREIGN KEY (crm_connection_id)
    REFERENCES platform_crm_connections(id) ON DELETE SET NULL,
  ADD CONSTRAINT hl_runs_email_connection_id_fkey
    FOREIGN KEY (email_connection_id)
    REFERENCES platform_email_connections(id) ON DELETE SET NULL;

-- Hyperlocal: hl_email_events
DELETE FROM hl_email_events;
ALTER TABLE hl_email_events
  DROP CONSTRAINT IF EXISTS hl_email_events_email_connection_id_fkey;
ALTER TABLE hl_email_events
  ADD CONSTRAINT hl_email_events_email_connection_id_fkey
    FOREIGN KEY (email_connection_id)
    REFERENCES platform_email_connections(id) ON DELETE CASCADE;

-- Hyperlocal: hl_email_event_daily
DELETE FROM hl_email_event_daily;
ALTER TABLE hl_email_event_daily
  DROP CONSTRAINT IF EXISTS hl_email_event_daily_email_connection_id_fkey;
ALTER TABLE hl_email_event_daily
  ADD CONSTRAINT hl_email_event_daily_email_connection_id_fkey
    FOREIGN KEY (email_connection_id)
    REFERENCES platform_email_connections(id) ON DELETE CASCADE;

-- CMA: cma_clients
UPDATE cma_clients SET crm_connection_id = NULL WHERE crm_connection_id IS NOT NULL;
ALTER TABLE cma_clients
  DROP CONSTRAINT IF EXISTS cma_clients_crm_connection_id_fkey;
ALTER TABLE cma_clients
  ADD CONSTRAINT cma_clients_crm_connection_id_fkey
    FOREIGN KEY (crm_connection_id)
    REFERENCES platform_crm_connections(id) ON DELETE SET NULL;

-- CMA: cma_client_deliveries
UPDATE cma_client_deliveries SET email_connection_id = NULL WHERE email_connection_id IS NOT NULL;
ALTER TABLE cma_client_deliveries
  DROP CONSTRAINT IF EXISTS cma_client_deliveries_email_connection_id_fkey;
ALTER TABLE cma_client_deliveries
  ADD CONSTRAINT cma_client_deliveries_email_connection_id_fkey
    FOREIGN KEY (email_connection_id)
    REFERENCES platform_email_connections(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 6. Drop the four old tables. CASCADE picks up any lingering RLS
--    policies, indexes, default views that we missed.
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS hl_crm_connections     CASCADE;
DROP TABLE IF EXISTS hl_email_connections   CASCADE;
DROP TABLE IF EXISTS cma_crm_connections    CASCADE;
DROP TABLE IF EXISTS cma_email_connections  CASCADE;

-- ---------------------------------------------------------------------------
-- 7. Row-level security on the new tables
-- ---------------------------------------------------------------------------

ALTER TABLE platform_crm_connections    ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_email_connections  ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_crm_connection_state    ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_email_connection_state  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users own platform crm connections" ON platform_crm_connections
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users own platform email connections" ON platform_email_connections
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- App-state RLS walks the connection FK so users only see state for
-- connections they own. The connection_id → platform_*_connections
-- lookup is single-FK, sub-ms; not a hot path.
CREATE POLICY "users own app crm state via connection" ON app_crm_connection_state
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM platform_crm_connections
      WHERE platform_crm_connections.id = app_crm_connection_state.connection_id
        AND platform_crm_connections.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM platform_crm_connections
      WHERE platform_crm_connections.id = app_crm_connection_state.connection_id
        AND platform_crm_connections.user_id = auth.uid()
  ));

CREATE POLICY "users own app email state via connection" ON app_email_connection_state
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM platform_email_connections
      WHERE platform_email_connections.id = app_email_connection_state.connection_id
        AND platform_email_connections.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM platform_email_connections
      WHERE platform_email_connections.id = app_email_connection_state.connection_id
        AND platform_email_connections.user_id = auth.uid()
  ));
