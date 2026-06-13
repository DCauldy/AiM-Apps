-- ============================================================
-- Wave 9 follow-up — restore the cma_agent_settings FK that was
-- collateral on the Wave 9 DROP CASCADE.
--
-- cma_email_connections being dropped cascaded the FK on
-- cma_agent_settings.default_email_connection_id. The column itself
-- still exists; just the constraint is gone. Re-add it pointing at
-- the new shared platform_email_connections table.
-- ============================================================

-- Defensive null-out — any existing value pointed at the dropped
-- table, so it's an orphan.
UPDATE cma_agent_settings
   SET default_email_connection_id = NULL
 WHERE default_email_connection_id IS NOT NULL;

ALTER TABLE cma_agent_settings
  ADD CONSTRAINT cma_agent_settings_default_email_connection_id_fkey
    FOREIGN KEY (default_email_connection_id)
    REFERENCES platform_email_connections(id)
    ON DELETE SET NULL;
