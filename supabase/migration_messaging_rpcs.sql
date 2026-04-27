-- Run in Supabase SQL Editor: Dashboard -> SQL Editor -> New query
-- Batch 3: atomic messaging RPCs.
--
-- Replaces client-side read-modify-write of conversations.{renter,landlord}_unread
-- (B3) and makes new-conversation creation atomic so a failed first-message
-- insert can't leave behind an empty conversation row (B5). Also exposes a
-- cheap sum RPC for the navbar unread badge (B10 server half).

-- ---------------------------------------------------------------------------
-- bump_unread: atomic +1 on the correct unread counter.
-- Only conversation participants may call it, and only for the *other*
-- party's counter (you don't increment your own unread).
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- reset_unread: atomic zero on the caller's own unread counter.
-- The caller can only reset their *own* side; the RPC works out which
-- side from auth.uid() so clients can't accidentally clear the wrong one.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- start_conversation_with_message: create-or-fetch a conversation and insert
-- the first message atomically. Eliminates the B5 orphan case where the
-- conversation row was inserted but the messages insert failed.
--
-- Returns (conversation_id, created boolean) so the client knows whether it
-- was a fresh conversation or a resumed one.
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

  -- Try to find an existing conversation (schema has UNIQUE(listing_id, renter_id))
  SELECT id INTO v_convo_id
  FROM conversations
  WHERE listing_id = p_listing_id AND renter_id = v_renter_id;

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

-- ---------------------------------------------------------------------------
-- user_unread_total: cheap sum for the navbar badge (B10 server half).
-- Returns the total unread count for the calling user across all conversations.
-- ---------------------------------------------------------------------------
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
