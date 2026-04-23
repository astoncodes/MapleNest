-- Run in Supabase SQL Editor: Dashboard -> SQL Editor -> New query
-- B23: Tighten reviews INSERT policy.
--
-- Previous policy only checked reviewer_id = auth.uid() and reviewer != reviewee.
-- That meant any authenticated user could write a review for any other user,
-- with no requirement that they had ever transacted. We now require:
--   * tenancy_id is provided (no anonymous profile-only reviews from random users)
--   * the tenancy exists, has been opened for review (review_window_closes_at set)
--     and the window has not closed yet
--   * the reviewer is one party of the tenancy (renter or landlord)
--   * the reviewee is the OTHER party of that same tenancy
--   * reviewer != reviewee (kept)
--
-- Profile-only reviews (tenancy_id IS NULL) are no longer accepted via this
-- policy. The existing reviews_profile_unique_idx for null-tenancy reviews
-- is left in place so any grandfathered rows remain intact, but new inserts
-- of that shape will be rejected.

DROP POLICY IF EXISTS "Authenticated users can create reviews" ON public.reviews;

CREATE POLICY "Authenticated users can create reviews" ON public.reviews
  FOR INSERT
  WITH CHECK (
    auth.uid() = reviewer_id
    AND reviewer_id <> reviewee_id
    AND tenancy_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.tenancies t
      WHERE t.id = tenancy_id
        AND t.review_window_closes_at IS NOT NULL
        AND t.review_window_closes_at > now()
        AND (
          (t.renter_id   = auth.uid() AND t.landlord_id = reviewee_id) OR
          (t.landlord_id = auth.uid() AND t.renter_id   = reviewee_id)
        )
    )
  );
