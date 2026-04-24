-- Run in Supabase SQL Editor: Dashboard -> SQL Editor -> New query
-- Creates the `avatars` bucket and its owner-write / public-read policies.
--
-- Any pre-existing avatars stored under the flat `avatars/{uid}.{ext}` prefix
-- inside the `listing-images` bucket remain accessible via their existing
-- public URLs (that bucket stays publicly readable). The next avatar upload
-- for a user writes to the new bucket and the client removes the new-bucket
-- object on re-upload; legacy objects in `listing-images` can be cleaned up
-- out-of-band at any time.

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public;

-- Retire the flat-path avatar policies on `listing-images`; avatar writes
-- now target the dedicated `avatars` bucket. The listing-image-specific
-- policies in migration_storage_policies.sql remain untouched.
DROP POLICY IF EXISTS "Users can upload own avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own avatars" ON storage.objects;

-- New bucket policies: path convention is `{user_id}/{filename}` so we
-- enforce ownership by matching the first path segment against auth.uid().
DROP POLICY IF EXISTS "Avatars are publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own avatar" ON storage.objects;

CREATE POLICY "Avatars are publicly readable" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload own avatar" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND name LIKE auth.uid()::text || '/%'
  );

CREATE POLICY "Users can update own avatar" ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND name LIKE auth.uid()::text || '/%'
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND name LIKE auth.uid()::text || '/%'
  );

CREATE POLICY "Users can delete own avatar" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND name LIKE auth.uid()::text || '/%'
  );
