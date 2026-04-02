-- AiM Library Migration
-- Creates tables for the admin-curated AiM prompt library

-- aim_prompts: curated prompts maintained by AiM admins
CREATE TABLE IF NOT EXISTS aim_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content text NOT NULL,
  title text,
  description text,
  topic text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- aim_prompt_upvotes: user upvotes on AiM Library prompts
CREATE TABLE IF NOT EXISTS aim_prompt_upvotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aim_prompt_id uuid NOT NULL REFERENCES aim_prompts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(aim_prompt_id, user_id)
);

-- aim_saved_prompts: user-saved AiM Library prompts
CREATE TABLE IF NOT EXISTS aim_saved_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aim_prompt_id uuid NOT NULL REFERENCES aim_prompts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(aim_prompt_id, user_id)
);

-- RLS: aim_prompts
ALTER TABLE aim_prompts ENABLE ROW LEVEL SECURITY;

-- Anyone can read AiM prompts
CREATE POLICY "Anyone can view aim_prompts"
  ON aim_prompts FOR SELECT
  USING (true);

-- No user-level INSERT/UPDATE/DELETE policies — admin writes go through service role only

-- RLS: aim_prompt_upvotes
ALTER TABLE aim_prompt_upvotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view aim_prompt_upvotes"
  ON aim_prompt_upvotes FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own aim upvotes"
  ON aim_prompt_upvotes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own aim upvotes"
  ON aim_prompt_upvotes FOR DELETE
  USING (auth.uid() = user_id);

-- RLS: aim_saved_prompts
ALTER TABLE aim_saved_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own aim saved"
  ON aim_saved_prompts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own aim saved"
  ON aim_saved_prompts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own aim saved"
  ON aim_saved_prompts FOR DELETE
  USING (auth.uid() = user_id);

-- Optional: trigger to keep updated_at current on aim_prompts
CREATE OR REPLACE FUNCTION update_aim_prompts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER aim_prompts_updated_at
  BEFORE UPDATE ON aim_prompts
  FOR EACH ROW EXECUTE FUNCTION update_aim_prompts_updated_at();
