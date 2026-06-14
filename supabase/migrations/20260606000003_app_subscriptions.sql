CREATE TABLE IF NOT EXISTS public.app_subscriptions (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  user_id UUID NOT NULL,
  app_id TEXT NOT NULL,
  status TEXT DEFAULT 'active'::TEXT NOT NULL,
  plan_id TEXT,
  subscription_id TEXT,
  trial_ends_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT app_subscriptions_status_check
    CHECK (status = ANY (ARRAY['active'::TEXT, 'canceled'::TEXT, 'expired'::TEXT, 'trial'::TEXT]))
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'app_subscriptions_pkey'
      AND conrelid = 'public.app_subscriptions'::regclass
  ) THEN
    ALTER TABLE public.app_subscriptions
      ADD CONSTRAINT app_subscriptions_pkey PRIMARY KEY (id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'app_subscriptions_user_id_app_id_key'
      AND conrelid = 'public.app_subscriptions'::regclass
  ) THEN
    ALTER TABLE public.app_subscriptions
      ADD CONSTRAINT app_subscriptions_user_id_app_id_key UNIQUE (user_id, app_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'app_subscriptions_user_id_fkey'
      AND conrelid = 'public.app_subscriptions'::regclass
  ) THEN
    ALTER TABLE public.app_subscriptions
      ADD CONSTRAINT app_subscriptions_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_app_subscriptions_app_id
  ON public.app_subscriptions USING btree (app_id);

CREATE INDEX IF NOT EXISTS idx_app_subscriptions_status
  ON public.app_subscriptions USING btree (status);

CREATE INDEX IF NOT EXISTS idx_app_subscriptions_user_id
  ON public.app_subscriptions USING btree (user_id);

ALTER TABLE public.app_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage subscriptions" ON public.app_subscriptions;
CREATE POLICY "Service role can manage subscriptions"
  ON public.app_subscriptions
  FOR ALL
  USING ((select auth.role()) = 'service_role'::TEXT)
  WITH CHECK ((select auth.role()) = 'service_role'::TEXT);

DROP POLICY IF EXISTS "Users can view own subscriptions" ON public.app_subscriptions;
CREATE POLICY "Users can view own subscriptions"
  ON public.app_subscriptions
  FOR SELECT
  USING ((select auth.uid()) = user_id);

GRANT ALL ON TABLE public.app_subscriptions TO anon;
GRANT ALL ON TABLE public.app_subscriptions TO authenticated;
GRANT ALL ON TABLE public.app_subscriptions TO service_role;
