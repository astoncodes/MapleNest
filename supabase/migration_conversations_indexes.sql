-- Run in Supabase SQL Editor: Dashboard -> SQL Editor -> New query
-- Batch 10 (B38): indexes backing the inbox / navbar unread queries.
--
-- MessagesInboxPage and user_unread_total() both filter conversations by
-- renter_id / landlord_id. Without these, every inbox load and navbar badge
-- poll is a sequential scan over conversations.

CREATE INDEX IF NOT EXISTS idx_conversations_renter_id
  ON public.conversations (renter_id);

CREATE INDEX IF NOT EXISTS idx_conversations_landlord_id
  ON public.conversations (landlord_id);

-- Inbox sorts by last_message_at DESC NULLS LAST after the participant filter.
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at
  ON public.conversations (last_message_at DESC NULLS LAST);

-- Message history is always fetched per-conversation ordered by created_at.
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id_created_at
  ON public.messages (conversation_id, created_at);

-- Rollback:
--   DROP INDEX IF EXISTS idx_conversations_renter_id;
--   DROP INDEX IF EXISTS idx_conversations_landlord_id;
--   DROP INDEX IF EXISTS idx_conversations_last_message_at;
