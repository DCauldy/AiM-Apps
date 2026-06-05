-- ============================================================
-- Topic Deduplication Upgrade
-- Two-layer dedup: trigram text matching + vector cosine similarity
-- ============================================================

-- Enable pg_trgm for trigram similarity
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN index for trigram matching on topic titles
CREATE INDEX IF NOT EXISTS bofu_topics_title_trgm_idx
  ON bofu_topics USING gin (title gin_trgm_ops);

-- ============================================================
-- RPC: match_topics_trigram
-- Returns similar topics by trigram text overlap (no embedding needed)
-- ============================================================

CREATE OR REPLACE FUNCTION match_topics_trigram(
  p_user_id UUID,
  p_title TEXT,
  p_threshold FLOAT DEFAULT 0.3
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  status TEXT,
  similarity FLOAT
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    t.id,
    t.title,
    t.status,
    similarity(t.title, p_title)::FLOAT AS similarity
  FROM bofu_topics t
  WHERE t.user_id = p_user_id
    AND similarity(t.title, p_title) > p_threshold
  ORDER BY similarity DESC
  LIMIT 10;
$$;

-- ============================================================
-- RPC: match_topics_embedding
-- Returns similar topics by vector cosine similarity
-- ============================================================

CREATE OR REPLACE FUNCTION match_topics_embedding(
  p_user_id UUID,
  p_embedding vector(1536),
  p_threshold FLOAT DEFAULT 0.85,
  p_limit INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  status TEXT,
  similarity FLOAT
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    t.id,
    t.title,
    t.status,
    (1 - (t.embedding <=> p_embedding))::FLOAT AS similarity
  FROM bofu_topics t
  WHERE t.user_id = p_user_id
    AND t.embedding IS NOT NULL
    AND (1 - (t.embedding <=> p_embedding)) > p_threshold
  ORDER BY t.embedding <=> p_embedding
  LIMIT p_limit;
$$;
