-- Add monthly_limit and memberstack_id to profiles.
-- monthly_limit replaces the hardcoded TRIAL_MONTHLY_LIMIT constant;
-- it is set when the user authenticates via the AiM WordPress JWT.
-- memberstack_id stores the Memberstack member ID for reference.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS monthly_limit INT NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS memberstack_id TEXT;
