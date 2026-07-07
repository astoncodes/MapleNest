-- Run in Supabase SQL Editor: Dashboard -> SQL Editor -> New query
-- B?: Allow landlords (and renter-subleasers) to read their own non-active listings.
--
-- The previous "Listings are publicly viewable" policy used
--   USING (status = 'active')
-- with no exemption for the row's own owner. That meant the moment a landlord
-- flipped a listing to 'rented', 'draft', or 'removed', their own SELECT
-- (and therefore EditListingPage's "fetch by id" + the post-UPDATE RETURNING
-- read) failed with "not found", even though the row still existed and
-- they still had INSERT/UPDATE/DELETE rights via the other policies.
--
-- Why this is safe:
--   * Public visitors still only see status = 'active' rows (first branch
--     unchanged) — no change to the public surface.
--   * The new `OR auth.uid() = landlord_id` branch only widens reads for
--     the row's own owner, which is who the UPDATE/DELETE policies
--     already trust.
--   * Idempotent: DROP POLICY IF EXISTS + CREATE POLICY can be re-run.
--
-- Audit query (run manually after deploy to confirm the policy is in place):
--   SELECT polname, qual FROM pg_policy WHERE polrelid = 'public.listings'::regclass AND polname = 'Listings are publicly viewable';

DROP POLICY IF EXISTS "Listings are publicly viewable" ON public.listings;
CREATE POLICY "Listings are publicly viewable" ON public.listings
  FOR SELECT USING (
    status = 'active'
    OR auth.uid() = landlord_id
  );
