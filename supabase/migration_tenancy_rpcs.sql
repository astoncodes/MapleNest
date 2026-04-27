-- Run in Supabase SQL Editor: Dashboard -> SQL Editor -> New query
-- Batch 5: Tenancy atomicity (B6, B7).
--
-- Previously, assigning a tenant and ending a tenancy were each 2–3 separate
-- client-side writes: insert/update tenancy, flip unit/room status, update the
-- conversation. If the tab lost connection between writes, the DB could be
-- left in a half-baked state (tenancy recorded but unit still "available", or
-- vice versa). These two SECURITY DEFINER functions collapse each flow into a
-- single transactional call and enforce landlord ownership on the server.

-- ---------------------------------------------------------------------------
-- assign_tenant: insert tenancy + flip unit/room status + stamp conversation.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- end_tenancy: mark tenancy ended + set review window + flip unit/room back.
-- ---------------------------------------------------------------------------
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
