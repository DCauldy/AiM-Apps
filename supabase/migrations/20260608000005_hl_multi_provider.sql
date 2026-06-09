-- ============================================================
-- Multi-ESP abstraction foundation.
--
-- Expands hl_email_connections to support both transactional ESPs
-- (Resend, SendGrid) and campaign-mode marketing ESPs (Mailchimp,
-- ActiveCampaign, Constant Contact, Klaviyo). Adds a run phase for
-- the audience-confirmation step that campaign-mode sends require
-- when contacts in the recipient list aren't yet in the agent's
-- ESP audience.
--
-- Resend-specific columns (resend_api_key_encrypted etc.) stay
-- exactly as they are — Resend remains the first transactional
-- adapter, just behind the new interface.
-- ============================================================

-- ---- 1. Expand provider enum ----
ALTER TABLE hl_email_connections
  DROP CONSTRAINT IF EXISTS hl_email_connections_provider_check;
ALTER TABLE hl_email_connections
  ADD CONSTRAINT hl_email_connections_provider_check
  CHECK (provider IN (
    'resend', 'sendgrid',                                     -- transactional
    'mailchimp', 'activecampaign', 'constantcontact', 'klaviyo'  -- campaign
  ));

-- ---- 2. Provider-agnostic credentials + metadata ----
-- These cover both OAuth providers (Mailchimp, AC) and API-key providers
-- that aren't Resend. Resend keeps its dedicated resend_* columns since
-- they map to features specific to its API (domain id, webhook secret).
ALTER TABLE hl_email_connections
  ADD COLUMN IF NOT EXISTS provider_api_key_encrypted TEXT;

ALTER TABLE hl_email_connections
  ADD COLUMN IF NOT EXISTS provider_oauth_access_token_encrypted TEXT;
ALTER TABLE hl_email_connections
  ADD COLUMN IF NOT EXISTS provider_oauth_refresh_token_encrypted TEXT;
ALTER TABLE hl_email_connections
  ADD COLUMN IF NOT EXISTS provider_oauth_expires_at TIMESTAMPTZ;

-- Per-ESP grab bag. Examples:
--   Mailchimp: { dc: "us12", audience_id: "abc123", server_prefix: "us12" }
--   ActiveCampaign: { account_url: "https://acct.api-us1.com", list_id: 42 }
--   Constant Contact: { account_id: "...", default_list_id: "..." }
-- Use JSONB so each adapter can store what it needs without schema churn.
ALTER TABLE hl_email_connections
  ADD COLUMN IF NOT EXISTS provider_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ---- 3. New run phase for audience confirmation ----
-- When a campaign-mode provider needs the user to explicitly approve
-- adding new contacts to their ESP audience (because that affects their
-- ESP billing), the run parks in awaiting_audience_confirmation until
-- the user confirms or skips.
ALTER TABLE hl_runs
  DROP CONSTRAINT IF EXISTS hl_runs_phase_check;
ALTER TABLE hl_runs
  ADD CONSTRAINT hl_runs_phase_check
  CHECK (phase IN (
    'discover',
    'awaiting_service_area',
    'awaiting_mls',
    'awaiting_audience_confirmation',
    'generate',
    'review',
    'sending',
    'completed',
    'failed',
    'cancelled'
  ));

-- ---- 4. Campaign-mode tracking on the run ----
-- For campaign-mode sends, we create one campaign in the agent's ESP
-- and trigger send through it. Persist the provider's campaign id so we
-- can poll status, fetch reports, and link webhook events back to the run.
ALTER TABLE hl_runs
  ADD COLUMN IF NOT EXISTS provider_campaign_id TEXT;
ALTER TABLE hl_runs
  ADD COLUMN IF NOT EXISTS provider_campaign_status TEXT;
