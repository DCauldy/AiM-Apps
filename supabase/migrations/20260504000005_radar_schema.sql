-- Radar schema: 9 tables with RLS

-- 1. radar_config — per-user Radar settings and state
CREATE TABLE IF NOT EXISTS radar_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_variations TEXT[] DEFAULT '{}',
  monitored_engines TEXT[] DEFAULT ARRAY['chatgpt','perplexity','gemini','google_aio','google_ai_mode','copilot','claude','grok'],
  monitoring_frequency TEXT NOT NULL DEFAULT 'monthly' CHECK (monitoring_frequency IN ('monthly', 'weekly')),
  tier TEXT NOT NULL DEFAULT 'pro' CHECK (tier IN ('pro', 'silver', 'gold', 'platinum')),
  query_limit INT NOT NULL DEFAULT 25,
  manual_checks_limit INT NOT NULL DEFAULT 0,
  audits_limit INT NOT NULL DEFAULT 1,
  stripe_subscription_id TEXT,
  stripe_customer_id TEXT,
  onboarding_completed BOOLEAN NOT NULL DEFAULT false,
  last_check_at TIMESTAMPTZ,
  next_check_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE radar_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "radar_config_user_policy" ON radar_config FOR ALL USING (auth.uid() = user_id);

-- 2. radar_competitors — tracked competitors
CREATE TABLE IF NOT EXISTS radar_competitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  website_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE radar_competitors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "radar_competitors_user_policy" ON radar_competitors FOR ALL USING (auth.uid() = user_id);

-- 3. radar_queries — tracked search queries
CREATE TABLE IF NOT EXISTS radar_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  query_text TEXT NOT NULL,
  category TEXT,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('ai_generated', 'manual', 'competitor_discovery')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE radar_queries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "radar_queries_user_policy" ON radar_queries FOR ALL USING (auth.uid() = user_id);

-- 4. radar_query_suggestions — AI-generated query suggestions
CREATE TABLE IF NOT EXISTS radar_query_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  query_text TEXT NOT NULL,
  category TEXT,
  status TEXT NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested', 'added', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE radar_query_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "radar_query_suggestions_user_policy" ON radar_query_suggestions FOR ALL USING (auth.uid() = user_id);

-- 5. radar_checks — one row per monitoring run
CREATE TABLE IF NOT EXISTS radar_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trigger TEXT NOT NULL DEFAULT 'manual' CHECK (trigger IN ('scheduled', 'manual')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'completed_partial', 'failed')),
  engines_checked TEXT[] DEFAULT '{}',
  engines_failed TEXT[] DEFAULT '{}',
  queries_checked INT DEFAULT 0,
  visibility_score NUMERIC,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE radar_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "radar_checks_user_policy" ON radar_checks FOR ALL USING (auth.uid() = user_id);

-- 6. radar_results — one row per query per engine per check
CREATE TABLE IF NOT EXISTS radar_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id UUID NOT NULL REFERENCES radar_checks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  query_id UUID NOT NULL REFERENCES radar_queries(id) ON DELETE CASCADE,
  engine TEXT NOT NULL CHECK (engine IN ('chatgpt', 'perplexity', 'gemini', 'google_aio', 'google_ai_mode', 'copilot', 'claude', 'grok')),
  brand_mentioned BOOLEAN NOT NULL DEFAULT false,
  position INT,
  sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative')),
  competitors_mentioned JSONB DEFAULT '[]',
  citations JSONB DEFAULT '[]',
  response_text TEXT,
  quality_score NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE radar_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "radar_results_user_policy" ON radar_results FOR ALL USING (auth.uid() = user_id);

-- Index for efficient result lookups
CREATE INDEX IF NOT EXISTS idx_radar_results_check_id ON radar_results(check_id);
CREATE INDEX IF NOT EXISTS idx_radar_results_query_id ON radar_results(query_id);

-- 7. radar_alerts — in-app alert notifications
CREATE TABLE IF NOT EXISTS radar_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  check_id UUID REFERENCES radar_checks(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN (
    'brand_appeared', 'brand_disappeared',
    'position_improved', 'position_declined',
    'new_competitor', 'competitor_overtook',
    'citation_gained', 'citation_lost',
    'audit_score_changed'
  )),
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('positive', 'negative', 'info')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE radar_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "radar_alerts_user_policy" ON radar_alerts FOR ALL USING (auth.uid() = user_id);

-- Index for unread alerts
CREATE INDEX IF NOT EXISTS idx_radar_alerts_user_unread ON radar_alerts(user_id, read) WHERE NOT read;

-- 8. radar_audits — one row per website audit run
CREATE TABLE IF NOT EXISTS radar_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url_crawled TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'crawling', 'analyzing', 'completed', 'failed')),
  pages_found INT DEFAULT 0,
  pages_analyzed INT DEFAULT 0,
  overall_score NUMERIC,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE radar_audits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "radar_audits_user_policy" ON radar_audits FOR ALL USING (auth.uid() = user_id);

-- 9. radar_audit_pages — one row per page analyzed
CREATE TABLE IF NOT EXISTS radar_audit_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID NOT NULL REFERENCES radar_audits(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  page_type TEXT DEFAULT 'other' CHECK (page_type IN ('homepage', 'service', 'about', 'neighborhood', 'blog', 'listing', 'other')),
  title TEXT,
  score NUMERIC,
  scoring_breakdown JSONB DEFAULT '{}',
  recommendations JSONB DEFAULT '[]',
  is_blog BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE radar_audit_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "radar_audit_pages_user_policy" ON radar_audit_pages FOR ALL USING (auth.uid() = user_id);

-- Index for audit page lookups
CREATE INDEX IF NOT EXISTS idx_radar_audit_pages_audit_id ON radar_audit_pages(audit_id);
