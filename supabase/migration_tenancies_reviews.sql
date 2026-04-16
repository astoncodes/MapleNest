-- =============================================
-- TENANCIES TABLE
-- =============================================

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

-- One active tenancy per unit (whole-unit rentals)
CREATE UNIQUE INDEX IF NOT EXISTS tenancies_active_unit_idx
  ON public.tenancies (unit_id)
  WHERE status = 'active' AND room_id IS NULL;

-- One active tenancy per room (room rentals)
CREATE UNIQUE INDEX IF NOT EXISTS tenancies_active_room_idx
  ON public.tenancies (room_id)
  WHERE status = 'active' AND room_id IS NOT NULL;

-- Query indexes
CREATE INDEX IF NOT EXISTS idx_tenancies_listing_id ON public.tenancies (listing_id);
CREATE INDEX IF NOT EXISTS idx_tenancies_unit_id_active ON public.tenancies (unit_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_tenancies_renter_id ON public.tenancies (renter_id);
CREATE INDEX IF NOT EXISTS idx_tenancies_landlord_id ON public.tenancies (landlord_id);
CREATE INDEX IF NOT EXISTS idx_tenancies_conversation_id ON public.tenancies (conversation_id);

-- RLS
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

-- =============================================
-- REVIEWS TABLE ALTERATIONS
-- =============================================

ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS tenancy_id uuid REFERENCES public.tenancies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS visible boolean NOT NULL DEFAULT true;

-- Grandfathered: existing rows already have visible = true from the DEFAULT.
-- New tenancy-linked reviews will be inserted with visible = false explicitly.

CREATE UNIQUE INDEX IF NOT EXISTS reviews_tenancy_reviewer_idx
  ON public.reviews (tenancy_id, reviewer_id)
  WHERE tenancy_id IS NOT NULL;

-- Update reviews RLS: public can only see visible reviews
DROP POLICY IF EXISTS "Reviews are publicly viewable" ON public.reviews;
CREATE POLICY "Reviews are publicly viewable" ON public.reviews
  FOR SELECT
  USING (visible = true);

-- Reviewers can also see their own non-visible reviews (so they see "pending" state)
CREATE POLICY "Reviewers can see own reviews" ON public.reviews
  FOR SELECT
  USING (auth.uid() = reviewer_id);

-- =============================================
-- REVEAL REVIEWS FUNCTION (SECURITY DEFINER)
-- =============================================

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
  -- Get tenancy info
  SELECT * INTO v_tenancy FROM tenancies WHERE id = p_tenancy_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Count reviews for this tenancy
  SELECT count(*) INTO v_review_count
  FROM reviews WHERE tenancy_id = p_tenancy_id;

  -- Check if window has closed
  v_window_closed := v_tenancy.review_window_closes_at IS NOT NULL
    AND v_tenancy.review_window_closes_at < now();

  -- Reveal if both reviews exist OR window expired with at least one review
  IF v_review_count >= 2 OR (v_window_closed AND v_review_count > 0) THEN
    -- Collect affected reviewee IDs before update
    SELECT array_agg(DISTINCT reviewee_id) INTO v_reviewee_ids
    FROM reviews WHERE tenancy_id = p_tenancy_id AND visible = false;

    -- Flip visibility
    UPDATE reviews SET visible = true
    WHERE tenancy_id = p_tenancy_id AND visible = false;

    -- Recalculate aggregates for each affected reviewee
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

-- =============================================
-- EXPIRE REVIEWS FUNCTION (for lazy on-read checks)
-- =============================================

CREATE OR REPLACE FUNCTION public.expire_pending_reviews(p_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenancy_id uuid;
BEGIN
  -- Find tenancies with expired windows that have unrevealed reviews for this profile
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

GRANT EXECUTE ON FUNCTION public.expire_pending_reviews(uuid) TO authenticated, anon;

-- =============================================
-- TENANCY DELETE TRIGGER (cascading cleanup)
-- =============================================

CREATE OR REPLACE FUNCTION public.handle_tenancy_delete()
RETURNS TRIGGER AS $$
BEGIN
  -- Flip unit/room back to available when tenancy is deleted (e.g. renter account deletion cascade)
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

CREATE TRIGGER tenancy_before_delete
  BEFORE DELETE ON public.tenancies
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_tenancy_delete();
