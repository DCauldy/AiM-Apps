-- Admin Dashboard: settings + pack config tables
-- ================================================

-- admin_settings: key-value store for feature flags and config
CREATE TABLE admin_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;
-- No user-facing policies — service_role only

-- Seed feature flags
INSERT INTO admin_settings (key, value, description) VALUES
  ('PROMPT_PACKS', 'false', 'Enable Prompt Studio pack purchases'),
  ('BLOG_ENGINE', 'false', 'Enable Blog Engine app');

-- admin_pack_configs: pack definitions for both apps
CREATE TABLE admin_pack_configs (
  id TEXT PRIMARY KEY,
  app TEXT NOT NULL CHECK (app IN ('prompt_studio', 'blog_engine')),
  tier TEXT,
  size INT,
  frequency INT,
  price_cents INT,
  stripe_price_id TEXT DEFAULT 'price_TODO',
  label TEXT,
  best_value BOOLEAN DEFAULT false,
  sort_order INT,
  is_active BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

ALTER TABLE admin_pack_configs ENABLE ROW LEVEL SECURITY;
-- No user-facing policies — service_role only

-- Seed Prompt Studio packs (from lib/prompt-packs.ts)
INSERT INTO admin_pack_configs (id, app, tier, size, price_cents, stripe_price_id, label, best_value, sort_order) VALUES
  ('pack_bronze',  'prompt_studio', 'Bronze',  10,  299,  'price_1TRiz2I38RnYMEg39YYu4KSW', '10 Prompts',  false, 1),
  ('pack_silver',  'prompt_studio', 'Silver',  25,  599,  'price_1TRizOI38RnYMEg3QTo0xbgF', '25 Prompts',  false, 2),
  ('pack_gold',    'prompt_studio', 'Gold',    50,  899,  'price_1TRizhI38RnYMEg3AKrzO157', '50 Prompts',  true,  3),
  ('pack_diamond', 'prompt_studio', 'Diamond', 100, 1999, 'price_1TRizyI38RnYMEg3d80wCtzb', '100 Prompts', false, 4);

-- Seed Blog Engine packs (from lib/blog-packs.ts)
INSERT INTO admin_pack_configs (id, app, tier, frequency, price_cents, stripe_price_id, label, best_value, sort_order) VALUES
  ('blog_bronze',  'blog_engine', 'Bronze',  4, 3900,  'price_TODO', '4x / week',         false, 1),
  ('blog_silver',  'blog_engine', 'Silver',  5, 5900,  'price_TODO', '5x / week',         false, 2),
  ('blog_gold',    'blog_engine', 'Gold',    6, 7900,  'price_TODO', '6x / week',         true,  3),
  ('blog_diamond', 'blog_engine', 'Diamond', 7, 10900, 'price_TODO', '7x / week (daily)', false, 4);
