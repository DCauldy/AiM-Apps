-- ============================================================
-- Hyperlocal — feedback iteration round 1
--   * Drop the skip-on-small-segments behavior; flag instead
--   * Per-user Resend API key (BYO)
--   * Refinement counter on emails + AI chat history table
-- ============================================================

-- 1. Mark sub-threshold segments instead of skipping them
ALTER TABLE hl_segments
  ADD COLUMN IF NOT EXISTS below_min_size BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS hl_segments_below_min_idx
  ON hl_segments (run_id, below_min_size);

-- 2. Per-user Resend API key (BYO) — drops the platform-wide key fallback
ALTER TABLE hl_email_connections
  ADD COLUMN IF NOT EXISTS resend_api_key_encrypted TEXT;

-- 3. Refinement counter — caps AI chat edits per draft
ALTER TABLE hl_emails
  ADD COLUMN IF NOT EXISTS refinements_used INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refinements_limit INT NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS last_edit_snapshot JSONB;  -- for one-step undo

-- 4. AI chat history per draft (mirrors bofu_blog_chats pattern)
CREATE TABLE IF NOT EXISTS hl_email_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id UUID NOT NULL REFERENCES hl_emails(id) ON DELETE CASCADE,

  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,

  -- For assistant turns that produced an edit, record which block(s) changed
  applied_changes JSONB,

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hl_email_chats_email_idx
  ON hl_email_chats (email_id, created_at);

ALTER TABLE hl_email_chats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hl_email_chats_user_policy" ON hl_email_chats FOR ALL
  USING (email_id IN (
    SELECT e.id FROM hl_emails e
    JOIN hl_runs r ON e.run_id = r.id
    WHERE r.user_id = auth.uid()
  ));
