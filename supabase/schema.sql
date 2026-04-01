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
  property_type TEXT NOT NULL CHECK (property_type IN ('apartment', 'house', 'room', 'basement', 'condo', 'townhouse')),
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
DROP POLICY IF EXISTS "Landlords can update own listings" ON public.listings;
DROP POLICY IF EXISTS "Landlords can delete own listings" ON public.listings;
CREATE POLICY "Listings are publicly viewable" ON public.listings
  FOR SELECT USING (status = 'active');
CREATE POLICY "Landlords can create listings" ON public.listings
  FOR INSERT WITH CHECK (
    auth.uid() = landlord_id
    AND public.is_landlord(auth.uid())
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
CREATE POLICY "Landlords can delete own listings" ON public.listings
  FOR DELETE USING (
    auth.uid() = landlord_id
    AND public.is_landlord(auth.uid())
  );

DROP POLICY IF EXISTS "Images are publicly viewable" ON public.listing_images;
DROP POLICY IF EXISTS "Landlords can manage own listing images" ON public.listing_images;
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
CREATE POLICY "Conversation participants can view" ON public.conversations
  FOR SELECT
  USING (auth.uid() = renter_id OR auth.uid() = landlord_id);
CREATE POLICY "Renters can create conversations" ON public.conversations
  FOR INSERT
  WITH CHECK (auth.uid() = renter_id);

DROP POLICY IF EXISTS "Participants can view messages" ON public.messages;
DROP POLICY IF EXISTS "Participants can send messages" ON public.messages;
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
