-- Standalone Signup Schema Migration
-- Adds account_type, bonus_prompts, access_tier, prompt_pack_purchases,
-- and updates the handle_new_user trigger for standalone signup support.

-- ─── 1. Add account_type to profiles ─────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'standalone'
    CHECK (account_type IN ('standalone', 'aim_member'));

-- Migrate existing data: tier='full' → aim_member, tier='trial' stays standalone
UPDATE public.profiles SET account_type = 'aim_member' WHERE tier = 'full';
UPDATE public.profiles SET account_type = 'standalone' WHERE tier = 'trial';

-- ─── 2. Add bonus_prompts to profiles ────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bonus_prompts INT NOT NULL DEFAULT 0;

-- ─── 3. Add access_tier to aim_prompts ───────────────────────────────────────
ALTER TABLE public.aim_prompts
  ADD COLUMN IF NOT EXISTS access_tier TEXT NOT NULL DEFAULT 'member'
    CHECK (access_tier IN ('free', 'member'));

-- ─── 4. Create prompt_pack_purchases table ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prompt_pack_purchases (
  id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  pack_size INT NOT NULL,
  price_cents INT NOT NULL,
  stripe_payment_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.prompt_pack_purchases ENABLE ROW LEVEL SECURITY;

-- Users can only view their own purchases
DROP POLICY IF EXISTS "Users can view own purchases" ON public.prompt_pack_purchases;
CREATE POLICY "Users can view own purchases" ON public.prompt_pack_purchases
  FOR SELECT USING (auth.uid() = user_id);

-- Only service role can insert (via webhook)
DROP POLICY IF EXISTS "Service role can insert purchases" ON public.prompt_pack_purchases;
CREATE POLICY "Service role can insert purchases" ON public.prompt_pack_purchases
  FOR INSERT WITH CHECK (false);
-- Note: service role bypasses RLS, so the INSERT policy blocks regular users
-- while service role inserts freely.

-- ─── 5. Update handle_new_user() trigger ─────────────────────────────────────
-- Now reads account_type and monthly_limit from raw_user_meta_data
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
begin
  insert into public.profiles (id, email, full_name, account_type, monthly_limit)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    coalesce(new.raw_user_meta_data->>'account_type', 'standalone'),
    case
      when new.raw_user_meta_data->>'account_type' = 'aim_member' then 25
      else 5
    end
  );
  return new;
end;
$$;

-- ─── 6. Decrement bonus prompts RPC ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.decrement_bonus_prompts(
  p_user_id UUID
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.profiles
  SET bonus_prompts = GREATEST(bonus_prompts - 1, 0)
  WHERE id = p_user_id AND bonus_prompts > 0;
END;
$$;

-- ─── 7. Add bonus prompts RPC ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.add_bonus_prompts(
  p_user_id UUID,
  p_amount INT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.profiles
  SET bonus_prompts = bonus_prompts + p_amount
  WHERE id = p_user_id;
END;
$$;
