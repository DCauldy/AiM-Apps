-- One Stripe customer per user, shared across every product (slot subscriptions,
-- Blog Engine packs, future products). Lives on the global profiles table so
-- billing logic does not have to look in multiple per-app tables.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_stripe_customer_id_idx
  ON public.profiles (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- Per-slot-subscription tracking: id of the Stripe subscription that grants
-- the user their additional profile slots beyond the included 1.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS slot_stripe_subscription_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_slot_subscription_id_idx
  ON public.profiles (slot_stripe_subscription_id)
  WHERE slot_stripe_subscription_id IS NOT NULL;
