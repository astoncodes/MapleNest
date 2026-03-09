-- MapleNest PEI filtering seed data (Supabase SQL editor)
-- Prereqs:
-- 1) schema.sql applied
-- 2) landlord profiles exist for the email addresses below
-- 3) optional: clear old seed rows by title before rerun

BEGIN;

INSERT INTO public.listings (
  landlord_id,
  title,
  description,
  property_type,
  city,
  neighbourhood,
  address,
  price,
  utilities_included,
  bedrooms,
  bathrooms,
  square_feet,
  available_from,
  lease_term,
  pet_friendly,
  parking_available,
  laundry,
  furnished,
  status,
  source,
  created_at
)
SELECT
  p.id AS landlord_id,
  d.title,
  d.description,
  d.property_type,
  d.city,
  d.neighbourhood,
  d.address,
  d.price,
  d.utilities_included,
  d.bedrooms,
  d.bathrooms,
  d.square_feet,
  d.available_from::date,
  d.lease_term,
  d.pet_friendly,
  d.parking_available,
  d.laundry,
  d.furnished,
  'active',
  'user_import',
  now()
FROM (
  VALUES
    ('landlord_1', 'Warm room near UPEI', 'Second-floor room in shared home, close to bus route and grocery store.', 'room', 'Charlottetown', 'Downtown', '123 University Ave', 600, true, 1, 1, 280, NULL, 'monthly', true, false, 'shared', false),
    ('landlord_1', '2BR apartment near St. Dunstan\'s', 'Quiet walkable unit, new appliances and updated kitchen.', 'apartment', 'Charlottetown', 'East Royalty', '25 University Ave', 1350, false, 2, 1.5, 950, NULL, '6_months', false, true, 'in_unit', true),
    ('landlord_2', 'Basement suite in Cornwall', 'Private entrance, full bathroom and washer/dryer.', 'basement', 'Cornwall', 'Cornwall', '88 Main St', 800, true, 1, 1, 650, NULL, '1_year', true, false, 'none', true),
    ('landlord_2', 'House in Summerside', 'Entire ground-floor unit with parking, fenced yard, and parking spot.', 'house', 'Summerside', 'Wilmot', '45 Lakeshore Dr', 1600, false, 3, 2, 1250, NULL, 'flexible', false, true, 'none', true),
    ('landlord_1', 'Townhouse in Stratford', 'Bright open-concept townhouse with in-unit laundry.', 'townhouse', 'Stratford', 'Stratford', '77 Main Street', 1450, true, 2, 2, 1100, NULL, '1_year', true, true, 'in_unit', false),
    ('landlord_2', 'Cozy condo near shopping', 'Modern one-bedroom condo near PEI stadium with balcony.', 'condo', 'Charlottetown', 'Belvedere', '11 Hillside Rd', 1180, false, 1, 1, 760, NULL, 'monthly', false, true, 'none', false),
    ('landlord_1', 'Student room near Holland', 'Perfect for students, utilities included, shared kitchen and living room.', 'room', 'Charlottetown', 'University Avenue', '402 Holland Lane', 575, true, 1, 1, 220, NULL, 'monthly', true, true, 'shared', false),
    ('landlord_2', 'Quiet 1BR in Rural PEI', 'Private one-bedroom with separate parking and flexible lease.', 'apartment', 'Other', 'Other', 'Rural Route 10', 950, false, 1, 1, 560, NULL, 'flexible', true, false, 'none', false)
) AS d(landlord_key, title, description, property_type, city, neighbourhood, address, price, utilities_included, bedrooms, bathrooms, square_feet, available_from, lease_term, pet_friendly, parking_available, laundry, furnished)
JOIN public.profiles p
  ON p.email = CASE d.landlord_key
      WHEN 'landlord_1' THEN 'landlord1@maplenest.test'
      WHEN 'landlord_2' THEN 'landlord2@maplenest.test'
    END
  AND p.role = 'landlord'
LEFT JOIN public.listings l
  ON l.landlord_id = p.id
 AND l.title = d.title
 AND l.city = d.city
 AND l.address = d.address
WHERE l.id IS NULL;

-- Optional image seed for QA visibility in cards
INSERT INTO public.listing_images (listing_id, url, is_primary, sort_order)
SELECT l.id, 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267', true, 0
FROM public.listings l
WHERE l.source = 'user_import'
AND NOT EXISTS (
  SELECT 1 FROM public.listing_images i WHERE i.listing_id = l.id
);

-- Optional CSV path (run once in psql if needed):
-- 1) Create a staging table and use:
-- \copy public.listing_import_csv FROM '/absolute/path/to/listings.csv' WITH (FORMAT csv, HEADER true)
-- 2) INSERT INTO ... SELECT ... FROM public.listing_import_csv;
-- Then drop staging table when complete.
COMMIT;
