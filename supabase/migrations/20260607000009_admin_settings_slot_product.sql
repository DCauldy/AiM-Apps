-- Seed admin_settings with the Stripe Profile Slot product reference.
-- The Stripe Checkout flow looks up the active Price for this product at
-- runtime, so admins can rotate the price (annual price hike, currency
-- variant) without touching this row. The value can be edited from the
-- Admin Dashboard → Stripe Products tab.

INSERT INTO admin_settings (key, value, description)
VALUES (
  'stripe_profile_slot_product_id',
  'prod_UepvxoE5JNy47L',
  'Stripe Product ID for the AiM Automations Profile Slot annual add-on. The active recurring Price attached to this product is what users are subscribed to when they buy a slot.'
)
ON CONFLICT (key) DO NOTHING;
