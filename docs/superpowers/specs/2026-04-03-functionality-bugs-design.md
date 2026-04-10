# MapleNest Functionality Bug Fixes — Design Spec
**Date:** 2026-04-03

## Overview
Six functionality bugs to fix in priority order. All are frontend changes except Fix 5 which also requires a Supabase SQL migration.

---

## Fix 1 — Edit Listing Form Broken

**Problem:** `EditListingPage` passes `mode="edit"` and `listing={data}` to `CreateListingPage`, but `CreateListingPage` ignores both props (no prop destructuring). Editing opens a blank form.

**Fix:**
- `CreateListingPage` accepts `{ mode = 'create', listing = null, onSubmitSuccess }`
- A `useEffect([listing])` seeds `form` state from the existing listing when `mode === 'edit'`
- `handleSubmit` calls `supabase.from('listings').update(...)` when `mode === 'edit'`, `insert` when `'create'`
- Photo step: in edit mode, shows existing `listing_images` alongside any newly added photos. New uploads append to existing; user can remove existing images (delete from `listing_images` + storage).
- On success: calls `onSubmitSuccess()` (edit) or navigates to new listing (create)

---

## Fix 2 — Messages Route Missing

**Problem:** Contact Landlord creates a conversation row and navigates to `/messages/:id`, but that route doesn't exist → 404.

**New files:**
- `src/pages/MessagesInboxPage.jsx` — `/messages`
- `src/pages/ConversationPage.jsx` — `/messages/:id`

**MessagesInboxPage:**
- Protected route
- Fetches all conversations where `renter_id = user.id OR landlord_id = user.id`, joined with `listings(id, title, city, listing_images)` and renter/landlord profiles
- Shows: listing thumbnail, listing title, other party's name, last message preview, unread count badge, relative time
- Empty state: "No conversations yet"
- Click row → navigate to `/messages/:id`

**ConversationPage:**
- Protected route
- Fetches conversation by `id`, verifies user is `renter_id` or `landlord_id` (redirect to `/messages` if not)
- Fetches messages ordered `created_at ASC`
- Real-time: Supabase `channel().on('postgres_changes', INSERT on messages)` subscription, appends new messages live
- On load: marks all messages from the other party as `read = true`
- Layout: sticky header (listing info + other party name + back link), scrollable message thread, fixed bottom send input
- Messages: own = right-aligned red bubble, other = left-aligned gray bubble, timestamp below each
- Conversation's `last_message`, `last_message_at`, and unread count updated on send via `conversations` update

**Navbar:**
- Add "Messages" link
- Show unread badge: fetch total `renter_unread` or `landlord_unread` from conversations where user is participant; display red dot if > 0

**Routes added to App.jsx:**
```
<Route path="/messages" element={<ProtectedRoute><MessagesInboxPage /></ProtectedRoute>} />
<Route path="/messages/:id" element={<ProtectedRoute><ConversationPage /></ProtectedRoute>} />
```

---

## Fix 3 — Double Fetch on Search

**Problem:** `handleSearch` in `ListingsPage` updates `searchParams` (which changes `queryFromParams`, triggering the `useEffect`) AND directly calls `fetchListings()`. Every search fires two requests.

**Fix:** Remove the direct `fetchListings()` call from `handleSearch`. The `useEffect([filters, queryFromParams])` already handles refetching when the query param changes.

---

## Fix 4 — Search Scope Too Narrow

**Problem:** `fetchListings` uses `ilike('title', ...)` only. Placeholder says "neighbourhood, keyword" but those fields aren't searched.

**Fix:** Replace with Supabase `.or()`:
```js
query = query.or(`title.ilike.%${q}%,neighbourhood.ilike.%${q}%,description.ilike.%${q}%`)
```

---

## Fix 5 — View Count Race Condition

**Problem:** Detail page does client-side read → increment → write. Concurrent views lose counts.

**Fix:**
- Add `supabase/migration_increment_views.sql` with a `increment_views(p_listing_id uuid)` RPC:
  ```sql
  CREATE OR REPLACE FUNCTION public.increment_views(p_listing_id uuid)
  RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
    UPDATE public.listings SET views = views + 1 WHERE id = p_listing_id;
  $$;
  ```
- `ListingDetailPage` calls `supabase.rpc('increment_views', { p_listing_id: id })` (fire-and-forget)
- Migration must be run manually in Supabase SQL editor

---

## Fix 6 — Report Button No-op

**Problem:** "🚩 Report this listing" is a button with no handler. The `reports` table already exists in the schema.

**Fix:** Replace the button with a small inline report flow:
- Click opens a modal (can reuse `ConfirmModal` pattern or a new inline state)
- Reason dropdown: `spam`, `misleading info`, `wrong price`, `already rented`, `inappropriate content`, `scam`
- Optional details textarea
- Requires auth (show login prompt if not signed in)
- Submits to `reports` table: `{ reporter_id, listing_id, reason, details }`
- Confirmation message on success; disable re-reporting once submitted

---

## Files Changed

| File | Action |
|------|--------|
| `src/pages/CreateListingPage.jsx` | Edit — add props support for edit mode |
| `src/pages/MessagesInboxPage.jsx` | New |
| `src/pages/ConversationPage.jsx` | New |
| `src/App.jsx` | Edit — add messages routes |
| `src/components/shared/Navbar.jsx` | Edit — add Messages link + unread badge |
| `src/pages/ListingsPage.jsx` | Edit — fix double fetch + search scope |
| `src/pages/ListingDetailPage.jsx` | Edit — atomic view count + report modal |
| `supabase/migration_increment_views.sql` | New — SQL migration for RPC |
