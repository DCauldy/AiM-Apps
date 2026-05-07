-- Add synced_at column to track when blog content was last pushed to CMS
ALTER TABLE bofu_blogs ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;

-- Backfill: already-published blogs are considered "in sync" at publish time
UPDATE bofu_blogs SET synced_at = published_at WHERE published_at IS NOT NULL;
