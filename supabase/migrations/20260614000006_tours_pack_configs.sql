-- Seed admin_pack_configs rows for Tours.
--
-- Tours had no entries in the pack-config table — admins couldn't
-- edit pricing / tier names / Stripe IDs from /admin → App Packs.
-- Now there are four (Bronze/Silver/Gold/Diamond) matching the
-- shape of the Radar + Listing Studio rows: tier + price + Stripe
-- ID editable in the UI; the underlying per-tier limits (rendered
-- tours/month) live in lib/tours-packs.ts.
--
-- The existing admin_pack_configs_app_check hardcoded the allowed
-- apps to a 5-element ARRAY. Drop + recreate it with 'tours' added
-- so the inserts below pass.

alter table public.admin_pack_configs
  drop constraint if exists admin_pack_configs_app_check;

alter table public.admin_pack_configs
  add constraint admin_pack_configs_app_check
  check (app in (
    'prompt_studio',
    'blog_engine',
    'radar',
    'hyperlocal',
    'listing_studio',
    'tours'
  ));

insert into public.admin_pack_configs (
  id, app, tier, size, frequency, price_cents, stripe_price_id, label,
  best_value, is_active, sort_order
) values
  ('tours_bronze',  'tours', 'Bronze',  2,  null, 2900,  'price_TODO',
   '2 tours / mo',  false, true, 1),
  ('tours_silver',  'tours', 'Silver',  5,  null, 5900,  'price_TODO',
   '5 tours / mo',  false, true, 2),
  ('tours_gold',    'tours', 'Gold',    12, null, 9900,  'price_TODO',
   '12 tours / mo', true,  true, 3),
  ('tours_diamond', 'tours', 'Diamond', 30, null, 19900, 'price_TODO',
   '30 tours / mo', false, true, 4)
on conflict (id) do nothing;
