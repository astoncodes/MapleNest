-- =============================================
-- MapleNest Database Schema
-- Safe to run on an existing Supabase project (idempotent)
-- Ordering invariant: any table referenced by a FK must be declared above its first user.
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

-- ── listing_units ─────────────────────────────────────────────────────────────
-- NOTE: Declared here (before conversations) because conversations.unit_id FKs to it.
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

-- ── listing_unit_rooms ────────────────────────────────────────────────────────
-- NOTE: Declared here (before conversations) because conversations.room_id FKs to it.
CREATE TABLE IF NOT EXISTS public.listing_unit_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES public.listing_units(id) ON DELETE CASCADE,
  room_name text NOT NULL CHECK (char_length(room_name) <= 60),
  price int,
  available_from date,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'occupied')),
  sort_order int NOT NULL DEFAULT 0
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
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- One conversation per (listing, renter, unit, room) — a renter interested in
-- two units of the same listing gets two separate threads (B2). The COALESCE
-- sentinel makes NULL unit/room compare equal so (A,B,NULL,NULL) can't repeat.
ALTER TABLE public.conversations
  DROP CONSTRAINT IF EXISTS conversations_listing_id_renter_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS conversations_listing_renter_unit_room_uidx
  ON public.conversations (
    listing_id,
    renter_id,
    COALESCE(unit_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(room_id, '00000000-0000-0000-0000-000000000000'::uuid)
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
  FOR SELECT USING (
    status = 'active'
    OR auth.uid() = landlord_id
  );
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

-- NOTE: reviews RLS policies are declared further down, after the tenancy
-- section's ALTER TABLE adds the visible / tenancy_id columns they reference.

DROP POLICY IF EXISTS "Authenticated users can submit reports" ON public.reports;
CREATE POLICY "Authenticated users can submit reports" ON public.reports
  FOR INSERT
  WITH CHECK (auth.uid() = reporter_id);

-- =============================================
-- TRIGGERS
-- =============================================

-- Whitelist the signup role: raw_user_meta_data is client-controlled, so
-- anything except 'renter'/'landlord' (e.g. 'admin') falls back to 'renter'.
-- Admins are promoted manually via SQL only.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requested_role text;
  v_safe_role      text;
BEGIN
  v_requested_role := lower(trim(COALESCE(new.raw_user_meta_data ->> 'role', '')));

  IF v_requested_role IN ('renter', 'landlord') THEN
    v_safe_role := v_requested_role;
  ELSE
    v_safe_role := 'renter';
  END IF;

  INSERT INTO public.profiles (id, email, role, full_name)
  VALUES (
    new.id,
    new.email,
    v_safe_role,
    new.raw_user_meta_data ->> 'full_name'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$$;

-- Only admins may change profiles.role; everyone else's role updates are
-- silently reverted (pairs with the "Users can update own profile" policy).
CREATE OR REPLACE FUNCTION public.lock_profile_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    SELECT role INTO v_caller_role
    FROM public.profiles
    WHERE id = auth.uid();

    IF v_caller_role IS DISTINCT FROM 'admin' THEN
      NEW.role := OLD.role;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_role_lock ON public.profiles;
CREATE TRIGGER profiles_role_lock
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.lock_profile_role();

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
-- STORAGE BUCKETS & POLICIES
-- =============================================

-- Create both buckets idempotently so a fresh project needs no manual
-- dashboard step. Both are public-read; writes are policy-scoped below.
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('listing-images', 'listing-images', true),
  ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

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

-- Avatars live in their own bucket under {user_id}/{filename} (B12).
-- The old flat-path avatar policies on listing-images are retired.
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
-- Inbox + navbar unread queries filter conversations by participant (B38)
CREATE INDEX IF NOT EXISTS idx_conversations_renter_id
  ON public.conversations (renter_id);
CREATE INDEX IF NOT EXISTS idx_conversations_landlord_id
  ON public.conversations (landlord_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at
  ON public.conversations (last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id_created_at
  ON public.messages (conversation_id, created_at);

-- ── listing_units RLS ─────────────────────────────────────────────────────────
-- (Table itself is declared earlier, before public.conversations, so FKs resolve.)
ALTER TABLE public.listing_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "listing_units_public_read" ON public.listing_units FOR SELECT USING (true);
CREATE POLICY "listing_units_landlord_write" ON public.listing_units FOR ALL
  USING (auth.uid() = (SELECT landlord_id FROM public.listings WHERE id = listing_id))
  WITH CHECK (auth.uid() = (SELECT landlord_id FROM public.listings WHERE id = listing_id));

-- ── listing_unit_rooms RLS ────────────────────────────────────────────────────
-- (Table itself is declared earlier, before public.conversations, so FKs resolve.)
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

-- ── reviews RLS ──────────────────────────────────────────────────────────────
-- Declared here (not with the other RLS blocks) because these policies
-- reference the visible / tenancy_id columns added just above.
DROP POLICY IF EXISTS "Reviews are publicly viewable" ON public.reviews;
DROP POLICY IF EXISTS "Reviewers can see own reviews" ON public.reviews;
DROP POLICY IF EXISTS "Authenticated users can create reviews" ON public.reviews;
CREATE POLICY "Reviews are publicly viewable" ON public.reviews
  FOR SELECT
  USING (visible = true);
CREATE POLICY "Reviewers can see own reviews" ON public.reviews
  FOR SELECT
  USING (auth.uid() = reviewer_id);
-- Reviews require an actual tenancy between the two parties with an open
-- review window; reviewer must be one side and reviewee the other (B23).
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

-- =============================================
-- MESSAGING RPCs (atomic counters + conversation start)
-- =============================================

-- Atomic +1 on the *other* party's unread counter (B3). Participants only.
CREATE OR REPLACE FUNCTION public.bump_unread(p_conversation_id uuid, p_field text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_convo record;
BEGIN
  IF p_field NOT IN ('renter_unread', 'landlord_unread') THEN
    RAISE EXCEPTION 'invalid field %', p_field;
  END IF;

  SELECT renter_id, landlord_id INTO v_convo
  FROM conversations WHERE id = p_conversation_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF auth.uid() IS DISTINCT FROM v_convo.renter_id
     AND auth.uid() IS DISTINCT FROM v_convo.landlord_id THEN
    RAISE EXCEPTION 'not a conversation participant';
  END IF;

  IF p_field = 'renter_unread' THEN
    UPDATE conversations
      SET renter_unread = COALESCE(renter_unread, 0) + 1
      WHERE id = p_conversation_id;
  ELSE
    UPDATE conversations
      SET landlord_unread = COALESCE(landlord_unread, 0) + 1
      WHERE id = p_conversation_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bump_unread(uuid, text) TO authenticated;

-- Atomic zero of the caller's own unread counter (B3).
CREATE OR REPLACE FUNCTION public.reset_unread(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_convo record;
BEGIN
  SELECT renter_id, landlord_id INTO v_convo
  FROM conversations WHERE id = p_conversation_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF auth.uid() = v_convo.renter_id THEN
    UPDATE conversations SET renter_unread = 0 WHERE id = p_conversation_id;
  ELSIF auth.uid() = v_convo.landlord_id THEN
    UPDATE conversations SET landlord_unread = 0 WHERE id = p_conversation_id;
  ELSE
    RAISE EXCEPTION 'not a conversation participant';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_unread(uuid) TO authenticated;

-- Create-or-resume a conversation per (listing, renter, unit, room) and
-- insert the first message atomically (B5 + B2).
CREATE OR REPLACE FUNCTION public.start_conversation_with_message(
  p_listing_id uuid,
  p_landlord_id uuid,
  p_unit_id uuid,
  p_room_id uuid,
  p_content text
)
RETURNS TABLE (conversation_id uuid, created boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_renter_id uuid := auth.uid();
  v_convo_id uuid;
  v_created boolean := false;
BEGIN
  IF v_renter_id IS NULL THEN
    RAISE EXCEPTION 'must be authenticated';
  END IF;

  IF length(coalesce(trim(p_content), '')) = 0 THEN
    RAISE EXCEPTION 'message content required';
  END IF;

  SELECT id INTO v_convo_id
  FROM conversations
  WHERE listing_id = p_listing_id
    AND renter_id  = v_renter_id
    AND unit_id IS NOT DISTINCT FROM p_unit_id
    AND room_id IS NOT DISTINCT FROM p_room_id;

  IF v_convo_id IS NULL THEN
    INSERT INTO conversations (listing_id, renter_id, landlord_id, unit_id, room_id)
    VALUES (p_listing_id, v_renter_id, p_landlord_id, p_unit_id, p_room_id)
    RETURNING id INTO v_convo_id;
    v_created := true;
  END IF;

  INSERT INTO messages (conversation_id, sender_id, content)
  VALUES (v_convo_id, v_renter_id, p_content);

  UPDATE conversations
    SET last_message = p_content,
        last_message_at = now(),
        landlord_unread = COALESCE(landlord_unread, 0) + 1
    WHERE id = v_convo_id;

  conversation_id := v_convo_id;
  created := v_created;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_conversation_with_message(uuid, uuid, uuid, uuid, text)
  TO authenticated;

-- Cheap total for the navbar unread badge (B10).
CREATE OR REPLACE FUNCTION public.user_unread_total()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT SUM(renter_unread)   FROM conversations WHERE renter_id   = auth.uid()), 0
  )::int +
  COALESCE(
    (SELECT SUM(landlord_unread) FROM conversations WHERE landlord_id = auth.uid()), 0
  )::int;
$$;

GRANT EXECUTE ON FUNCTION public.user_unread_total() TO authenticated;

-- =============================================
-- TENANCY RPCs (atomic assign / end)
-- =============================================

-- assign_tenant: insert tenancy + flip unit/room status + stamp conversation (B6).
CREATE OR REPLACE FUNCTION public.assign_tenant(
  p_listing_id uuid,
  p_unit_id uuid,
  p_room_id uuid,
  p_renter_id uuid,
  p_conversation_id uuid,
  p_move_in date
)
RETURNS public.tenancies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_landlord uuid;
  v_room_rental boolean;
  v_tenancy public.tenancies;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'must be authenticated';
  END IF;

  SELECT landlord_id INTO v_landlord
  FROM listings WHERE id = p_listing_id;

  IF v_landlord IS NULL THEN
    RAISE EXCEPTION 'listing not found';
  END IF;

  IF v_landlord <> v_caller THEN
    RAISE EXCEPTION 'only the listing owner can assign tenants';
  END IF;

  SELECT room_rental INTO v_room_rental
  FROM listing_units
  WHERE id = p_unit_id AND listing_id = p_listing_id;

  IF v_room_rental IS NULL THEN
    RAISE EXCEPTION 'unit not found for listing';
  END IF;

  IF v_room_rental AND p_room_id IS NULL THEN
    RAISE EXCEPTION 'room_id required for room-rental unit';
  END IF;

  IF NOT v_room_rental AND p_room_id IS NOT NULL THEN
    RAISE EXCEPTION 'room_id must be null for whole-unit rentals';
  END IF;

  IF p_room_id IS NOT NULL THEN
    PERFORM 1 FROM listing_unit_rooms WHERE id = p_room_id AND unit_id = p_unit_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'room not found for unit';
    END IF;
  END IF;

  INSERT INTO tenancies (
    listing_id, unit_id, room_id, renter_id, landlord_id,
    conversation_id, move_in, status
  )
  VALUES (
    p_listing_id, p_unit_id, p_room_id, p_renter_id, v_landlord,
    p_conversation_id, p_move_in, 'active'
  )
  RETURNING * INTO v_tenancy;

  IF p_room_id IS NOT NULL THEN
    UPDATE listing_unit_rooms SET status = 'occupied' WHERE id = p_room_id;
  ELSE
    UPDATE listing_units SET status = 'rented' WHERE id = p_unit_id;
  END IF;

  IF p_conversation_id IS NOT NULL THEN
    UPDATE conversations
      SET unit_id = p_unit_id, room_id = p_room_id
      WHERE id = p_conversation_id AND landlord_id = v_caller;
  END IF;

  RETURN v_tenancy;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_tenant(uuid, uuid, uuid, uuid, uuid, date)
  TO authenticated;

-- end_tenancy: mark ended + open review window + free the unit/room (B7).
CREATE OR REPLACE FUNCTION public.end_tenancy(
  p_tenancy_id uuid,
  p_move_out date
)
RETURNS public.tenancies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_tenancy public.tenancies;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'must be authenticated';
  END IF;

  SELECT * INTO v_tenancy FROM tenancies WHERE id = p_tenancy_id FOR UPDATE;

  IF v_tenancy.id IS NULL THEN
    RAISE EXCEPTION 'tenancy not found';
  END IF;

  IF v_tenancy.landlord_id <> v_caller THEN
    RAISE EXCEPTION 'only the landlord can end a tenancy';
  END IF;

  IF v_tenancy.status <> 'active' THEN
    RAISE EXCEPTION 'tenancy is not active';
  END IF;

  UPDATE tenancies
    SET status = 'ended',
        move_out = p_move_out,
        review_window_closes_at = (p_move_out + INTERVAL '30 days')::timestamptz
    WHERE id = p_tenancy_id
    RETURNING * INTO v_tenancy;

  IF v_tenancy.room_id IS NOT NULL THEN
    UPDATE listing_unit_rooms SET status = 'available' WHERE id = v_tenancy.room_id;
  ELSE
    UPDATE listing_units SET status = 'available' WHERE id = v_tenancy.unit_id;
  END IF;

  RETURN v_tenancy;
END;
$$;

GRANT EXECUTE ON FUNCTION public.end_tenancy(uuid, date) TO authenticated;
