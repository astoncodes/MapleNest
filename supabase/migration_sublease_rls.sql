-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New query
-- Adds RLS policies to allow renters to post and edit sublease listings.
-- Without these, renters who submit the create-listing form receive an RLS error
-- and the listing is never saved, even though the UI permits it.

-- Allow renters to create sublease listings
DROP POLICY IF EXISTS "Renters can post subleases" ON public.listings;
CREATE POLICY "Renters can post subleases" ON public.listings
  FOR INSERT WITH CHECK (
    auth.uid() = landlord_id
    AND property_type = 'sublease'
    AND NOT public.is_landlord(auth.uid())
  );

-- Allow renters to update their own sublease listings
DROP POLICY IF EXISTS "Renters can update own subleases" ON public.listings;
CREATE POLICY "Renters can update own subleases" ON public.listings
  FOR UPDATE USING (
    auth.uid() = landlord_id
    AND property_type = 'sublease'
    AND NOT public.is_landlord(auth.uid())
  )
  WITH CHECK (
    auth.uid() = landlord_id
    AND property_type = 'sublease'
    AND NOT public.is_landlord(auth.uid())
  );

-- Allow renters to manage images for their own sublease listings
DROP POLICY IF EXISTS "Renters can manage own sublease images" ON public.listing_images;
CREATE POLICY "Renters can manage own sublease images" ON public.listing_images
  FOR ALL USING (
    EXISTS (
      SELECT 1
      FROM public.listings l
      WHERE l.id = listing_id
        AND l.landlord_id = auth.uid()
        AND l.property_type = 'sublease'
        AND NOT public.is_landlord(auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.listings l
      WHERE l.id = listing_id
        AND l.landlord_id = auth.uid()
        AND l.property_type = 'sublease'
        AND NOT public.is_landlord(auth.uid())
    )
  );
