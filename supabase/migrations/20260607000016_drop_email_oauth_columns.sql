-- ============================================================
-- Drop OAuth columns from hl_email_connections.
--
-- These four columns were only ever populated by the Gmail and
-- Outlook OAuth flows. The provider constraint is now Resend-only
-- (see 20260607000005_hl_email_resend_only.sql), so these columns
-- are unreachable and the application no longer references them.
-- ============================================================

ALTER TABLE hl_email_connections
  DROP COLUMN IF EXISTS oauth_access_token_encrypted,
  DROP COLUMN IF EXISTS oauth_refresh_token_encrypted,
  DROP COLUMN IF EXISTS oauth_expires_at,
  DROP COLUMN IF EXISTS oauth_scope;
