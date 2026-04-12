-- Run in Supabase SQL Editor: Dashboard -> SQL Editor -> New query
-- Adds missing RLS policies for profile reviews and prevents duplicate
-- profile-only reviews where listing_id is null.

DROP POLICY IF EXISTS "Reviews are publicly viewable" ON public.reviews;
DROP POLICY IF EXISTS "Authenticated users can create reviews" ON public.reviews;

CREATE POLICY "Reviews are publicly viewable" ON public.reviews
  FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can create reviews" ON public.reviews
  FOR INSERT
  WITH CHECK (
    auth.uid() = reviewer_id
    AND reviewer_id <> reviewee_id
  );

CREATE UNIQUE INDEX IF NOT EXISTS reviews_profile_unique_idx
  ON public.reviews(reviewer_id, reviewee_id)
  WHERE listing_id IS NULL;
