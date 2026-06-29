-- Engine weight tiers for visibility score calculation
-- Stored in admin_settings so they're adjustable without code changes.
INSERT INTO admin_settings (key, value)
VALUES (
  'RADAR_ENGINE_WEIGHTS',
  '{"google_aio": 1.5, "chatgpt": 1.5, "perplexity": 1.5, "gemini": 1.0, "google_ai_mode": 1.0, "claude": 1.0, "copilot": 0.7, "grok": 0.7}'
)
ON CONFLICT (key) DO NOTHING;
