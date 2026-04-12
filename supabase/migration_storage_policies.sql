-- Run in Supabase SQL Editor: Dashboard -> SQL Editor -> New query
-- Adds storage policies for the public listing-images bucket.

DROP POLICY IF EXISTS "Listing images are publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own listing images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own listing images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own listing images" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own avatars" ON storage.objects;

CREATE POLICY "Listing images are publicly readable" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'listing-images');

CREATE POLICY "Users can upload own listing images" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'listing-images'
    AND name LIKE auth.uid()::text || '/%'
  );

CREATE POLICY "Users can update own listing images" ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'listing-images'
    AND name LIKE auth.uid()::text || '/%'
  )
  WITH CHECK (
    bucket_id = 'listing-images'
    AND name LIKE auth.uid()::text || '/%'
  );

CREATE POLICY "Users can delete own listing images" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'listing-images'
    AND name LIKE auth.uid()::text || '/%'
  );

CREATE POLICY "Users can upload own avatars" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'listing-images'
    AND name LIKE 'avatars/' || auth.uid()::text || '.%'
  );

CREATE POLICY "Users can update own avatars" ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'listing-images'
    AND name LIKE 'avatars/' || auth.uid()::text || '.%'
  )
  WITH CHECK (
    bucket_id = 'listing-images'
    AND name LIKE 'avatars/' || auth.uid()::text || '.%'
  );

CREATE POLICY "Users can delete own avatars" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'listing-images'
    AND name LIKE 'avatars/' || auth.uid()::text || '.%'
  );
