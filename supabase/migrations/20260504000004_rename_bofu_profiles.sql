-- Rename bofu_profiles → user_profiles so Radar (and future apps) can share profile data.
-- All existing columns, data, and RLS policies are preserved.

-- 1. Rename the table
ALTER TABLE IF EXISTS bofu_profiles RENAME TO user_profiles;

-- 2. Rename the RLS policy
ALTER POLICY "bofu_profiles_user_policy" ON user_profiles RENAME TO "user_profiles_user_policy";
