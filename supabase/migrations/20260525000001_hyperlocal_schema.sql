-- ============================================================
-- Hyperlocal Schema
-- 12 tables + RLS policies + indexes
-- 2 tables are platform-scoped (no hl_ prefix) — reusable by future apps
-- ============================================================

-- ============================================================
-- 1. CAMPAIGNS — saved configs (one per scope)
-- ============================================================
CREATE TABLE IF NOT EXISTS hl_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,

  segmentation TEXT NOT NULL DEFAULT 'zip' CHECK (segmentation IN (
    'zip', 'city', 'county', 'subdivision', 'neighborhood', 'custom'
  )),
  custom_segmentation_field TEXT,

  property_type_filters TEXT[] DEFAULT '{}',
  price_range_low INT,
  price_range_high INT,
  source_filters TEXT[] DEFAULT '{}',

  lens TEXT NOT NULL DEFAULT 'balanced' CHECK (lens IN ('seller', 'buyer', 'balanced')),
  min_segment_size INT DEFAULT 3,

  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS hl_campaigns_user_idx ON hl_campaigns (user_id, is_active);

-- ============================================================
-- 2. PLATFORM SENDER PROFILES — reusable across runs
--    Platform-scoped: NOT prefixed hl_ — future apps can reuse
--    CAN-SPAM physical address is required
-- ============================================================
CREATE TABLE IF NOT EXISTS platform_sender_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  full_name TEXT NOT NULL,
  title TEXT,
  brokerage TEXT,
  phone TEXT,
  reply_to_email TEXT,
  license_number TEXT,

  physical_address TEXT NOT NULL,        -- CAN-SPAM requirement
  sign_off TEXT DEFAULT 'Talk soon,',

  is_default BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_sender_profiles_user_idx ON platform_sender_profiles (user_id, is_default);

-- ============================================================
-- 3. PLATFORM BRANDING PROFILES — colors/fonts/disclaimers
--    Platform-scoped: NOT prefixed hl_ — future apps can reuse
-- ============================================================
CREATE TABLE IF NOT EXISTS platform_branding_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Default',

  primary_color TEXT DEFAULT '#1B7FB5',
  secondary_color TEXT DEFAULT '#17A697',
  accent_color TEXT DEFAULT '#31DBA5',

  heading_font TEXT DEFAULT 'Inter',
  body_font TEXT DEFAULT 'Inter',

  motifs TEXT,
  corner_style TEXT DEFAULT 'soft' CHECK (corner_style IN ('sharp', 'soft', 'rounded', 'pill')),
  button_shape TEXT DEFAULT 'rounded' CHECK (button_shape IN ('pill', 'rounded', 'square')),
  density TEXT DEFAULT 'standard' CHECK (density IN ('compact', 'standard', 'airy')),
  header_treatment TEXT DEFAULT 'solid' CHECK (header_treatment IN ('solid', 'gradient', 'image')),
  header_image_url TEXT,
  metric_box_style TEXT DEFAULT 'card',
  divider_style TEXT DEFAULT 'subtle',

  logo_url TEXT,
  headshot_url TEXT,
  brokerage_badge_url TEXT,
  legal_disclaimer TEXT,

  is_default BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_branding_profiles_user_idx ON platform_branding_profiles (user_id, is_default);

-- ============================================================
-- 4. CRM CONNECTIONS — per user × platform; encrypted creds
-- ============================================================
CREATE TABLE IF NOT EXISTS hl_crm_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  platform TEXT NOT NULL CHECK (platform IN (
    'followupboss', 'lofty', 'sierra', 'boldtrail', 'cinc', 'cloze', 'gohighlevel', 'csv'
  )),
  label TEXT,

  api_key_encrypted TEXT,
  oauth_access_token_encrypted TEXT,
  oauth_refresh_token_encrypted TEXT,
  oauth_expires_at TIMESTAMPTZ,
  base_url TEXT,

  column_mapping JSONB,                  -- CSV: { first_name_column, email_column, ... }

  search_area_source TEXT CHECK (search_area_source IN ('field', 'tag-pattern', 'none')),
  search_area_column TEXT,
  search_area_tag_pattern TEXT,

  is_active BOOLEAN DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  last_error TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hl_crm_connections_user_idx ON hl_crm_connections (user_id, is_active);

-- ============================================================
-- 5. EMAIL CONNECTIONS — Google / Microsoft OAuth, or Resend domain
-- ============================================================
CREATE TABLE IF NOT EXISTS hl_email_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  provider TEXT NOT NULL CHECK (provider IN ('google', 'microsoft', 'resend')),
  email_address TEXT NOT NULL,
  display_name TEXT,

  oauth_access_token_encrypted TEXT,
  oauth_refresh_token_encrypted TEXT,
  oauth_expires_at TIMESTAMPTZ,
  oauth_scope TEXT,

  resend_domain TEXT,
  resend_domain_id TEXT,
  resend_dkim_status TEXT CHECK (resend_dkim_status IN ('pending', 'verified', 'failed')),

  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,

  last_send_at TIMESTAMPTZ,
  last_error TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hl_email_connections_user_idx ON hl_email_connections (user_id, is_active, is_default);

-- ============================================================
-- 6. RUNS — top-level execution record
-- ============================================================
CREATE TABLE IF NOT EXISTS hl_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES hl_campaigns(id) ON DELETE SET NULL,

  sender_profile_id UUID REFERENCES platform_sender_profiles(id) ON DELETE SET NULL,
  branding_profile_id UUID REFERENCES platform_branding_profiles(id) ON DELETE SET NULL,
  email_connection_id UUID REFERENCES hl_email_connections(id) ON DELETE SET NULL,
  crm_connection_id UUID REFERENCES hl_crm_connections(id) ON DELETE SET NULL,

  phase TEXT NOT NULL DEFAULT 'discover' CHECK (phase IN (
    'discover', 'awaiting_mls', 'generate', 'review', 'sending', 'completed', 'failed', 'cancelled'
  )),

  contacts_fetched INT DEFAULT 0,
  segments_count INT DEFAULT 0,
  emails_drafted INT DEFAULT 0,
  emails_sent INT DEFAULT 0,
  emails_failed INT DEFAULT 0,

  error TEXT,

  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hl_runs_user_phase_idx ON hl_runs (user_id, phase, created_at DESC);

-- ============================================================
-- 8. MLS FILE UPLOADS (defined before segments to satisfy FK)
-- ============================================================
CREATE TABLE IF NOT EXISTS hl_mls_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES hl_runs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_size_bytes INT,
  detected_format TEXT CHECK (detected_format IN ('csv', 'xlsx', 'json')),
  detected_columns JSONB,
  segment_assignments JSONB,
  row_count INT,

  uploaded_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hl_mls_uploads_run_idx ON hl_mls_uploads (run_id);

-- ============================================================
-- 7. SEGMENTS — one per geography per run
-- ============================================================
CREATE TABLE IF NOT EXISTS hl_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES hl_runs(id) ON DELETE CASCADE,

  geo_key TEXT NOT NULL,
  geo_label TEXT,
  geo_type TEXT CHECK (geo_type IN ('zip', 'city', 'county', 'subdivision', 'neighborhood')),

  contact_count INT DEFAULT 0,
  seller_contact_count INT DEFAULT 0,
  buyer_contact_count INT DEFAULT 0,

  mls_upload_id UUID REFERENCES hl_mls_uploads(id) ON DELETE SET NULL,
  mls_metrics JSONB,

  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'ready', 'rolled_up', 'skipped'
  )),
  rolled_up_into TEXT,

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hl_segments_run_idx ON hl_segments (run_id, status);

-- ============================================================
-- 9. EMAIL DRAFTS — one per segment per run
-- ============================================================
CREATE TABLE IF NOT EXISTS hl_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES hl_runs(id) ON DELETE CASCADE,
  segment_id UUID NOT NULL REFERENCES hl_segments(id) ON DELETE CASCADE,

  subject TEXT,
  preheader TEXT,
  html TEXT,
  plain_text TEXT,

  seller_perspective_html TEXT,
  buyer_perspective_html TEXT,

  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'approved', 'sending', 'sent', 'failed'
  )),
  approved_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hl_emails_run_idx ON hl_emails (run_id, status);

-- ============================================================
-- 10. RECIPIENTS — per email × contact (tagged perspective)
-- ============================================================
CREATE TABLE IF NOT EXISTS hl_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id UUID NOT NULL REFERENCES hl_emails(id) ON DELETE CASCADE,

  contact_external_id TEXT,
  contact_email TEXT NOT NULL,
  contact_first_name TEXT,
  contact_last_name TEXT,

  perspective TEXT NOT NULL DEFAULT 'both' CHECK (perspective IN ('seller', 'buyer', 'both')),

  send_status TEXT NOT NULL DEFAULT 'pending' CHECK (send_status IN (
    'pending', 'suppressed', 'sent', 'bounced', 'complained', 'failed'
  )),

  unsubscribe_token TEXT,
  provider_message_id TEXT,

  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  error_message TEXT,

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hl_recipients_send_status_idx ON hl_recipients (send_status, email_id);
CREATE INDEX IF NOT EXISTS hl_recipients_email_id_idx ON hl_recipients (email_id);

-- ============================================================
-- 11. SEND JOBS — drives the per-recipient Inngest sender
-- ============================================================
CREATE TABLE IF NOT EXISTS hl_send_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES hl_recipients(id) ON DELETE CASCADE,
  email_connection_id UUID NOT NULL REFERENCES hl_email_connections(id) ON DELETE CASCADE,

  scheduled_at TIMESTAMPTZ DEFAULT now(),
  attempts INT DEFAULT 0,
  last_error TEXT,

  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued', 'in_flight', 'done', 'failed'
  )),

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hl_send_jobs_status_idx ON hl_send_jobs (status, scheduled_at);

-- ============================================================
-- 12. SUPPRESSIONS — per-user global suppression list
-- ============================================================
CREATE TABLE IF NOT EXISTS hl_suppressions (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT 'manual' CHECK (reason IN (
    'unsubscribed', 'bounced', 'complained', 'manual'
  )),
  added_at TIMESTAMPTZ DEFAULT now(),
  source_run_id UUID REFERENCES hl_runs(id) ON DELETE SET NULL,

  PRIMARY KEY (user_id, email)
);

CREATE INDEX IF NOT EXISTS hl_suppressions_user_idx ON hl_suppressions (user_id, added_at DESC);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE hl_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_sender_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_branding_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE hl_crm_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE hl_email_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE hl_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE hl_mls_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE hl_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE hl_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE hl_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE hl_send_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE hl_suppressions ENABLE ROW LEVEL SECURITY;

-- Direct user_id ownership policies
CREATE POLICY "hl_campaigns_user_policy" ON hl_campaigns FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "platform_sender_profiles_user_policy" ON platform_sender_profiles FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "platform_branding_profiles_user_policy" ON platform_branding_profiles FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "hl_crm_connections_user_policy" ON hl_crm_connections FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "hl_email_connections_user_policy" ON hl_email_connections FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "hl_runs_user_policy" ON hl_runs FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "hl_mls_uploads_user_policy" ON hl_mls_uploads FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "hl_suppressions_user_policy" ON hl_suppressions FOR ALL USING (auth.uid() = user_id);

-- Transitive ownership through runs
CREATE POLICY "hl_segments_user_policy" ON hl_segments FOR ALL
  USING (run_id IN (SELECT id FROM hl_runs WHERE user_id = auth.uid()));
CREATE POLICY "hl_emails_user_policy" ON hl_emails FOR ALL
  USING (run_id IN (SELECT id FROM hl_runs WHERE user_id = auth.uid()));
CREATE POLICY "hl_recipients_user_policy" ON hl_recipients FOR ALL
  USING (email_id IN (
    SELECT e.id FROM hl_emails e
    JOIN hl_runs r ON e.run_id = r.id
    WHERE r.user_id = auth.uid()
  ));
CREATE POLICY "hl_send_jobs_user_policy" ON hl_send_jobs FOR ALL
  USING (recipient_id IN (
    SELECT rec.id FROM hl_recipients rec
    JOIN hl_emails e ON rec.email_id = e.id
    JOIN hl_runs r ON e.run_id = r.id
    WHERE r.user_id = auth.uid()
  ));
