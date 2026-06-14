-- ============================================================
-- platform_profiles — unified company-identity profile
--
-- A user owns one or more profiles (e.g. personal brand, team,
-- brokerage, separate business). Every other app reads from this
-- table for shared identity, market, brand, contact, and
-- compliance data. App-specific tables keep app-mechanical config
-- only and reference platform_profiles via profile_id.
--
-- See PROFILE_RESTRUCTURE_PLAN.md for full design rationale.
-- ============================================================

CREATE TABLE IF NOT EXISTS platform_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Meta
  display_name TEXT NOT NULL,                       -- e.g. "Smith Team — RE/MAX"
  is_default BOOLEAN NOT NULL DEFAULT false,
  archived_at TIMESTAMPTZ,                          -- null = active

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Identity
  full_name TEXT,
  title TEXT,
  professional_type TEXT CHECK (professional_type IS NULL OR professional_type IN (
    'solo_agent', 'team_leader', 'team_agent', 'broker_owner', 'loan_officer', 'title_executive'
  )),
  brokerage TEXT,
  bio TEXT,

  -- Market
  country TEXT DEFAULT 'United States',
  state TEXT,
  metro_area TEXT,
  counties TEXT[] DEFAULT '{}',
  neighborhoods TEXT[] DEFAULT '{}',

  -- Business focus
  target_clients TEXT[] DEFAULT '{}',
  specializations TEXT[] DEFAULT '{}',
  property_types TEXT[] DEFAULT '{}',

  -- Contact / CAN-SPAM
  phone TEXT,
  reply_to_email TEXT,
  physical_address TEXT,                            -- Hyperlocal verifies at send time
  sign_off TEXT DEFAULT 'Talk soon,',

  -- Compliance
  license_number TEXT,
  license_info TEXT,
  regulatory_body TEXT,
  compliance_notes TEXT,
  legal_disclaimer TEXT,

  -- Web presence
  website_url TEXT,
  blog_url TEXT,

  -- Brand visuals (mirrors platform_branding_profiles)
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

  -- SEO
  seo_keywords TEXT[] DEFAULT '{}'
);

-- Only one default profile per user, ignoring archived
CREATE UNIQUE INDEX IF NOT EXISTS platform_profiles_one_default_per_user
  ON platform_profiles (user_id)
  WHERE is_default AND archived_at IS NULL;

-- Lookup indexes
CREATE INDEX IF NOT EXISTS platform_profiles_user_id_idx ON platform_profiles (user_id);
CREATE INDEX IF NOT EXISTS platform_profiles_active_idx
  ON platform_profiles (user_id, created_at DESC)
  WHERE archived_at IS NULL;

-- updated_at is set manually by the app on each update — matches the
-- convention used by user_profiles, platform_sender_profiles, etc.

-- ============================================================
-- RLS — users see/write only their own profiles
-- ============================================================
ALTER TABLE platform_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY platform_profiles_select_own ON platform_profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY platform_profiles_insert_own ON platform_profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY platform_profiles_update_own ON platform_profiles
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY platform_profiles_delete_own ON platform_profiles
  FOR DELETE USING (auth.uid() = user_id);

-- Service role can do anything (server-side backfill, admin tools)
CREATE POLICY platform_profiles_service_all ON platform_profiles
  FOR ALL TO service_role USING (true) WITH CHECK (true);
