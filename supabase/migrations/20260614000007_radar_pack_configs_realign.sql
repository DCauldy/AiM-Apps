-- Re-align admin_pack_configs Radar rows with lib/radar-packs.ts.
--
-- Pre-Otterly Radar had 3 tiers (Silver/Gold/Platinum) seeded by
-- 20260504000006_radar_admin_seed.sql. The Otterly-backed v2
-- collapsed those to a 4-tier ladder (Bronze/Silver/Gold/Diamond)
-- in lib/radar-packs.ts but the DB still carried the old 3 rows
-- — visible in /admin → App Packs as a stale, mis-named set.
--
-- This wipes the old Radar rows and seeds the 4 new tiers to match
-- the in-code source of truth. The `size` column carries the
-- per-tier tracked-prompt count (5 / 12 / 25 / 50) so PackConfigTab
-- can surface it in the same "N prompts" chip pattern Tours uses.

delete from public.admin_pack_configs where app = 'radar';

insert into public.admin_pack_configs (
  id, app, tier, size, frequency, price_cents, stripe_price_id, label,
  best_value, is_active, sort_order
) values
  ('radar_bronze',  'radar', 'Bronze',  5,  null, 2900,  'price_TODO',
   '5 prompts · weekly',     false, true, 1),
  ('radar_silver',  'radar', 'Silver',  12, null, 5900,  'price_TODO',
   '12 prompts · daily',     false, true, 2),
  ('radar_gold',    'radar', 'Gold',    25, null, 9900,  'price_TODO',
   '25 prompts · daily',     true,  true, 3),
  ('radar_diamond', 'radar', 'Diamond', 50, null, 19900, 'price_TODO',
   '50 prompts · twice daily', false, true, 4);
