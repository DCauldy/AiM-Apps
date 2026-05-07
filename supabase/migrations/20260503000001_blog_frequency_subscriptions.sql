-- Add subscription tracking columns to bofu_schedules
ALTER TABLE bofu_schedules ADD COLUMN IF NOT EXISTS frequency_tier TEXT DEFAULT 'free';
ALTER TABLE bofu_schedules ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE bofu_schedules ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
