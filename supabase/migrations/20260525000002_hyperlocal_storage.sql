-- Create hyperlocal-uploads storage bucket for MLS files and CSV imports
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'hyperlocal-uploads',
  'hyperlocal-uploads',
  false,
  52428800,  -- 50MB
  ARRAY[
    'text/csv',
    'application/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/json',
    'text/plain'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Path convention: {user_id}/{run_id}/{filename} or {user_id}/csv/{timestamp}.csv
CREATE POLICY "Users can read their own hyperlocal uploads"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'hyperlocal-uploads'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can upload their own hyperlocal files"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'hyperlocal-uploads'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can update their own hyperlocal files"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'hyperlocal-uploads'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete their own hyperlocal files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'hyperlocal-uploads'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
