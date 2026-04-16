# Tenancy-Based Review System

**Date:** 2026-04-15
**Status:** Approved

## Overview

A trustworthy, bidirectional review system for MapleNest where reviews are anchored to real tenancies. Landlords manage tenant assignments privately, and when a tenancy ends, both parties are prompted to review each other. Reviews use a staggered reveal — neither side sees the other's review until both have submitted or a 30-day window expires. Designed for PEI's small rental community where reputation and trust matter.

## Goals

- Promote honest, fair feedback between renters and landlords
- Tie every review to a real rental relationship (no drive-by ratings)
- Keep the review form fast — star rating, optional tags, optional comment
- Display useful reputation signals on profiles (average rating + top tags)
- Keep tenant-in-unit data private to landlords

## Non-Goals

- Rent tracking, lease documents, or maintenance requests
- Review replies or rebuttals
- Separate category star ratings (tags cover this)
- Automated content moderation (use existing reports system)
- Renter visibility into their unit assignment

---

## Part 1: Tenancy Management

### Data Model

```sql
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
```

**Constraints:**
- One active tenancy per unit: `UNIQUE(unit_id, status) WHERE status = 'active'` (partial unique index for whole-unit rentals)
- One active tenancy per room: `UNIQUE(room_id, status) WHERE status = 'active' AND room_id IS NOT NULL` (partial unique index for room rentals)
- `review_window_closes_at` is set to `move_out + 30 days` when status changes to `ended`

**RLS:**
- Landlords can read/write their own tenancies (`auth.uid() = landlord_id`)
- Renters can read tenancies where they are the renter (`auth.uid() = renter_id`) — full row access at the RLS level, but the **app query** only selects `id, status, move_in, move_out, listing_id, review_window_closes_at` for renters (never `unit_id` or `room_id`). Column-level restriction is enforced in the frontend query, not RLS.
- Public: no access

**Indexes:**
- `tenancies(listing_id)`
- `tenancies(unit_id) WHERE status = 'active'`
- `tenancies(renter_id)`
- `tenancies(landlord_id)`

### Assign Tenant Flow

**Trigger:** In a conversation view, if the logged-in user is the landlord of the linked listing and the listing has units, an "Assign to unit" button appears.

**Steps:**
1. Landlord clicks "Assign to unit"
2. A dropdown/modal shows available units (and rooms, for room-rental units) on that listing
3. Landlord selects a unit/room and sets a move-in date
4. On submit:
   - Insert a `tenancies` row with `status: 'active'`
   - Update the unit's `status` to `'rented'` (or room's `status` to `'occupied'`)
   - The conversation's `unit_id` and `room_id` are updated if not already set

**Validation:**
- Unit/room must be `available` (not already rented/occupied)
- Renter must be the `renter_id` on the conversation
- Landlord must be the `landlord_id` on the conversation

### End Tenancy Flow

**Trigger:** In the conversation view, if an active tenancy exists for this conversation, a tenancy info bar appears showing "Tenant: Unit 2A · since Jan 15, 2026" with an "End tenancy" button. Alternatively accessible from the unit editor on the listing.

**Steps:**
1. Landlord clicks "End tenancy"
2. A confirmation dialog asks for the move-out date (defaults to today)
3. On confirm:
   - Update tenancy: `status = 'ended'`, `move_out = <date>`, `review_window_closes_at = <date> + 30 days`
   - Update the unit's `status` to `'available'` (or room's `status` to `'available'`)
4. Both parties are now eligible to review each other for this tenancy

### Landlord-Only Visibility

- The tenancy info bar (tenant name, unit, move-in date) only renders for the landlord in the conversation view
- The renter sees no tenancy UI in the conversation — they only see the review prompt after a tenancy ends
- On the listing edit page, the unit editor shows a tenant indicator (e.g., small avatar or name) next to rented units — landlord only
- Public listing views show units as "Rented" or "Available" with no tenant information

---

## Part 2: Review System

### Data Model

Modify the existing `reviews` table:

```sql
-- Add new columns to existing reviews table
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS tenancy_id uuid REFERENCES public.tenancies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS visible boolean NOT NULL DEFAULT false;

-- New unique constraint: one review per person per tenancy
CREATE UNIQUE INDEX IF NOT EXISTS reviews_tenancy_reviewer_idx
  ON public.reviews(tenancy_id, reviewer_id)
  WHERE tenancy_id IS NOT NULL;
```

**Existing reviews (pre-tenancy):** Rows with `tenancy_id IS NULL` remain visible and count toward averages. They predate this system and are grandfathered in. The old `UNIQUE(reviewer_id, reviewee_id, listing_id)` constraint continues to cover them.

**New reviews:** Always require a `tenancy_id`. Always start with `visible = false`.

### Tag Sets

**Tags for reviewing a landlord** (renter writes):
- Positive: `"Responsive"`, `"Fair"`, `"Well-maintained property"`, `"Easy to deal with"`, `"Respectful"`
- Negative: `"Slow to respond"`, `"Unclear expectations"`, `"Poor maintenance"`, `"Difficult"`

**Tags for reviewing a renter** (landlord writes):
- Positive: `"Pays on time"`, `"Respectful"`, `"Clean"`, `"Easy to deal with"`, `"Great communicator"`
- Negative: `"Late payments"`, `"Unresponsive"`, `"Left property in poor condition"`, `"Difficult"`

Tags are defined in the frontend as constants — no tags table. Maximum 4 tags per review.

### Review Form

Presented as a compact card/modal:

1. **Star picker** (1-5, required) — reuse existing `StarPicker` component
2. **Tag chips** (optional, max 4) — tap to toggle, displayed as a flex-wrap grid. Positive tags in default style, negative tags in a subtly different style (e.g., gray border vs. regular)
3. **Comment textarea** (optional, 300 char max) — placeholder: "Anything else you'd like to share?"
4. **Submit button**

No scroll needed. Entire form fits in one viewport.

### Staggered Reveal Logic

**On review submit:**
1. Save the review with `visible: false`
2. Check if the other party has already reviewed for this tenancy
3. If yes → flip both reviews to `visible: true`, recalculate both profiles' `avg_rating` and `total_reviews`

**On profile view (expiry check):**
1. When loading reviews for a profile, query also checks for reviews where `visible = false` AND the associated tenancy's `review_window_closes_at < now()`
2. Any such reviews are flipped to `visible: true` and the profile aggregates are recalculated
3. This is a lazy/on-read check — no cron job needed

**Profile aggregate recalculation:**
```sql
UPDATE profiles SET
  total_reviews = (SELECT count(*) FROM reviews WHERE reviewee_id = <id> AND visible = true),
  avg_rating = (SELECT coalesce(avg(rating), 0) FROM reviews WHERE reviewee_id = <id> AND visible = true)
WHERE id = <id>;
```

This runs whenever a review becomes visible (either through mutual reveal or window expiry).

### Review Prompts

**For the renter:**
- In their messages inbox, conversations linked to ended tenancies show a banner: "Your stay at {listing title} has ended. Leave a review." with a button that opens the review form.
- The banner disappears once they've submitted or the 30-day window expires.

**For the landlord:**
- In the conversation view, after ending a tenancy, the tenancy info bar changes to: "Tenancy ended {date}. Leave a review." with a button.
- Also disappears after submission or window expiry.

**Review pending state:**
- After submitting, the reviewer sees: "Your review has been submitted. It will become visible once {other party} also submits, or after the review window closes on {date}."

---

## Part 3: Profile Display

### Rating Summary (on profile)

Existing display stays: average star rating + total review count.

**New addition — Top Tags:**
- Below the star rating, show the 3 most frequently selected tags as small badges
- Format: `"Pays on time" (6)` `"Respectful" (4)` `"Easy to deal with" (3)`
- Only show tags with 2+ mentions (avoids single-review bias)
- Computed from visible reviews only
- Tags are queried by unnesting the `tags` array and counting occurrences

### Review List (on profile, Reviews tab)

Each review card shows:
- Reviewer avatar + name
- Star rating
- Tag chips (small gray pills)
- Listing name + unit name, e.g., "Browns Court · Unit 2A"
- Comment (if any)
- Date

Reviews with `visible = false` are excluded from the list and aggregates.

### Listing Detail Page

No changes needed. The landlord card already shows `avg_rating` and star display. The aggregate updates automatically as reviews become visible.

---

## Part 4: Edge Cases & Guardrails

| Scenario | Behavior |
|---|---|
| Landlord tries to assign renter to already-rented unit | Blocked — unit must be `available` |
| Landlord ends tenancy for a unit with rooms | Ends tenancy for the specific room, room flips to `available` |
| Renter tries to access tenancy unit info | RLS blocks `unit_id`/`room_id` columns for renters |
| Review submitted after 30-day window | Blocked — form checks `review_window_closes_at` before showing |
| One party never submits a review | After 30 days, the submitted review auto-reveals on next profile view |
| Landlord creates fake tenancy to farm reviews | Tenancy requires a valid `conversation_id` with a real renter |
| Reviewer tries to edit their review | Not supported — reviews are immutable after submission |
| Old reviews (pre-tenancy system) | Grandfathered in: `tenancy_id IS NULL`, `visible = true`, keep counting |
| Tenancy deleted (listing deleted cascade) | Review stays with `tenancy_id = NULL` after cascade, remains visible |
| Landlord assigns tenant, then renter deletes account | Tenancy cascades on `renter_id` delete. A `BEFORE DELETE` trigger on `tenancies` flips the linked unit/room status back to `available` before the row is removed. |

### RLS Summary

**tenancies:**
- SELECT: `auth.uid() = landlord_id` (full row) OR `auth.uid() = renter_id` (limited columns via a view or select-list enforcement in app)
- INSERT: `auth.uid() = landlord_id`
- UPDATE: `auth.uid() = landlord_id`
- DELETE: not allowed (tenancies are ended, not deleted)

**reviews (modified):**
- SELECT: `visible = true` (public) — existing policy updated
- INSERT: `auth.uid() = reviewer_id AND reviewer_id != reviewee_id` — existing policy, plus app validates tenancy ownership
- UPDATE: not allowed for users (only system flips `visible`)

Note: The `visible` flag flip needs to bypass RLS. Options: use a Supabase database function (`rpc`) called by the app with `SECURITY DEFINER`, or handle it via a trigger on insert.

---

## Migration Strategy

1. Create `tenancies` table with indexes and RLS
2. Add `tenancy_id`, `tags`, `visible` columns to `reviews`
3. Set `visible = true` on all existing review rows (grandfathered)
4. Add new unique index on `reviews(tenancy_id, reviewer_id)`
5. Create a `reveal_reviews` database function (SECURITY DEFINER) that:
   - Takes a `tenancy_id`
   - Checks if both reviews exist, or if `review_window_closes_at < now()`
   - Flips `visible = true` on qualifying reviews
   - Recalculates affected profiles' `avg_rating` and `total_reviews`
6. Update RLS on `reviews` to filter `visible = true` for SELECT
7. Create a `BEFORE DELETE` trigger on `tenancies` that flips the linked unit/room status to `available` (handles account deletion cascade)

---

## Files Affected

**New files:**
- `supabase/migration_tenancies_reviews.sql` — migration script
- `src/components/tenancy/TenancyBar.jsx` — conversation tenancy info bar (landlord only)
- `src/components/tenancy/AssignTenantModal.jsx` — unit/room picker + move-in date
- `src/components/reviews/ReviewForm.jsx` — star picker + tags + comment
- `src/components/reviews/ReviewPromptBanner.jsx` — inbox/conversation review prompt

**Modified files:**
- `src/pages/ConversationPage.jsx` — add TenancyBar and review prompt for landlords
- `src/pages/MessagesInboxPage.jsx` — add review prompt banner for renters
- `src/pages/ProfilePage.jsx` — add top tags display, update review list to show tags + listing info, remove old open review form
- `src/pages/CreateListingPage.jsx` — show tenant indicator on rented units in editor (landlord only)
- `supabase/schema.sql` — add tenancies table, update reviews table
