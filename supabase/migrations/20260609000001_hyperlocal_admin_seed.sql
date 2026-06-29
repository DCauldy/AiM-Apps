-- Seed HYPERLOCAL feature flag into admin_settings
INSERT INTO admin_settings (key, value)
VALUES ('HYPERLOCAL', 'false')
ON CONFLICT (key) DO NOTHING;

-- Add hyperlocal-specific columns to admin_pack_configs.
-- These map 1:1 with the meters in lib/hyperlocal-packs.ts:
--   campaigns_limit       — campaignsPerMonth
--   segments_limit        — segmentsPerCampaign
--   mls_history_months    — mlsHistoryMonths (-1 = unlimited)
--   ai_edits_limit        — aiChatEditsPerDraft (-1 = unlimited)
ALTER TABLE admin_pack_configs
  ADD COLUMN IF NOT EXISTS campaigns_limit INT,
  ADD COLUMN IF NOT EXISTS segments_limit INT,
  ADD COLUMN IF NOT EXISTS mls_history_months INT,
  ADD COLUMN IF NOT EXISTS ai_edits_limit INT;

-- Update CHECK constraint to allow 'hyperlocal'
ALTER TABLE admin_pack_configs DROP CONSTRAINT IF EXISTS admin_pack_configs_app_check;
ALTER TABLE admin_pack_configs ADD CONSTRAINT admin_pack_configs_app_check
  CHECK (app IN ('prompt_studio', 'blog_engine', 'radar', 'hyperlocal'));

-- Seed hyperlocal pack configs. Matches HYPERLOCAL_PACKS in lib/.
-- -1 in mls_history_months / ai_edits_limit means "unlimited".
INSERT INTO admin_pack_configs (
  id, app, tier, sort_order, price_cents, stripe_price_id,
  label, is_active, best_value,
  campaigns_limit, segments_limit, mls_history_months, ai_edits_limit
)
VALUES
  ('hyperlocal_bronze',  'hyperlocal', 'Bronze',  1, 3900,  'price_TODO',
   '8 campaigns/mo · 10 segments · 12mo MLS',
   true, false, 8,  10, 12, 20),
  ('hyperlocal_silver',  'hyperlocal', 'Silver',  2, 7900,  'price_TODO',
   '16 campaigns/mo · 20 segments · 24mo MLS',
   true, false, 16, 20, 24, 50),
  ('hyperlocal_gold',    'hyperlocal', 'Gold',    3, 12900, 'price_TODO',
   '32 campaigns/mo · 30 segments · 36mo MLS',
   true, true,  32, 30, 36, 100),
  ('hyperlocal_diamond', 'hyperlocal', 'Diamond', 4, 22900, 'price_TODO',
   '64 campaigns/mo · 50 segments · unlimited MLS history',
   true, false, 64, 50, -1, -1)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- hl_user_packs — one row per user, tracks active Hyperlocal pack
-- subscription. Mirrors bofu_schedules + radar_config subscription
-- columns. Missing row = user is on the Pro base allowances only.
-- ============================================================
CREATE TABLE IF NOT EXISTS hl_user_packs (
  user_id                 UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  pack_id                 TEXT REFERENCES admin_pack_configs(id) ON DELETE SET NULL,
  stripe_subscription_id  TEXT,
  stripe_customer_id      TEXT,
  current_period_start    TIMESTAMPTZ,
  current_period_end      TIMESTAMPTZ,
  status                  TEXT,
  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS hl_user_packs_subscription_id_idx
  ON hl_user_packs (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

ALTER TABLE hl_user_packs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hl_user_packs_owner_read"
  ON hl_user_packs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "hl_user_packs_service_all"
  ON hl_user_packs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
