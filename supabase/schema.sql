-- =============================================
-- MapleNest Database Schema
-- Run this in your Supabase SQL Editor
-- =============================================

-- USERS (extends Supabase auth.users)
CREATE TABLE public.profiles (
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

-- LISTINGS
CREATE TABLE public.listings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  landlord_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  -- Property details
  title TEXT NOT NULL,
  description TEXT,
  property_type TEXT NOT NULL CHECK (property_type IN ('apartment', 'house', 'room', 'basement', 'condo', 'townhouse')),
  -- Location (PEI-focused)
  address TEXT,
  city TEXT NOT NULL DEFAULT 'Charlottetown',
  neighbourhood TEXT,
  postal_code TEXT,
  latitude NUMERIC(10, 7),
  longitude NUMERIC(10, 7),
  -- Pricing
  price INTEGER NOT NULL, -- monthly rent in CAD
  utilities_included BOOLEAN DEFAULT FALSE,
  -- Details
  bedrooms INTEGER NOT NULL DEFAULT 1,
  bathrooms NUMERIC(2,1) NOT NULL DEFAULT 1,
  square_feet INTEGER,
  available_from DATE,
  lease_term TEXT, -- 'monthly', '6_months', '1_year', 'flexible'
  -- Amenities
  pet_friendly BOOLEAN DEFAULT FALSE,
  parking_available BOOLEAN DEFAULT FALSE,
  laundry TEXT, -- 'in_unit', 'shared', 'none'
  furnished BOOLEAN DEFAULT FALSE,
  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'rented', 'draft', 'removed')),
  source TEXT DEFAULT 'maplenest', -- 'maplenest', 'craigslist_rss', 'user_import'
  source_url TEXT,
  -- Meta
  views INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- LISTING IMAGES
CREATE TABLE public.listing_images (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_id UUID REFERENCES public.listings(id) ON DELETE CASCADE NOT NULL,
  url TEXT NOT NULL,
  storage_path TEXT,
  is_primary BOOLEAN DEFAULT FALSE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- CONVERSATIONS (Chat)
CREATE TABLE public.conversations (
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

-- MESSAGES
CREATE TABLE public.messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE NOT NULL,
  sender_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- REVIEWS
CREATE TABLE public.reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reviewer_id UUID REFERENCES public.profiles(id) NOT NULL,
  reviewee_id UUID REFERENCES public.profiles(id) NOT NULL,
  listing_id UUID REFERENCES public.listings(id),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(reviewer_id, reviewee_id, listing_id)
);

-- REPORTS
CREATE TABLE public.reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_id UUID REFERENCES public.profiles(id) NOT NULL,
  listing_id UUID REFERENCES public.listings(id),
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
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- Profiles: public read, own write
CREATE POLICY "Profiles are publicly viewable" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Listings: public read, landlord write
CREATE POLICY "Listings are publicly viewable" ON public.listings FOR SELECT USING (status = 'active');
CREATE POLICY "Landlords can create listings" ON public.listings FOR INSERT WITH CHECK (auth.uid() = landlord_id);
CREATE POLICY "Landlords can update own listings" ON public.listings FOR UPDATE USING (auth.uid() = landlord_id);

-- Listing images: public read, landlord write
CREATE POLICY "Images are publicly viewable" ON public.listing_images FOR SELECT USING (true);
CREATE POLICY "Landlords can manage own listing images" ON public.listing_images FOR ALL
  USING (EXISTS (SELECT 1 FROM public.listings WHERE id = listing_id AND landlord_id = auth.uid()));

-- Conversations: only participants can see
CREATE POLICY "Conversation participants can view" ON public.conversations FOR SELECT
  USING (auth.uid() = renter_id OR auth.uid() = landlord_id);
CREATE POLICY "Renters can create conversations" ON public.conversations FOR INSERT
  WITH CHECK (auth.uid() = renter_id);

-- Messages: only conversation participants
CREATE POLICY "Participants can view messages" ON public.messages FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_id AND (c.renter_id = auth.uid() OR c.landlord_id = auth.uid())));
CREATE POLICY "Participants can send messages" ON public.messages FOR INSERT
  WITH CHECK (auth.uid() = sender_id AND EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_id AND (c.renter_id = auth.uid() OR c.landlord_id = auth.uid())));

-- =============================================
-- TRIGGERS
-- =============================================

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (new.id, new.email);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER listings_updated_at BEFORE UPDATE ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
