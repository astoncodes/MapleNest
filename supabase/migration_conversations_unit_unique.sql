-- Run in Supabase SQL Editor: Dashboard -> SQL Editor -> New query
-- B2: one conversation per (listing, renter, unit, room).
--
-- The existing UNIQUE(listing_id, renter_id) meant a renter interested in
-- Unit A and Unit B on the same listing could only ever have a single
-- conversation with the landlord — the second "Contact" click dropped
-- them into the first thread with no unit/room context. We now allow
-- one conversation per (listing, renter, unit, room) tuple.
--
-- We use a unique expression index with COALESCE because a plain
-- UNIQUE(listing_id, renter_id, unit_id, room_id) treats NULLs as
-- distinct, which would re-permit duplicate (A,B,NULL,NULL) rows.

-- ---------------------------------------------------------------------------
-- 1. Safety check — surface existing duplicates (run this alone first).
-- ---------------------------------------------------------------------------
-- SELECT listing_id, renter_id, unit_id, room_id, count(*)
-- FROM public.conversations
-- GROUP BY listing_id, renter_id, unit_id, room_id
-- HAVING count(*) > 1;
--
-- If that returns rows, merge or delete duplicates before running the index
-- creation below.

-- ---------------------------------------------------------------------------
-- 2. Drop the old constraint.
-- ---------------------------------------------------------------------------
ALTER TABLE public.conversations
  DROP CONSTRAINT IF EXISTS conversations_listing_id_renter_id_key;

-- ---------------------------------------------------------------------------
-- 3. Add the new unique index, treating NULL unit/room as the sentinel
--    all-zero UUID so NULL == NULL for dedup purposes.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS conversations_listing_renter_unit_room_uidx
  ON public.conversations (
    listing_id,
    renter_id,
    COALESCE(unit_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(room_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

-- ---------------------------------------------------------------------------
-- 4. Update start_conversation_with_message to match on unit/room as well.
--    The prior version matched only on (listing_id, renter_id), so a
--    second Contact click for a different unit would RESUME the first
--    conversation instead of creating a new one.
-- ---------------------------------------------------------------------------
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
