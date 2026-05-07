-- ============================================================
-- Blog Engine Schema
-- ============================================================

-- Enable pgvector extension for semantic deduplication
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- PROFILE: Add subscription tier
-- ============================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_tier TEXT
  DEFAULT 'member'
  CHECK (subscription_tier IN ('standalone', 'member', 'pro'));

-- Backfill from existing account_type
UPDATE profiles SET subscription_tier = 'standalone'
  WHERE account_type = 'standalone' AND subscription_tier IS NULL;
UPDATE profiles SET subscription_tier = 'member'
  WHERE account_type = 'aim_member' AND subscription_tier IS NULL;

-- ============================================================
-- BOFU PROFILES (onboarding data)
-- ============================================================

CREATE TABLE IF NOT EXISTS bofu_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Professional identity
  professional_type TEXT NOT NULL CHECK (professional_type IN (
    'solo_agent', 'team_leader', 'team_agent', 'broker_owner', 'loan_officer', 'title_executive'
  )),
  full_name TEXT NOT NULL,
  business_name TEXT,
  bio TEXT,

  -- Market
  country TEXT NOT NULL DEFAULT 'United States',
  state TEXT NOT NULL,
  metro_area TEXT NOT NULL,
  counties TEXT[] DEFAULT '{}',
  neighborhoods TEXT[] DEFAULT '{}',

  -- Focus
  target_clients TEXT[] DEFAULT '{}',
  property_types TEXT[] DEFAULT '{}',
  specializations TEXT[] DEFAULT '{}',

  -- SEO & Content
  website_url TEXT,
  blog_url TEXT,
  seo_keywords TEXT[] DEFAULT '{}',
  brand_colors JSONB DEFAULT '{}',
  logo_url TEXT,

  -- CTAs
  cta_primary TEXT,
  cta_link TEXT,
  cta_secondary TEXT,
  cta_secondary_link TEXT,

  -- Compliance
  license_info TEXT,
  regulatory_body TEXT,
  compliance_notes TEXT,

  -- Preferences
  blog_tone TEXT DEFAULT 'professional' CHECK (blog_tone IN ('professional', 'conversational', 'authoritative')),
  include_disclaimers BOOLEAN DEFAULT true,

  -- Onboarding
  onboarding_completed BOOLEAN DEFAULT false,
  onboarding_chat_thread_id UUID,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(user_id)
);

-- ============================================================
-- CMS CONNECTIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS bofu_cms_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  platform TEXT NOT NULL CHECK (platform IN ('wordpress', 'squarespace', 'webhook')),
  label TEXT,

  -- WordPress fields
  wp_site_url TEXT,
  wp_username TEXT,
  wp_app_password_encrypted TEXT,
  wp_default_status TEXT DEFAULT 'draft' CHECK (wp_default_status IN ('draft', 'publish')),
  wp_default_category TEXT,
  wp_seo_plugin TEXT DEFAULT 'none' CHECK (wp_seo_plugin IN ('yoast', 'rankmath', 'none')),

  -- Squarespace fields
  sq_site_id TEXT,
  sq_api_key_encrypted TEXT,
  sq_collection_id TEXT,

  -- Webhook fields (Zapier/Make)
  webhook_url TEXT,
  webhook_secret TEXT,

  -- Status
  is_active BOOLEAN DEFAULT true,
  last_publish_at TIMESTAMPTZ,
  last_error TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- DISCOVERY RUNS
-- ============================================================

CREATE TABLE IF NOT EXISTS bofu_discovery_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'researching', 'scoring', 'completed', 'failed'
  )),

  queries_generated INT DEFAULT 0,
  topics_scored INT DEFAULT 0,
  topics_selected INT DEFAULT 0,

  research_summary JSONB,
  error_message TEXT,

  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TOPICS
-- ============================================================

CREATE TABLE IF NOT EXISTS bofu_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  discovery_run_id UUID REFERENCES bofu_discovery_runs(id) ON DELETE SET NULL,

  title TEXT NOT NULL,
  description TEXT,
  search_queries TEXT[] DEFAULT '{}',
  inquiry_type TEXT CHECK (inquiry_type IN ('property', 'process', 'professional')),

  -- Scoring
  bofu_score NUMERIC(5,2),
  scoring_breakdown JSONB,
  rank INT,

  -- Deduplication
  embedding vector(1536),

  -- Status
  status TEXT NOT NULL DEFAULT 'unused' CHECK (status IN (
    'unused', 'writing', 'written', 'skipped', 'expired'
  )),
  written_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for vector similarity search
CREATE INDEX IF NOT EXISTS bofu_topics_embedding_idx
  ON bofu_topics USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Index for finding unused topics per user
CREATE INDEX IF NOT EXISTS bofu_topics_user_status_idx
  ON bofu_topics (user_id, status, bofu_score DESC);

-- ============================================================
-- BLOGS
-- ============================================================

CREATE TABLE IF NOT EXISTS bofu_blogs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES bofu_topics(id) ON DELETE SET NULL,

  -- Content
  title TEXT NOT NULL,
  slug TEXT,
  content_html TEXT NOT NULL,
  content_markdown TEXT,
  excerpt TEXT,
  answer_capsule TEXT,

  -- SEO Metadata
  meta_title TEXT,
  meta_description TEXT,
  og_title TEXT,
  og_description TEXT,
  canonical_url TEXT,

  -- Schema Markup (JSON-LD)
  schema_article JSONB,
  schema_faq JSONB,
  schema_local_business JSONB,
  schema_breadcrumb JSONB,

  -- Image
  featured_image_url TEXT,
  featured_image_alt TEXT,
  featured_image_style TEXT CHECK (featured_image_style IN ('location', 'branded')),
  image_regenerations_used INT DEFAULT 0,
  image_regenerations_limit INT DEFAULT 3,

  -- WordPress / CMS specific
  wp_categories TEXT[] DEFAULT '{}',
  wp_tags TEXT[] DEFAULT '{}',
  seo_plugin_fields JSONB,

  -- Internal linking
  internal_links JSONB DEFAULT '[]',
  external_citations JSONB DEFAULT '[]',

  -- Publishing
  publish_status TEXT NOT NULL DEFAULT 'draft' CHECK (publish_status IN (
    'generating', 'draft', 'review', 'published', 'failed'
  )),
  cms_connection_id UUID REFERENCES bofu_cms_connections(id),
  cms_post_id TEXT,
  cms_post_url TEXT,
  published_at TIMESTAMPTZ,

  -- Refinement chat
  refinements_used INT DEFAULT 0,
  refinements_limit INT DEFAULT 5,

  -- Pipeline tracking
  pipeline_run_id TEXT,
  generation_cost_cents INT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bofu_blogs_user_status_idx
  ON bofu_blogs (user_id, publish_status, created_at DESC);

-- ============================================================
-- BLOG VERSIONS (refinement history)
-- ============================================================

CREATE TABLE IF NOT EXISTS bofu_blog_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blog_id UUID NOT NULL REFERENCES bofu_blogs(id) ON DELETE CASCADE,

  version_number INT NOT NULL,
  content_html TEXT NOT NULL,
  content_markdown TEXT,
  change_description TEXT,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- BLOG CHAT MESSAGES (refinement chat)
-- ============================================================

CREATE TABLE IF NOT EXISTS bofu_blog_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blog_id UUID NOT NULL REFERENCES bofu_blogs(id) ON DELETE CASCADE,

  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- SCHEDULING
-- ============================================================

CREATE TABLE IF NOT EXISTS bofu_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  frequency INT NOT NULL DEFAULT 3,
  active_days TEXT[] DEFAULT '{monday,wednesday,friday}',
  preferred_time TIME DEFAULT '08:00',
  timezone TEXT DEFAULT 'America/New_York',

  is_active BOOLEAN DEFAULT true,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(user_id)
);

-- ============================================================
-- USAGE TRACKING (weekly)
-- ============================================================

CREATE TABLE IF NOT EXISTS bofu_usage (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  blogs_generated INT DEFAULT 0,
  blogs_limit INT DEFAULT 3,
  bonus_blogs INT DEFAULT 0,

  PRIMARY KEY (user_id, week_start)
);

-- Increment function
CREATE OR REPLACE FUNCTION increment_bofu_usage(p_user_id UUID, p_week_start DATE)
RETURNS void AS $$
BEGIN
  INSERT INTO bofu_usage (user_id, week_start, blogs_generated, blogs_limit)
  VALUES (p_user_id, p_week_start, 1, 3)
  ON CONFLICT (user_id, week_start)
  DO UPDATE SET blogs_generated = bofu_usage.blogs_generated + 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- BONUS BLOG PURCHASES
-- ============================================================

CREATE TABLE IF NOT EXISTS bofu_pack_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pack_size INT NOT NULL,
  price_cents INT NOT NULL,
  stripe_payment_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- ONBOARDING CHAT
-- ============================================================

CREATE TABLE IF NOT EXISTS bofu_onboarding_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,

  extracted_data JSONB,
  section TEXT,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE bofu_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE bofu_cms_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE bofu_discovery_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE bofu_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE bofu_blogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE bofu_blog_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bofu_blog_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE bofu_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE bofu_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE bofu_pack_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE bofu_onboarding_chats ENABLE ROW LEVEL SECURITY;

-- Users can only access their own data (direct user_id reference)
CREATE POLICY "bofu_profiles_user_policy" ON bofu_profiles FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "bofu_cms_connections_user_policy" ON bofu_cms_connections FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "bofu_discovery_runs_user_policy" ON bofu_discovery_runs FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "bofu_topics_user_policy" ON bofu_topics FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "bofu_blogs_user_policy" ON bofu_blogs FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "bofu_schedules_user_policy" ON bofu_schedules FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "bofu_usage_user_policy" ON bofu_usage FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "bofu_pack_purchases_user_policy" ON bofu_pack_purchases FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "bofu_onboarding_chats_user_policy" ON bofu_onboarding_chats FOR ALL USING (auth.uid() = user_id);

-- Versions and chats: users access via blog ownership
CREATE POLICY "bofu_blog_versions_user_policy" ON bofu_blog_versions FOR ALL
  USING (blog_id IN (SELECT id FROM bofu_blogs WHERE user_id = auth.uid()));
CREATE POLICY "bofu_blog_chats_user_policy" ON bofu_blog_chats FOR ALL
  USING (blog_id IN (SELECT id FROM bofu_blogs WHERE user_id = auth.uid()));
