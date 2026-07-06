-- Run in Supabase SQL Editor: Dashboard -> SQL Editor -> New query
-- B5 one-off cleanup: delete orphan conversation rows.
--
-- Before the atomic start_conversation_with_message RPC, a conversation was
-- inserted and the first message was inserted as two separate calls. If the
-- message insert failed (RLS, transient network, client crash), the
-- conversation stayed behind with last_message = NULL and no messages rows.
-- MessagesInboxPage filters out conversations with null last_message, so
-- these orphans are invisible to users and hide the "start a new conversation"
-- affordance for the same (listing, renter) pair (unique index blocks it).
--
-- This is reversible via the `orphaned_conversations_backup` table — review
-- and then drop the backup table once you're confident.

-- 1. Snapshot the orphans we are about to delete so the operation is reversible.
-- Note: LIKE ... INCLUDING ALL copies indexes/defaults/storage but NOT RLS,
-- so we explicitly enable RLS with no policies. That blocks all access via
-- the anon/authenticated API keys; only service_role (e.g. the SQL editor)
-- can read this backup, which is what we want for a recovery-only artifact.
CREATE TABLE IF NOT EXISTS public.orphaned_conversations_backup
  (LIKE public.conversations INCLUDING ALL);

ALTER TABLE public.orphaned_conversations_backup ENABLE ROW LEVEL SECURITY;

INSERT INTO public.orphaned_conversations_backup
SELECT c.*
FROM public.conversations c
LEFT JOIN public.messages m ON m.conversation_id = c.id
WHERE c.last_message IS NULL
  AND m.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- 2. Report how many orphans exist (run this alone to preview first).
-- SELECT count(*) FROM public.orphaned_conversations_backup;

-- 3. Delete them.
DELETE FROM public.conversations c
WHERE c.last_message IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.messages m WHERE m.conversation_id = c.id);

-- Once verified and the product has been running clean for a cycle, drop the backup:
--   DROP TABLE public.orphaned_conversations_backup;
