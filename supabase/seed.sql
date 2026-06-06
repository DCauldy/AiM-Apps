-- Local development seed data. Do not put production exports or secrets here.

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change,
  email_change_token_current,
  reauthentication_token,
  phone_change,
  phone_change_token,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111',
  'authenticated',
  'authenticated',
  'dev@aim.local',
  crypt('password123', gen_salt('bf')),
  now(),
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"full_name": "Local Dev"}'::jsonb,
  now(),
  now()
)
on conflict (id) do update
set
  email = excluded.email,
  encrypted_password = excluded.encrypted_password,
  email_confirmed_at = excluded.email_confirmed_at,
  confirmation_token = excluded.confirmation_token,
  recovery_token = excluded.recovery_token,
  email_change_token_new = excluded.email_change_token_new,
  email_change = excluded.email_change,
  email_change_token_current = excluded.email_change_token_current,
  reauthentication_token = excluded.reauthentication_token,
  phone_change = excluded.phone_change,
  phone_change_token = excluded.phone_change_token,
  raw_app_meta_data = excluded.raw_app_meta_data,
  raw_user_meta_data = excluded.raw_user_meta_data,
  updated_at = now();

insert into auth.identities (
  id,
  user_id,
  provider_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
values (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111111',
  '{"sub": "11111111-1111-1111-1111-111111111111", "email": "dev@aim.local", "email_verified": true}'::jsonb,
  'email',
  now(),
  now(),
  now()
)
on conflict (provider, provider_id) do update
set
  identity_data = excluded.identity_data,
  updated_at = now();

insert into public.profiles (
  id,
  email,
  full_name,
  account_type,
  monthly_limit,
  subscription_status,
  subscription_plan,
  subscription_tier,
  tier
)
values (
  '11111111-1111-1111-1111-111111111111',
  'dev@aim.local',
  'Local Dev',
  'standalone',
  1000,
  'active',
  'pro',
  'pro',
  'full'
)
on conflict (id) do update
set
  email = excluded.email,
  full_name = excluded.full_name,
  account_type = excluded.account_type,
  monthly_limit = excluded.monthly_limit,
  subscription_status = excluded.subscription_status,
  subscription_plan = excluded.subscription_plan,
  subscription_tier = excluded.subscription_tier,
  tier = excluded.tier,
  updated_at = now();

insert into public.aim_prompts (
  id,
  content,
  title,
  description,
  topic,
  author_name
)
values (
  '33333333-3333-3333-3333-333333333333',
  'Create a concise marketing plan for a local service business. Include audience, offer, channels, and next actions.',
  'Local Marketing Plan',
  'A seeded local prompt for smoke testing the AiM Library.',
  'Marketing Strategy',
  'AiM Prompts'
)
on conflict (id) do update
set
  content = excluded.content,
  title = excluded.title,
  description = excluded.description,
  topic = excluded.topic,
  author_name = excluded.author_name,
  updated_at = now();

insert into public.threads (
  id,
  user_id,
  title,
  starred
)
values (
  '44444444-4444-4444-4444-444444444444',
  '11111111-1111-1111-1111-111111111111',
  'Local seed conversation',
  true
)
on conflict (id) do update
set
  title = excluded.title,
  starred = excluded.starred,
  updated_at = now();

insert into public.messages (
  id,
  thread_id,
  role,
  content,
  is_public,
  title,
  description,
  topic
)
values (
  '55555555-5555-5555-5555-555555555555',
  '44444444-4444-4444-4444-444444444444',
  'assistant',
  'This is a local seeded response for smoke testing prompt library and thread views.',
  true,
  'Local Seed Prompt',
  'Seeded content for local development.',
  'Local Dev'
)
on conflict (id) do update
set
  content = excluded.content,
  is_public = excluded.is_public,
  title = excluded.title,
  description = excluded.description,
  topic = excluded.topic;
