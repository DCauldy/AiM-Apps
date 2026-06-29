-- Tours listing-photo uploads for authoritative TourScene source media.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tours-listing-media',
  'tours-listing-media',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Path convention: {user_id}/{project_id}/{timestamp}-{safe_filename}
create policy "Users can read their own Tours listing media"
  on storage.objects for select
  using (
    bucket_id = 'tours-listing-media'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can upload their own Tours listing media"
  on storage.objects for insert
  with check (
    bucket_id = 'tours-listing-media'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can update their own Tours listing media"
  on storage.objects for update
  using (
    bucket_id = 'tours-listing-media'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete their own Tours listing media"
  on storage.objects for delete
  using (
    bucket_id = 'tours-listing-media'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
