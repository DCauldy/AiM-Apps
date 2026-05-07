-- RPC functions for atomically incrementing radar usage counters.
-- These use advisory locks to prevent race conditions.

-- Increment manual checks count for a user in a given monthly period.
CREATE OR REPLACE FUNCTION increment_radar_manual_checks(p_user_id UUID, p_period TEXT)
RETURNS void AS $$
BEGIN
  INSERT INTO radar_usage (user_id, period, manual_checks_used)
  VALUES (p_user_id, p_period, 1)
  ON CONFLICT (user_id, period)
  DO UPDATE SET manual_checks_used = radar_usage.manual_checks_used + 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Increment audits count for a user in a given monthly period.
CREATE OR REPLACE FUNCTION increment_radar_audits(p_user_id UUID, p_period TEXT)
RETURNS void AS $$
BEGIN
  INSERT INTO radar_usage (user_id, period, audits_used)
  VALUES (p_user_id, p_period, 1)
  ON CONFLICT (user_id, period)
  DO UPDATE SET audits_used = radar_usage.audits_used + 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Usage tracking table for radar (monthly periods)
CREATE TABLE IF NOT EXISTS radar_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period TEXT NOT NULL, -- e.g. '2026-05'
  manual_checks_used INT NOT NULL DEFAULT 0,
  audits_used INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, period)
);

ALTER TABLE radar_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "radar_usage_user_policy" ON radar_usage FOR ALL USING (auth.uid() = user_id);
