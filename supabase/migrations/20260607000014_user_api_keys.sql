CREATE TABLE IF NOT EXISTS public.user_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_key TEXT NOT NULL,
  api_key_encrypted TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT user_api_keys_service_key_not_blank
    CHECK (length(trim(service_key)) > 0),
  CONSTRAINT user_api_keys_one_per_service
    UNIQUE (user_id, service_key)
);

CREATE INDEX IF NOT EXISTS user_api_keys_user_id_idx
  ON public.user_api_keys (user_id);

ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_api_keys_select_own ON public.user_api_keys
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY user_api_keys_insert_own ON public.user_api_keys
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_api_keys_update_own ON public.user_api_keys
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_api_keys_delete_own ON public.user_api_keys
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY user_api_keys_service_all ON public.user_api_keys
  FOR ALL TO service_role USING (true) WITH CHECK (true);
