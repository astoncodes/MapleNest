---
name: bug fix plan doc
overview: Create a single execution-ready Markdown plan at `docs/superpowers/plans/bug-fix-plan.md` that groups all 39 confirmed bugs (B1–B39) and 7 possible issues (V1–V7) from the prior audit into 10 focused batches with fixing order, dependencies, and tests. No code changes; this is purely the planning document.
todos:
  - id: todo-1776356564716-7gg4f184b
    content: ""
    status: pending
isProject: false
---

## Deliverable

Write a new file at `docs/superpowers/plans/bug-fix-plan.md` with the exact content below. No other files are touched.

## File content (verbatim)

```markdown
# Bug Fix Plan

## Overview

This plan converts the MapleNest bug audit (39 confirmed bugs B1–B39 and 7 possible issues V1–V7) into an execution-ready roadmap.

- **What this plan is for:** unblocking a production release by fixing correctness, security, and data-integrity bugs, then polishing UX and performance.
- **Scope:** React frontend (pages, hooks, components), Supabase backend (RLS policies, RPCs, storage buckets), auth, messaging, listings, tenancy, reviews, analytics.
- **Strategy:** 10 focused batches, each touching a single area. Inside a batch, fix one bug at a time, smoke-test the immediate flow, then run the batch test checklist. Do NOT advance to the next batch until the current batch is green.

Pre-flight task before Batch 1:

- **B39** Enable `plugin:react-hooks/recommended` in `.eslintrc.cjs` and run `npm run lint` once. Do not fix warnings yet — we just want the warnings visible while we work through later batches so that hook-deps issues (B18, B19, B33) are auto-flagged as we edit.

---

## Batches

### Batch 1 — Auth & Security Hardening

**Goal:**
Close the role-escalation vector, stop trusting client-controlled metadata, fix auth bootstrap races, and verify RLS for role updates, listing-insert, and review-insert.

**Bugs:**

- B1 — Role escalation via `user_metadata` (P0)
- B11 — Double auth bootstrap race (P1)
- B20 — ResetPasswordPage "Verifying…" hangs forever (P2)
- B23 — Reviews self-review prevention relies solely on RLS (P2)
- V1 — `enrichUser` profile-role UPDATE may be RLS-blocked
- V7 — Renter-only-sublease INSERT enforced by RLS (verify)

**Fixing Order:**

1. B1 (client-side: only use metadata inside the `!profile` branch in `src/hooks/useAuth.jsx`)
2. V1 + V7 (write/adjust RLS migration: block `profiles.role` UPDATE by owner; enforce `listings.property_type='sublease'` for renters)
3. B23 (tighten `reviews` RLS so it checks tenancy parties + review window + reviewer ≠ reviewee)
4. B11 (remove `supabase.auth.getSession().then(...)` — rely on `onAuthStateChange`)
5. B20 (add 5 s timeout + expired-link fallback in `src/pages/ResetPasswordPage.jsx`)

**Notes:**

- B1 is meaningless without V1; ship them in one migration.
- After B1, existing landlords promoted via the old bug must be audited manually.
- B23 may need a follow-up in Batch 4 if the client code still passes wrong ids.

**Test After Batch:**

- [ ] Fresh signup as renter → cannot promote via `supabase.auth.updateUser({ data: { role: 'landlord' } })`
- [ ] Fresh signup as landlord → gets landlord role exactly once
- [ ] Renter cannot insert a non-sublease listing (SQL or UI)
- [ ] Renter cannot insert a review for a tenancy they are not part of
- [ ] Hard reload while logged in → no duplicate profile insert, no auth flicker
- [ ] Visit `/reset-password` with no token → falls back to expired-link UI within 5 s

---

### Batch 2 — Runtime Crash Safety

**Goal:**
Eliminate white-screen crashes from null/undefined access and fragile error handling.

**Bugs:**

- B4 — `formatPrice(null)` crashes detail page (P0)
- B28 — Supabase env guard throws at import (P3)
- B29 — Listing images `sort_order` NaN on nulls (P3)
- B31 — `handleReport` lacks `user` null-check (P3)

**Fixing Order:**

1. B4 (harden `formatPrice` in `src/pages/ListingDetailPage.jsx`)
2. B29 (`(a.sort_order ?? 0) - (b.sort_order ?? 0)` in detail + create pages)
3. B31 (top-of-function guard in `handleReport`)
4. B28 (replace import-time `throw` with a rendered config-error screen in `src/App.jsx`)

**Notes:**

- All are mechanical — no schema changes. Good warm-up batch.

**Test After Batch:**

- [ ] Detail page renders even if `price` is null (set one manually in SQL editor)
- [ ] Images with null `sort_order` render in deterministic order
- [ ] Click "Report" after session expiry → redirected to login, no crash
- [ ] Temporarily blank `VITE_SUPABASE_URL` → app renders friendly error screen, not blank page

---

### Batch 3 — Messaging: Database Integrity

**Goal:**
Make counters and conversation creation atomic via Postgres RPCs so state cannot diverge.

**Bugs:**

- B3 — Unread counter read-modify-write race (P0)
- B5 — Orphan conversation row hides user forever (P0)
- B10 — Navbar unread badge is a one-shot (P1, server-side piece here)
- V2 — Unchecked RPCs (`increment_views`, `expire_pending_reviews`, `reveal_reviews`) — verify existence and signatures

**Fixing Order:**

1. V2 (confirm existing RPCs in `supabase/migrations`; document missing ones)
2. Create RPCs: `bump_unread(convo_id uuid, field text)`, `reset_unread(convo_id uuid, field text)`, `start_conversation_with_message(listing_id, landlord_id, renter_id, unit_id, room_id, content)`
3. B5 client side: use new RPC in `src/pages/ConversationPage.jsx` new-conversation path
4. B3 client side: replace read-modify-write in `ConversationPage.jsx` lines 88–96, 178–180, 301–312 with RPC calls
5. One-off migration to delete orphan conversations with `last_message IS NULL` and no messages
6. B10 server half: expose an RPC/view `user_unread_total(user_id)` the Navbar can call cheaply

**Notes:**

- Batches 4, 5, and 10 depend on the RPCs shipped here.
- Keep orphan-cleanup migration reversible (soft delete / archive first).

**Test After Batch:**

- [ ] Two browsers, same conversation, simultaneous send → unread count = correct total on both sides
- [ ] Force message-insert failure mid-new-convo → no orphan row remains
- [ ] `user_unread_total` returns expected number after mixed read/send flow

---

### Batch 4 — Messaging: UX & Hooks

**Goal:**
Make conversations correct per unit/room, stop refetch storms on token refresh, and tidy realtime/polling.

**Bugs:**

- B2 — Contact flow ignores unit/room (P0)
- B18 — `ConversationPage` effect deps include object `location.state` (P2)
- B24 — Inbox hides conversations with null `last_message` (P2)
- B26 — Polling + realtime both active (P3)
- B33 — Realtime re-subscribes on token refresh (P3)

**Fixing Order:**

1. B2 (add `.eq('unit_id', ...).eq('room_id', ...)` in `ListingDetailPage.handleContact` + `handleUnitRequest`; add DB unique constraint `(listing_id, renter_id, unit_id, room_id)`)
2. B24 (drop `.not('last_message', 'is', null)` in `MessagesInboxPage` now that B5 is fixed; optional "Draft" section)
3. B18 + B33 (deps `[id, isNew, user?.id]` across the effects in `ConversationPage.jsx`)
4. B26 (only start polling if realtime `.subscribe((status) => ...)` reports `CHANNEL_ERROR` / `TIMED_OUT`)

**Notes:**

- B2 requires the unique-constraint migration; run locally first to surface any existing duplicates.
- Must ship after Batch 3 (B5 cleanup) to avoid resurfacing orphans.

**Test After Batch:**

- [ ] Renter requests Unit A, then Unit B → two separate conversations, each with correct unit metadata
- [ ] Token refresh mid-conversation → no refetch, no duplicate realtime channel
- [ ] Force realtime failure (disable replication) → polling kicks in as fallback
- [ ] Inbox shows all active conversations; no "Draft" appears when B5 is healthy

---

### Batch 5 — Tenancy Atomicity

**Goal:**
Make tenant assignment and end-of-tenancy all-or-nothing, fix date default.

**Bugs:**

- B6 — `AssignTenantModal` non-atomic (P0)
- B7 — `TenancyBar.handleEndTenancy` non-atomic (P0)
- B37 — `handleEndTenancy` uses UTC default date (P3)

**Fixing Order:**

1. Create RPCs: `assign_tenant(listing_id, unit_id, room_id, renter_id, conversation_id, move_in)` and `end_tenancy(tenancy_id, move_out)`
2. B6 client (`src/components/tenancy/AssignTenantModal.jsx`) → single RPC call
3. B7 client (`src/components/tenancy/TenancyBar.jsx`) → single RPC call
4. B37 build local `YYYY-MM-DD` default in `TenancyBar.jsx`

**Notes:**

- RPCs should run with `SECURITY DEFINER` and enforce landlord ownership.
- After Batch 5, run a one-off data fix for any prior partial-failure rows.

**Test After Batch:**

- [ ] Assign tenant offline mid-save → no tenancy, no unit flip
- [ ] End tenancy offline mid-save → no status change, user can retry
- [ ] Default move-out date near midnight local time matches today's local date

---

### Batch 6 — Listings: Create / Edit & Uploads

**Goal:**
Harden the listing submit flow, kill setTimeout leak, prevent storage orphans, and fix edit-mode edge cases.

**Bugs:**

- B13 — `setTimeout` post-save leaks navigation (P2)
- B16 — `EditListingPage` stale auth gate (P2)
- B21 — `uploadPhotos` single-shot insert leaks storage (P2)
- B25 — `handlePhotos` keeps stale preview URL edge case (P3)
- B32 — Bathroom select mixes int/float values (P3)

**Fixing Order:**

1. B13 (store timeout id in ref, clear on unmount in `src/pages/CreateListingPage.jsx`)
2. B21 (insert `listing_images` row per upload, or on failure call `storage.remove(uploadedPaths)`)
3. B16 (consolidate auth + listing fetch into single `authorized` state in `src/pages/EditListingPage.jsx`)
4. B25 (rebuild `photoPreviewUrls` from a `File → URL` Map)
5. B32 (store `bathrooms` as string in form state; parse on submit)

**Notes:**

- B21 should mirror B6/B7 pattern: never leave storage in a state DB doesn't know about.

**Test After Batch:**

- [ ] Trigger photo insert failure → no orphan blobs in `listing-images` bucket
- [ ] Create listing → back-button during 2.5 s banner → no unexpected navigation
- [ ] Deep-link `/listings/:id/edit` as non-owner → single "Loading" then clean kickout
- [ ] Edit listing with 1.5 bathrooms → value persists correctly
- [ ] Add/remove/replace photos → no stale URLs in previews

---

### Batch 7 — Listings: Search & Display

**Goal:**
Debounce queries, sanitize search input, and fix display fallbacks.

**Bugs:**

- B14 — Listings search / filters not debounced (P2)
- B15 — `.or()` with user input can break queries (P2)
- B27 — Listings search form resets input on back (P3)
- B35 — `fetchListing` redirects on transient errors (P3)
- B36 — `ListingsPage` shows `$0` for missing prices (P3)

**Fixing Order:**

1. B15 (whitelist `[\w\s-]` in search term or migrate to `tsvector` + RPC)
2. B14 (300 ms debounce on numeric inputs in `src/pages/ListingsPage.jsx`)
3. B27 (only sync input from URL when user hasn't typed since last URL change)
4. B35 (distinguish 404 from transient errors in `ListingDetailPage.fetchListing`)
5. B36 ("Contact for price" when resolved price is 0/null in `ListingCard`)

**Notes:**

- Keep the debounce minimal (no new libraries).
- If `tsvector` migration is adopted, update `ListingsPage` and add the Postgres index in the same PR.

**Test After Batch:**

- [ ] Search `foo.bar`, `foo,bar`, `foo"bar` → no 400s
- [ ] Type fast in Min/Max → at most 1 query within 300 ms
- [ ] Submit search, back-button → query string and input consistent
- [ ] Listing with null price → shows "Contact for price"
- [ ] Transient fetch error → retry UI, not auto-redirect

---

### Batch 8 — Hooks & Auth Bootstrap Cleanup

**Goal:**
Stop refetch storms on token refresh and fix saved-listing double-mutation.

**Bugs:**

- B17 — `useSavedListings.toggleSave` concurrent double-mutation (P2)
- B19 — Many effects depend on whole `user` object (P2)

**Fixing Order:**

1. B19 sweep — replace `[user]` with `[user?.id]` in:
   - `src/hooks/useSavedListings.jsx:34`
   - `src/components/shared/Navbar.jsx:26`
   - `src/pages/MessagesInboxPage.jsx:91`
   - `src/pages/ConversationPage.jsx:121, 152, 187, 216`
   - `src/pages/ProfilePage.jsx` fetchAll dep
2. B17 (inFlight Set keyed by `listingId` in `useSavedListings`; treat 23505 as success)

**Notes:**

- React-hooks ESLint warnings from Pre-flight/B39 should guide the sweep.

**Test After Batch:**

- [ ] Leave app idle past 1 h (or force token refresh) → no visible flicker / no extra network calls
- [ ] Double-tap heart icon rapidly → one net save, no UI flip-flop

---

### Batch 9 — Profile & Storage

**Goal:**
Move avatars to a proper bucket, validate uploads, and surface friendly errors.

**Bugs:**

- B12 — Avatar upload uses wrong bucket & leaks (P1)
- B22 — `handleAvatarUpload` no type/size validation (P2)
- B30 — Raw Supabase errors shown to users (P3)
- V6 — Listing-image storage delete RLS (verify)

**Fixing Order:**

1. V6 (verify bucket RLS allows owner delete for `listing-images` prefix `{user_id}/...`)
2. Create `avatars` bucket + owner-write / public-read policies
3. B12 (switch upload path in `src/pages/ProfilePage.jsx`; `list()` old avatars and `remove()` after successful upload)
4. B22 (mirror `uploadPhotos` validation: `image/`\*, ≤ 5 MB)
5. B30 (central `mapSupabaseError(err)` utility used across save/upload flows)

**Notes:**

- After B12 migration, existing avatars in `listing-images` should be copied once to the new bucket.

**Test After Batch:**

- [ ] Upload avatar → lands in `avatars` bucket, old avatar deleted
- [ ] Upload 12 MB image / non-image → rejected with friendly message
- [ ] Fail an RLS write intentionally → user sees readable copy, not "new row violates..."

---

### Batch 10 — UI / Navigation / Homepage Stats

**Goal:**
Polish navigation and public-facing surfaces.

**Bugs:**

- B8 — HomePage advertises "0 Verified Landlords" (P1)
- B9 — Navbar mobile menu doesn't auto-close (P1)
- B10 — Navbar unread badge UI half (P1)
- B34 — Signup "Check your email" when Supabase auto-confirms (P3)
- B38 — Navbar unread OR query index unverified (P3)

**Fixing Order:**

1. B8 (create `public_stats` SECURITY DEFINER RPC; swap `HomePage` fetch)
2. B38 (confirm `conversations(renter_id)` and `conversations(landlord_id)` indexes)
3. B10 UI half (use RPC from Batch 3; subscribe to `postgres_changes` or refetch on focus)
4. B9 (`useLocation().pathname` dep in `src/components/shared/Navbar.jsx`)
5. B34 (branch on returned `data.session` in `src/pages/SignupPage.jsx`)

**Notes:**

- B8 depends on Batch 1 RLS being in place so the RPC can bypass it safely.
- B10 UI depends on Batch 3 RPC.

**Test After Batch:**

- [ ] Anonymous homepage visit → real non-zero counts
- [ ] Mobile menu open → tap nav link → menu closes, route changes
- [ ] Signup with auto-confirm on → user lands on `/listings`
- [ ] Signup with email confirmation on → user sees "Check your email"
- [ ] New message arrives while on any page → navbar badge updates without refresh

---

## Possible Issues (Verify During Batches)

Items not tied to a specific fix yet; verify and log findings while in adjacent batches. If a real issue is discovered, promote to a B-id and re-plan.

- V3 — Auto-scroll hijacks reading older messages in `ConversationPage` (verify during Batch 4)
- V4 — Neighbourhood reset on city toggle UX (verify during Batch 6)
- V5 — `.single()` on deleted landlord profile (verify during Batch 2/6)

---

## Execution Strategy

1. **Work batch by batch.** Do not mix batches in a single PR.
2. **One bug at a time inside a batch.** Commit per bug for clean revertability.
3. **Test after each fix.** Run the immediate flow (e.g., after B4, load 3 listings including one with null price).
4. **Run the batch test checklist before closing the batch.** If any box is unchecked, stay in the batch.
5. **Smoke the full Global Testing Checklist after every 2 batches.**
6. **Keep fixes minimal.** No drive-by refactors inside a batch.

---

## Priority Order

Execute batches in this order:

1. Pre-flight: B39 (lint config)
2. Batch 1 — Auth & Security (security fires first; everything else trusts this)
3. Batch 2 — Runtime Crash Safety (eliminate white screens before regression testing)
4. Batch 3 — Messaging DB Integrity (RPCs unlock Batches 4 and 10)
5. Batch 4 — Messaging UX & Hooks (consume RPCs from 3)
6. Batch 5 — Tenancy Atomicity (same RPC pattern as 3, no dependency)
7. Batch 6 — Listings Create / Edit & Uploads (core landlord flow)
8. Batch 7 — Listings Search & Display (core renter flow)
9. Batch 8 — Hooks & Auth Bootstrap Cleanup (perf + state hygiene)
10. Batch 9 — Profile & Storage (storage hardening; independent)
11. Batch 10 — UI / Navigation / Stats (polish and public-facing copy; depends on Batch 1 and 3)

**Why this order:** security and data integrity are non-negotiable and block trust; runtime crashes undermine any QA effort if not fixed next; messaging and tenancy are the product's core value loops; listings and profile come after; UI polish last because it's the cheapest to ship once the foundations are correct.

---

## Global Testing Checklist

After each pair of batches, walk the full journey:

- [ ] Sign up (renter, landlord) / email confirmation flow
- [ ] Login / logout
- [ ] Forgot password → reset password (including expired-link path)
- [ ] Create listing (all steps, with and without photos)
- [ ] Edit listing (photo add/remove, unit add/remove)
- [ ] Upload photos (valid, oversized, wrong type)
- [ ] Contact landlord (different units → different conversations)
- [ ] Messaging (send / receive / unread counter / realtime / polling fallback)
- [ ] Assign tenant → end tenancy → leave review → view reviews
- [ ] Analytics page loads (listings, prices, charts)
- [ ] Protected routes (`/create-listing`, `/profile`, `/messages`, `/listings/:id/edit`)
- [ ] Page refresh on each protected page (no redirect loops, no flicker)
- [ ] Mobile viewport (nav menu, slideshow, listing card, chat)
- [ ] No console errors (`npm run dev` + open DevTools)
- [ ] No failed API/Supabase calls in Network tab

---

## Notes

- Keep fixes minimal and targeted; do not refactor adjacent code inside a batch.
- Separate frontend vs backend work in the commit history (e.g., `feat(rls): ...`, `fix(ui): ...`) so rollbacks are surgical.
- Each Supabase migration gets a matching `down` or rollback note.
- For each batch, open one PR; keep diffs reviewable.

---

## Bug Index (Traceability)

All 39 confirmed + 7 possible items are covered. Pre-flight covers B39.

- Batch 1: B1, B11, B20, B23, V1, V7
- Batch 2: B4, B28, B29, B31
- Batch 3: B3, B5, B10 (server half), V2
- Batch 4: B2, B18, B24, B26, B33
- Batch 5: B6, B7, B37
- Batch 6: B13, B16, B21, B25, B32
- Batch 7: B14, B15, B27, B35, B36
- Batch 8: B17, B19
- Batch 9: B12, B22, B30, V6
- Batch 10: B8, B9, B10 (UI half), B34, B38
- Verify during batches: V3, V4, V5
- Pre-flight: B39
```

## On approval

On your confirmation, I will:

1. Create the single file `docs/superpowers/plans/bug-fix-plan.md` with the content above.
2. Run no other edits, no migrations, no code changes.
3. Report the created path back.
