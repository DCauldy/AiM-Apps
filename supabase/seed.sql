-- Local development seed data. Do not put production exports or secrets here.

insert into public.admin_settings (key, value, description)
values
  ('BLOG_ENGINE', 'true', 'Enable Blog Engine app'),
  ('RADAR', 'true', 'Enable Radar app'),
  ('HYPERLOCAL', 'true', 'Enable Hyperlocal market-report email campaigns app'),
  ('TOURS', 'true', 'Enable Tours listing project workspace app')
on conflict (key) do update
set
  value = excluded.value,
  description = excluded.description,
  updated_at = now();

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
  '{"provider": "email", "providers": ["email"], "subscription_tier": "pro"}'::jsonb,
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
  '99999999-9999-9999-9999-999999999999',
  'authenticated',
  'authenticated',
  'joshmk93@gmail.com',
  crypt('josh2026', gen_salt('bf')),
  now(),
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '{"provider": "email", "providers": ["email"], "subscription_tier": "pro"}'::jsonb,
  '{"full_name": "Josh QA"}'::jsonb,
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
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '99999999-9999-9999-9999-999999999999',
  '99999999-9999-9999-9999-999999999999',
  '{"sub": "99999999-9999-9999-9999-999999999999", "email": "joshmk93@gmail.com", "email_verified": true}'::jsonb,
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
  '99999999-9999-9999-9999-999999999999',
  'joshmk93@gmail.com',
  'Josh QA',
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

insert into public.app_subscriptions (
  user_id,
  app_id,
  status,
  plan_id
)
values
  (
    '99999999-9999-9999-9999-999999999999',
    'BLOG_ENGINE',
    'active',
    'pro'
  ),
  (
    '99999999-9999-9999-9999-999999999999',
    'RADAR',
    'active',
    'pro'
  ),
  (
    '99999999-9999-9999-9999-999999999999',
    'HYPERLOCAL',
    'active',
    'pro'
  ),
  (
    '99999999-9999-9999-9999-999999999999',
    'TOURS',
    'active',
    'pro'
  )
on conflict (user_id, app_id) do update
set
  status = excluded.status,
  plan_id = excluded.plan_id,
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

insert into public.tours_projects (
  id,
  user_id,
  name,
  property_address,
  listing_url,
  status,
  listing_media_acknowledged_at
)
values (
  '66666666-6666-6666-6666-666666666666',
  '99999999-9999-9999-9999-999999999999',
  'Local Seed Tour',
  '123 Local Seed Lane, Austin, TX 78701',
  'https://example.com/local-seed-listing',
  'open',
  now()
)
on conflict (id) do update
set
  user_id = excluded.user_id,
  name = excluded.name,
  property_address = excluded.property_address,
  listing_url = excluded.listing_url,
  status = excluded.status,
  listing_media_acknowledged_at = excluded.listing_media_acknowledged_at,
  archived_at = null,
  updated_at = now();

insert into public.tour_scenes (
  id,
  project_id,
  title,
  sort_order,
  included,
  camera_motion
)
values
  (
    '77777777-7777-7777-7777-777777777771',
    '66666666-6666-6666-6666-666666666666',
    'Front exterior',
    0,
    true,
    'slow_push'
  ),
  (
    '77777777-7777-7777-7777-777777777772',
    '66666666-6666-6666-6666-666666666666',
    'Kitchen',
    1,
    true,
    'slow_pan'
  ),
  (
    '77777777-7777-7777-7777-777777777773',
    '66666666-6666-6666-6666-666666666666',
    'Primary bedroom',
    2,
    false,
    'static_hold'
  )
on conflict (id) do update
set
  project_id = excluded.project_id,
  title = excluded.title,
  sort_order = excluded.sort_order,
  included = excluded.included,
  camera_motion = excluded.camera_motion,
  updated_at = now();

insert into public.tour_scene_source_photos (
  id,
  project_id,
  scene_id,
  storage_path,
  file_name,
  content_type,
  byte_size,
  width,
  height,
  priority
)
values
  (
    '88888888-8888-8888-8888-888888888881',
    '66666666-6666-6666-6666-666666666666',
    '77777777-7777-7777-7777-777777777771',
    '99999999-9999-9999-9999-999999999999/66666666-6666-6666-6666-666666666666/local-front-exterior.jpg',
    'local-front-exterior.jpg',
    'image/jpeg',
    1024,
    1600,
    900,
    0
  ),
  (
    '88888888-8888-8888-8888-888888888882',
    '66666666-6666-6666-6666-666666666666',
    '77777777-7777-7777-7777-777777777772',
    '99999999-9999-9999-9999-999999999999/66666666-6666-6666-6666-666666666666/local-kitchen.jpg',
    'local-kitchen.jpg',
    'image/jpeg',
    1024,
    1600,
    900,
    0
  ),
  (
    '88888888-8888-8888-8888-888888888883',
    '66666666-6666-6666-6666-666666666666',
    '77777777-7777-7777-7777-777777777772',
    '99999999-9999-9999-9999-999999999999/66666666-6666-6666-6666-666666666666/local-kitchen-detail.jpg',
    'local-kitchen-detail.jpg',
    'image/jpeg',
    1024,
    1600,
    900,
    1
  ),
  (
    '88888888-8888-8888-8888-888888888884',
    '66666666-6666-6666-6666-666666666666',
    '77777777-7777-7777-7777-777777777773',
    '99999999-9999-9999-9999-999999999999/66666666-6666-6666-6666-666666666666/local-primary-bedroom.jpg',
    'local-primary-bedroom.jpg',
    'image/jpeg',
    1024,
    1600,
    900,
    0
  )
on conflict (id) do update
set
  project_id = excluded.project_id,
  scene_id = excluded.scene_id,
  storage_path = excluded.storage_path,
  file_name = excluded.file_name,
  content_type = excluded.content_type,
  byte_size = excluded.byte_size,
  width = excluded.width,
  height = excluded.height,
  priority = excluded.priority;

insert into storage.objects (
  id,
  bucket_id,
  name,
  owner,
  owner_id,
  metadata,
  created_at,
  updated_at,
  last_accessed_at
)
values
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
    'tours-listing-media',
    '99999999-9999-9999-9999-999999999999/66666666-6666-6666-6666-666666666666/local-front-exterior.jpg',
    '99999999-9999-9999-9999-999999999999',
    '99999999-9999-9999-9999-999999999999',
    '{"size": 1024, "mimetype": "image/jpeg", "cacheControl": "max-age=3600"}'::jsonb,
    now(),
    now(),
    now()
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
    'tours-listing-media',
    '99999999-9999-9999-9999-999999999999/66666666-6666-6666-6666-666666666666/local-kitchen.jpg',
    '99999999-9999-9999-9999-999999999999',
    '99999999-9999-9999-9999-999999999999',
    '{"size": 1024, "mimetype": "image/jpeg", "cacheControl": "max-age=3600"}'::jsonb,
    now(),
    now(),
    now()
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3',
    'tours-listing-media',
    '99999999-9999-9999-9999-999999999999/66666666-6666-6666-6666-666666666666/local-kitchen-detail.jpg',
    '99999999-9999-9999-9999-999999999999',
    '99999999-9999-9999-9999-999999999999',
    '{"size": 1024, "mimetype": "image/jpeg", "cacheControl": "max-age=3600"}'::jsonb,
    now(),
    now(),
    now()
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4',
    'tours-listing-media',
    '99999999-9999-9999-9999-999999999999/66666666-6666-6666-6666-666666666666/local-primary-bedroom.jpg',
    '99999999-9999-9999-9999-999999999999',
    '99999999-9999-9999-9999-999999999999',
    '{"size": 1024, "mimetype": "image/jpeg", "cacheControl": "max-age=3600"}'::jsonb,
    now(),
    now(),
    now()
  )
on conflict (bucket_id, name) do update
set
  owner = excluded.owner,
  owner_id = excluded.owner_id,
  metadata = excluded.metadata,
  updated_at = now(),
  last_accessed_at = now();
