-- =============================================
-- MapleNest Database Schema
-- Safe to run on an existing Supabase project (idempotent)
-- =============================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================
-- TABLES
-- =============================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'renter' CHECK (role IN ('renter', 'landlord', 'admin')),
  phone TEXT,
  avatar_url TEXT,
  bio TEXT,
  -- Verification
  email_verified BOOLEAN DEFAULT FALSE,
  phone_verified BOOLEAN DEFAULT FALSE,
  id_verified BOOLEAN DEFAULT FALSE,
  -- Trust
  trust_score INTEGER DEFAULT 0,
  total_reviews INTEGER DEFAULT 0,
  avg_rating NUMERIC(2,1) DEFAULT 0,
  -- Meta
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.listings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  landlord_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  property_type TEXT NOT NULL CHECK (property_type IN ('apartment', 'house', 'room', 'basement', 'condo', 'townhouse', 'sublease')),
  address TEXT,
  city TEXT NOT NULL DEFAULT 'Charlottetown',
  neighbourhood TEXT,
  postal_code TEXT,
  latitude NUMERIC(10, 7),
  longitude NUMERIC(10, 7),
  price INTEGER NOT NULL,
  utilities_included BOOLEAN DEFAULT FALSE,
  bedrooms INTEGER NOT NULL DEFAULT 1,
  bathrooms NUMERIC(2,1) NOT NULL DEFAULT 1,
  square_feet INTEGER,
  available_from DATE,
  lease_term TEXT,
  pet_friendly BOOLEAN DEFAULT FALSE,
  parking_available BOOLEAN DEFAULT FALSE,
  laundry TEXT,
  furnished BOOLEAN DEFAULT FALSE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'rented', 'draft', 'removed')),
  source TEXT DEFAULT 'maplenest',
  source_url TEXT,
  views INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.listing_images (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_id UUID REFERENCES public.listings(id) ON DELETE CASCADE NOT NULL,
  url TEXT NOT NULL,
  storage_path TEXT,
  is_primary BOOLEAN DEFAULT FALSE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.saved_listings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  listing_id UUID REFERENCES public.listings(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, listing_id)
);

CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_id UUID REFERENCES public.listings(id) ON DELETE SET NULL,
  renter_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  landlord_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  last_message TEXT,
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  renter_unread INTEGER DEFAULT 0,
  landlord_unread INTEGER DEFAULT 0,
  unit_id uuid REFERENCES public.listing_units(id) ON DELETE SET NULL,
  room_id uuid REFERENCES public.listing_unit_rooms(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(listing_id, renter_id)
);

CREATE TABLE IF NOT EXISTS public.messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE NOT NULL,
  sender_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reviewer_id UUID REFERENCES public.profiles(id) NOT NULL,
  reviewee_id UUID REFERENCES public.profiles(id) NOT NULL,
  listing_id UUID REFERENCES public.listings(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(reviewer_id, reviewee_id, listing_id)
);

CREATE TABLE IF NOT EXISTS public.reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_id UUID REFERENCES public.profiles(id) NOT NULL,
  listing_id UUID REFERENCES public.listings(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.listings FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN (
    SELECT pol.policyname, pol.tablename, pol.schemaname
    FROM pg_policies pol
    WHERE pol.schemaname = 'public'
      AND pol.tablename IN (
        'profiles',
        'listings',
        'listing_images',
        'saved_listings',
        'conversations',
        'messages',
        'reviews',
        'reports'
      )
  ) LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      pol.policyname,
      pol.schemaname,
      pol.tablename
    );
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.is_landlord(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = _user_id
      AND LOWER(p.role) = 'landlord'
  );
$$;

DROP POLICY IF EXISTS "Profiles are publicly viewable" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Profiles are publicly viewable" ON public.profiles
  FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Listings are publicly viewable" ON public.listings;
DROP POLICY IF EXISTS "Landlords can create listings" ON public.listings;
DROP POLICY IF EXISTS "Renters can post subleases" ON public.listings;
DROP POLICY IF EXISTS "Landlords can update own listings" ON public.listings;
DROP POLICY IF EXISTS "Renters can update own subleases" ON public.listings;
DROP POLICY IF EXISTS "Landlords can delete own listings" ON public.listings;
CREATE POLICY "Listings are publicly viewable" ON public.listings
  FOR SELECT USING (status = 'active');
CREATE POLICY "Landlords can create listings" ON public.listings
  FOR INSERT WITH CHECK (
    auth.uid() = landlord_id
    AND public.is_landlord(auth.uid())
  );
CREATE POLICY "Renters can post subleases" ON public.listings
  FOR INSERT WITH CHECK (
    auth.uid() = landlord_id
    AND property_type = 'sublease'
    AND NOT public.is_landlord(auth.uid())
  );
CREATE POLICY "Landlords can update own listings" ON public.listings
  FOR UPDATE USING (
    auth.uid() = landlord_id
    AND public.is_landlord(auth.uid())
  )
  WITH CHECK (
    auth.uid() = landlord_id
    AND public.is_landlord(auth.uid())
  );
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
CREATE POLICY "Landlords can delete own listings" ON public.listings
  FOR DELETE USING (
    auth.uid() = landlord_id
    AND public.is_landlord(auth.uid())
  );

DROP POLICY IF EXISTS "Images are publicly viewable" ON public.listing_images;
DROP POLICY IF EXISTS "Landlords can manage own listing images" ON public.listing_images;
DROP POLICY IF EXISTS "Renters can manage own sublease images" ON public.listing_images;
CREATE POLICY "Images are publicly viewable" ON public.listing_images
  FOR SELECT USING (true);
CREATE POLICY "Landlords can manage own listing images" ON public.listing_images
  FOR ALL USING (
    EXISTS (
      SELECT 1
      FROM public.listings l
      WHERE l.id = listing_id
        AND l.landlord_id = auth.uid()
        AND public.is_landlord(auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.listings l
      WHERE l.id = listing_id
        AND l.landlord_id = auth.uid()
        AND public.is_landlord(auth.uid())
    )
  );
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

DROP POLICY IF EXISTS "Users can view their own saved listings" ON public.saved_listings;
DROP POLICY IF EXISTS "Users can save listings" ON public.saved_listings;
DROP POLICY IF EXISTS "Users can unsave listings" ON public.saved_listings;
CREATE POLICY "Users can view their own saved listings" ON public.saved_listings
  FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users can save listings" ON public.saved_listings
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unsave listings" ON public.saved_listings
  FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Conversation participants can view" ON public.conversations;
DROP POLICY IF EXISTS "Renters can create conversations" ON public.conversations;
DROP POLICY IF EXISTS "Participants can update conversation" ON public.conversations;
CREATE POLICY "Conversation participants can view" ON public.conversations
  FOR SELECT
  USING (auth.uid() = renter_id OR auth.uid() = landlord_id);
CREATE POLICY "Renters can create conversations" ON public.conversations
  FOR INSERT
  WITH CHECK (auth.uid() = renter_id);
CREATE POLICY "Participants can update conversation" ON public.conversations
  FOR UPDATE
  USING (auth.uid() = renter_id OR auth.uid() = landlord_id)
  WITH CHECK (auth.uid() = renter_id OR auth.uid() = landlord_id);

DROP POLICY IF EXISTS "Participants can view messages" ON public.messages;
DROP POLICY IF EXISTS "Participants can send messages" ON public.messages;
DROP POLICY IF EXISTS "Participants can mark messages read" ON public.messages;
CREATE POLICY "Participants can view messages" ON public.messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND (c.renter_id = auth.uid() OR c.landlord_id = auth.uid())
    )
  );
CREATE POLICY "Participants can send messages" ON public.messages
  FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND (c.renter_id = auth.uid() OR c.landlord_id = auth.uid())
    )
  );
CREATE POLICY "Participants can mark messages read" ON public.messages
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND (c.renter_id = auth.uid() OR c.landlord_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND (c.renter_id = auth.uid() OR c.landlord_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Reviews are publicly viewable" ON public.reviews;
DROP POLICY IF EXISTS "Reviewers can see own reviews" ON public.reviews;
DROP POLICY IF EXISTS "Authenticated users can create reviews" ON public.reviews;
CREATE POLICY "Reviews are publicly viewable" ON public.reviews
  FOR SELECT
  USING (visible = true);
CREATE POLICY "Reviewers can see own reviews" ON public.reviews
  FOR SELECT
  USING (auth.uid() = reviewer_id);
CREATE POLICY "Authenticated users can create reviews" ON public.reviews
  FOR INSERT
  WITH CHECK (
    auth.uid() = reviewer_id
    AND reviewer_id <> reviewee_id
  );

DROP POLICY IF EXISTS "Authenticated users can submit reports" ON public.reports;
CREATE POLICY "Authenticated users can submit reports" ON public.reports
  FOR INSERT
  WITH CHECK (auth.uid() = reporter_id);

-- =============================================
-- TRIGGERS
-- =============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role, full_name)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data ->> 'role', 'renter'),
    new.raw_user_meta_data ->> 'full_name'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS listings_updated_at ON public.listings;
CREATE TRIGGER listings_updated_at
  BEFORE UPDATE ON public.listings
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- =============================================
-- FUNCTIONS
-- =============================================

-- Atomically increment view count — bypasses RLS so all viewers (including anon) can increment.
-- Use SECURITY DEFINER with pinned search_path to prevent search-path injection.
CREATE OR REPLACE FUNCTION public.increment_views(p_listing_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.listings SET views = views + 1 WHERE id = p_listing_id;
$$;

GRANT EXECUTE ON FUNCTION public.increment_views(uuid) TO authenticated, anon;

-- =============================================
-- STORAGE POLICIES
-- =============================================

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

-- =============================================
-- INDEXES
-- =============================================

CREATE INDEX IF NOT EXISTS idx_listings_status_created_at
  ON public.listings (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_listings_landlord_id
  ON public.listings (landlord_id);
CREATE INDEX IF NOT EXISTS idx_listings_city_status
  ON public.listings (city, status);
CREATE INDEX IF NOT EXISTS saved_listings_user_id_idx
  ON public.saved_listings(user_id);
CREATE INDEX IF NOT EXISTS saved_listings_listing_id_idx
  ON public.saved_listings(listing_id);
CREATE UNIQUE INDEX IF NOT EXISTS reviews_profile_unique_idx
  ON public.reviews(reviewer_id, reviewee_id)
  WHERE listing_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_listing_units_listing_id
  ON public.listing_units (listing_id);
CREATE INDEX IF NOT EXISTS idx_listing_units_listing_id_sort_order
  ON public.listing_units (listing_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_listing_unit_rooms_unit_id
  ON public.listing_unit_rooms (unit_id);

-- ── listing_units ─────────────────────────────────────────────────────────────
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

ALTER TABLE public.listing_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "listing_units_public_read" ON public.listing_units FOR SELECT USING (true);
CREATE POLICY "listing_units_landlord_write" ON public.listing_units FOR ALL
  USING (auth.uid() = (SELECT landlord_id FROM public.listings WHERE id = listing_id))
  WITH CHECK (auth.uid() = (SELECT landlord_id FROM public.listings WHERE id = listing_id));

-- ── listing_unit_rooms ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.listing_unit_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES public.listing_units(id) ON DELETE CASCADE,
  room_name text NOT NULL CHECK (char_length(room_name) <= 60),
  price int,
  available_from date,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'occupied')),
  sort_order int NOT NULL DEFAULT 0
);

ALTER TABLE public.listing_unit_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "listing_unit_rooms_public_read" ON public.listing_unit_rooms FOR SELECT USING (true);
CREATE POLICY "listing_unit_rooms_landlord_write" ON public.listing_unit_rooms FOR ALL
  USING (auth.uid() = (SELECT l.landlord_id FROM public.listings l JOIN public.listing_units lu ON lu.listing_id = l.id WHERE lu.id = unit_id))
  WITH CHECK (auth.uid() = (SELECT l.landlord_id FROM public.listings l JOIN public.listing_units lu ON lu.listing_id = l.id WHERE lu.id = unit_id));

-- ── tenancies ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tenancies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.listing_units(id) ON DELETE CASCADE,
  room_id uuid REFERENCES public.listing_unit_rooms(id) ON DELETE SET NULL,
  renter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  landlord_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  move_in date NOT NULL,
  move_out date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  review_window_closes_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tenancies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenancies_landlord_read" ON public.tenancies
  FOR SELECT USING (auth.uid() = landlord_id);
CREATE POLICY "tenancies_renter_read" ON public.tenancies
  FOR SELECT USING (auth.uid() = renter_id);
CREATE POLICY "tenancies_landlord_insert" ON public.tenancies
  FOR INSERT WITH CHECK (auth.uid() = landlord_id);
CREATE POLICY "tenancies_landlord_update" ON public.tenancies
  FOR UPDATE
  USING (auth.uid() = landlord_id)
  WITH CHECK (auth.uid() = landlord_id);

-- ── reviews alterations (tenancy system) ─────────────────────────────────────
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS tenancy_id uuid REFERENCES public.tenancies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS visible boolean NOT NULL DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS reviews_tenancy_reviewer_idx
  ON public.reviews (tenancy_id, reviewer_id)
  WHERE tenancy_id IS NOT NULL;

-- ── tenancy functions ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reveal_reviews(p_tenancy_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_review_count int;
  v_window_closed boolean;
  v_tenancy record;
  v_reviewee_ids uuid[];
BEGIN
  SELECT * INTO v_tenancy FROM tenancies WHERE id = p_tenancy_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_tenancy.renter_id != auth.uid() AND v_tenancy.landlord_id != auth.uid() THEN RETURN; END IF;

  SELECT count(*) INTO v_review_count
  FROM reviews WHERE tenancy_id = p_tenancy_id;

  v_window_closed := v_tenancy.review_window_closes_at IS NOT NULL
    AND v_tenancy.review_window_closes_at < now();

  IF v_review_count >= 2 OR (v_window_closed AND v_review_count > 0) THEN
    SELECT array_agg(DISTINCT reviewee_id) INTO v_reviewee_ids
    FROM reviews WHERE tenancy_id = p_tenancy_id AND visible = false;

    UPDATE reviews SET visible = true
    WHERE tenancy_id = p_tenancy_id AND visible = false;

    IF v_reviewee_ids IS NOT NULL THEN
      UPDATE profiles SET
        total_reviews = (SELECT count(*) FROM reviews WHERE reviewee_id = profiles.id AND visible = true),
        avg_rating = (SELECT coalesce(round(avg(rating)::numeric, 1), 0) FROM reviews WHERE reviewee_id = profiles.id AND visible = true)
      WHERE id = ANY(v_reviewee_ids);
    END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reveal_reviews(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.expire_pending_reviews(p_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenancy_id uuid;
BEGIN
  FOR v_tenancy_id IN
    SELECT DISTINCT r.tenancy_id
    FROM reviews r
    JOIN tenancies t ON t.id = r.tenancy_id
    WHERE r.reviewee_id = p_profile_id
      AND r.visible = false
      AND t.review_window_closes_at < now()
  LOOP
    PERFORM reveal_reviews(v_tenancy_id);
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.expire_pending_reviews(uuid) TO authenticated;

-- ── tenancy delete trigger ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_tenancy_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'active' THEN
    IF OLD.room_id IS NOT NULL THEN
      UPDATE listing_unit_rooms SET status = 'available' WHERE id = OLD.room_id;
    ELSE
      UPDATE listing_units SET status = 'available' WHERE id = OLD.unit_id;
    END IF;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS tenancy_before_delete ON public.tenancies;
CREATE TRIGGER tenancy_before_delete
  BEFORE DELETE ON public.tenancies
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_tenancy_delete();

-- ── tenancy indexes ──────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS tenancies_active_unit_idx
  ON public.tenancies (unit_id)
  WHERE status = 'active' AND room_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tenancies_active_room_idx
  ON public.tenancies (room_id)
  WHERE status = 'active' AND room_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tenancies_listing_id ON public.tenancies (listing_id);
CREATE INDEX IF NOT EXISTS idx_tenancies_unit_id_active ON public.tenancies (unit_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_tenancies_renter_id ON public.tenancies (renter_id);
CREATE INDEX IF NOT EXISTS idx_tenancies_landlord_id ON public.tenancies (landlord_id);
CREATE INDEX IF NOT EXISTS idx_tenancies_conversation_id ON public.tenancies (conversation_id);
