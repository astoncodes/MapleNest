-- listing_units table
CREATE TABLE IF NOT EXISTS public.listing_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  unit_name text NOT NULL CHECK (char_length(unit_name) <= 60),
  floor int,
  price int,
  available_from date,
  notes text CHECK (char_length(notes) <= 300),
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'rented')),
  room_rental boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- listing_unit_rooms table
CREATE TABLE IF NOT EXISTS public.listing_unit_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES public.listing_units(id) ON DELETE CASCADE,
  room_name text NOT NULL CHECK (char_length(room_name) <= 60),
  price int,
  available_from date,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'occupied')),
  sort_order int NOT NULL DEFAULT 0
);

-- Add unit/room context to conversations
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES public.listing_units(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS room_id uuid REFERENCES public.listing_unit_rooms(id) ON DELETE SET NULL;

-- RLS: listing_units
ALTER TABLE public.listing_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "listing_units_public_read" ON public.listing_units
  FOR SELECT USING (true);

CREATE POLICY "listing_units_landlord_write" ON public.listing_units
  FOR ALL
  USING (
    auth.uid() = (SELECT landlord_id FROM public.listings WHERE id = listing_id)
  )
  WITH CHECK (
    auth.uid() = (SELECT landlord_id FROM public.listings WHERE id = listing_id)
  );

-- RLS: listing_unit_rooms
ALTER TABLE public.listing_unit_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "listing_unit_rooms_public_read" ON public.listing_unit_rooms
  FOR SELECT USING (true);

CREATE POLICY "listing_unit_rooms_landlord_write" ON public.listing_unit_rooms
  FOR ALL
  USING (
    auth.uid() = (
      SELECT l.landlord_id FROM public.listings l
      JOIN public.listing_units lu ON lu.listing_id = l.id
      WHERE lu.id = unit_id
    )
  )
  WITH CHECK (
    auth.uid() = (
      SELECT l.landlord_id FROM public.listings l
      JOIN public.listing_units lu ON lu.listing_id = l.id
      WHERE lu.id = unit_id
    )
  );
