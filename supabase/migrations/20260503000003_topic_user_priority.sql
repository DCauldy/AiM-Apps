-- Add user_priority column for manual drag-and-drop reordering
ALTER TABLE bofu_topics ADD COLUMN IF NOT EXISTS user_priority INT;

-- Backfill unused topics with their AI-assigned rank
UPDATE bofu_topics
SET user_priority = rank
WHERE status = 'unused' AND rank IS NOT NULL AND user_priority IS NULL;
