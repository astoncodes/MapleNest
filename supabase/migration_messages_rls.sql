-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New query
-- Adds missing RLS policies for conversations UPDATE and messages UPDATE.

-- Allow participants to update conversation metadata (last_message, unread counts)
DROP POLICY IF EXISTS "Participants can update conversation" ON public.conversations;
CREATE POLICY "Participants can update conversation" ON public.conversations
  FOR UPDATE
  USING (auth.uid() = renter_id OR auth.uid() = landlord_id);

-- Allow participants to mark messages as read (update read = true)
DROP POLICY IF EXISTS "Participants can mark messages read" ON public.messages;
CREATE POLICY "Participants can mark messages read" ON public.messages
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND (c.renter_id = auth.uid() OR c.landlord_id = auth.uid())
    )
  );
