-- Seed RADAR feature flag into admin_settings
INSERT INTO admin_settings (key, value)
VALUES ('RADAR', 'false')
ON CONFLICT (key) DO NOTHING;

-- Add radar-specific columns to admin_pack_configs
ALTER TABLE admin_pack_configs
  ADD COLUMN IF NOT EXISTS query_limit INT,
  ADD COLUMN IF NOT EXISTS manual_checks_limit INT,
  ADD COLUMN IF NOT EXISTS audits_limit INT,
  ADD COLUMN IF NOT EXISTS monitoring_frequency TEXT;

-- Update CHECK constraint to allow 'radar' app
ALTER TABLE admin_pack_configs DROP CONSTRAINT IF EXISTS admin_pack_configs_app_check;
ALTER TABLE admin_pack_configs ADD CONSTRAINT admin_pack_configs_app_check
  CHECK (app IN ('prompt_studio', 'blog_engine', 'radar'));

-- Seed radar pack configs
INSERT INTO admin_pack_configs (id, app, tier, sort_order, price_cents, stripe_price_id, label, is_active, best_value, query_limit, manual_checks_limit, audits_limit, monitoring_frequency)
VALUES
  ('radar_silver',   'radar', 'Silver',   1, 2900,  'price_TODO', '50 queries, 5 checks/mo',       true, false, 50,  5,  2, 'monthly'),
  ('radar_gold',     'radar', 'Gold',     2, 9900,  'price_TODO', '100 queries, weekly monitoring', true, true,  100, 15, 5, 'weekly'),
  ('radar_platinum', 'radar', 'Platinum', 3, 14900, 'price_TODO', '200 queries, 50 checks/mo',     true, false, 200, 50, 10, 'weekly')
ON CONFLICT (id) DO NOTHING;
