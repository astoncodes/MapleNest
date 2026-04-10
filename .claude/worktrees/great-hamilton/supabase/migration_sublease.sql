-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- Adds 'sublease' as a valid property_type for listings

ALTER TABLE public.listings
  DROP CONSTRAINT IF EXISTS listings_property_type_check;

ALTER TABLE public.listings
  ADD CONSTRAINT listings_property_type_check
  CHECK (property_type IN ('apartment', 'house', 'room', 'basement', 'condo', 'townhouse', 'sublease'));
