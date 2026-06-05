-- Seed Hyperlocal feature flag in admin_settings
INSERT INTO admin_settings (key, value, description) VALUES
  ('HYPERLOCAL', 'false', 'Enable Hyperlocal market-report email campaigns app')
ON CONFLICT (key) DO NOTHING;
