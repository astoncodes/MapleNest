# Tenancy-Based Review System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a tenancy management layer and tenancy-anchored review system with staggered reveal for MapleNest.

**Architecture:** New `tenancies` table links renters to units via conversations. Reviews gain `tenancy_id`, `tags[]`, and `visible` columns. A `SECURITY DEFINER` database function handles the staggered reveal logic. Frontend adds tenancy management to ConversationPage (landlord-only) and review prompts to both conversation and inbox views.

**Tech Stack:** React 18, Supabase JS v2 (PostgREST + RPC), PostgreSQL (RLS, partial indexes, triggers), Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-04-15-tenancy-review-system-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|---|---|
| `supabase/migration_tenancies_reviews.sql` | Migration: tenancies table, reviews alterations, RLS, indexes, functions, triggers |
| `src/components/tenancy/AssignTenantModal.jsx` | Modal for landlord to pick unit/room + move-in date and create tenancy |
| `src/components/tenancy/TenancyBar.jsx` | Conversation info bar showing active/ended tenancy + action buttons (landlord only) |
| `src/components/reviews/ReviewForm.jsx` | Star picker + tag chips + comment textarea, used by both conversation and inbox prompts |
| `src/components/reviews/ReviewPromptBanner.jsx` | Banner shown in inbox/conversation prompting user to leave a review for ended tenancy |

### Modified Files
| File | Changes |
|---|---|
| `supabase/schema.sql` | Add tenancies table, update reviews table, new RLS policies, functions, triggers, indexes |
| `src/pages/ConversationPage.jsx` | Import TenancyBar + ReviewPromptBanner, fetch tenancy data, render landlord-only tenancy UI |
| `src/pages/MessagesInboxPage.jsx` | Fetch pending review tenancies, render ReviewPromptBanner for renters |
| `src/pages/ProfilePage.jsx` | Add top tags display, update review list with tags + listing info, remove old open review form |
| `src/pages/CreateListingPage.jsx` | Show tenant name indicator on rented unit chips (landlord only) |

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migration_tenancies_reviews.sql`
- Modify: `supabase/schema.sql`

- [ ] **Step 1: Create the migration file with tenancies table**

Create `supabase/migration_tenancies_reviews.sql`:

```sql
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
  v_reviewer_ids uuid[];
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
    -- Collect affected reviewer/reviewee IDs before update
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
```

- [ ] **Step 2: Update schema.sql with tenancies table and reviews alterations**

Add the tenancies table definition to `supabase/schema.sql` after the `listing_unit_rooms` table. Add the new columns to the reviews table definition. Add the new RLS policies, functions, triggers, and indexes to their respective sections. Replicate all the SQL from the migration file into the appropriate sections of schema.sql so that a fresh database creation works.

Key additions to schema.sql:
- `tenancies` table definition (after `listing_unit_rooms`)
- `tenancy_id uuid REFERENCES public.tenancies(id) ON DELETE SET NULL`, `tags text[] DEFAULT '{}'`, `visible boolean NOT NULL DEFAULT true` columns added to `reviews` table definition
- `ALTER TABLE public.tenancies ENABLE ROW LEVEL SECURITY;` in the RLS enable block
- Tenancy RLS policies in the policies section
- Updated reviews SELECT policy to `USING (visible = true)`
- New "Reviewers can see own reviews" policy
- `handle_tenancy_delete` function and trigger in the triggers section
- `reveal_reviews` and `expire_pending_reviews` functions in the functions section
- All tenancy indexes in the indexes section
- `reviews_tenancy_reviewer_idx` unique index

- [ ] **Step 3: Commit**

```bash
git add supabase/migration_tenancies_reviews.sql supabase/schema.sql
git commit -m "feat: add tenancies table and review system migration"
```

---

### Task 2: AssignTenantModal Component

**Files:**
- Create: `src/components/tenancy/AssignTenantModal.jsx`

**Dependencies:** Task 1 (migration must be applied for DB tables to exist)

- [ ] **Step 1: Create the AssignTenantModal component**

Create `src/components/tenancy/AssignTenantModal.jsx`:

```jsx
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

export default function AssignTenantModal({ listingId, renterId, conversationId, onAssigned, onClose }) {
  const [units, setUnits] = useState([])
  const [selectedUnitId, setSelectedUnitId] = useState('')
  const [selectedRoomId, setSelectedRoomId] = useState('')
  const [moveIn, setMoveIn] = useState(new Date().toISOString().split('T')[0])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const fetchUnits = async () => {
      const { data } = await supabase
        .from('listing_units')
        .select('id, unit_name, status, room_rental, listing_unit_rooms(id, room_name, status)')
        .eq('listing_id', listingId)
        .order('sort_order')
      setUnits(data || [])
    }
    fetchUnits()
  }, [listingId])

  useEffect(() => {
    const handleEscape = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [onClose])

  const selectedUnit = units.find(u => u.id === selectedUnitId)
  const availableRooms = selectedUnit?.room_rental
    ? (selectedUnit.listing_unit_rooms || []).filter(r => r.status === 'available')
    : []

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!selectedUnitId || !moveIn) return
    if (selectedUnit?.room_rental && !selectedRoomId) {
      setError('Please select a room.')
      return
    }

    setSaving(true)
    setError(null)

    const roomId = selectedUnit?.room_rental ? selectedRoomId : null

    // Get landlord_id from listing
    const { data: listing } = await supabase
      .from('listings')
      .select('landlord_id')
      .eq('id', listingId)
      .single()

    if (!listing) { setError('Listing not found.'); setSaving(false); return }

    // Insert tenancy
    const { data: tenancy, error: tenancyErr } = await supabase
      .from('tenancies')
      .insert({
        listing_id: listingId,
        unit_id: selectedUnitId,
        room_id: roomId,
        renter_id: renterId,
        landlord_id: listing.landlord_id,
        conversation_id: conversationId,
        move_in: moveIn,
        status: 'active',
      })
      .select()
      .single()

    if (tenancyErr) {
      setError(tenancyErr.code === '23505' ? 'This unit/room already has an active tenant.' : tenancyErr.message)
      setSaving(false)
      return
    }

    // Update unit/room status
    if (roomId) {
      await supabase.from('listing_unit_rooms').update({ status: 'occupied' }).eq('id', roomId)
    } else {
      await supabase.from('listing_units').update({ status: 'rented' }).eq('id', selectedUnitId)
    }

    // Update conversation unit/room context
    await supabase.from('conversations').update({
      unit_id: selectedUnitId,
      room_id: roomId,
    }).eq('id', conversationId)

    setSaving(false)
    onAssigned(tenancy)
  }

  // Filter to available units (whole-unit) or units with available rooms
  const availableUnits = units.filter(u => {
    if (u.room_rental) {
      return (u.listing_unit_rooms || []).some(r => r.status === 'available')
    }
    return u.status === 'available'
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="assign-tenant-title"
        onClick={e => e.stopPropagation()}
      >
        <h2 id="assign-tenant-title" className="text-lg font-semibold text-gray-900 mb-4">Assign Tenant to Unit</h2>

        {availableUnits.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm text-gray-500">No available units on this listing.</p>
            <button type="button" onClick={onClose}
              className="mt-4 text-sm text-gray-500 hover:text-gray-700">
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Unit</label>
              <select
                value={selectedUnitId}
                onChange={e => { setSelectedUnitId(e.target.value); setSelectedRoomId('') }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                required
              >
                <option value="">Select a unit...</option>
                {availableUnits.map(u => (
                  <option key={u.id} value={u.id}>{u.unit_name}{u.room_rental ? ' (room rental)' : ''}</option>
                ))}
              </select>
            </div>

            {selectedUnit?.room_rental && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Room</label>
                <select
                  value={selectedRoomId}
                  onChange={e => setSelectedRoomId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                  required
                >
                  <option value="">Select a room...</option>
                  {availableRooms.map(r => (
                    <option key={r.id} value={r.id}>{r.room_name}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Move-in date</label>
              <input
                type="date"
                value={moveIn}
                onChange={e => setMoveIn(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                required
              />
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <div className="flex gap-2 justify-end pt-2">
              <button type="button" onClick={onClose}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
                Cancel
              </button>
              <button type="submit" disabled={saving || !selectedUnitId}
                className="px-5 py-2 bg-red-700 text-white text-sm font-medium rounded-lg hover:bg-red-800 transition disabled:opacity-50">
                {saving ? 'Assigning...' : 'Assign Tenant'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/tenancy/AssignTenantModal.jsx
git commit -m "feat: add AssignTenantModal component"
```

---

### Task 3: TenancyBar Component

**Files:**
- Create: `src/components/tenancy/TenancyBar.jsx`

**Dependencies:** Task 2

- [ ] **Step 1: Create the TenancyBar component**

Create `src/components/tenancy/TenancyBar.jsx`:

```jsx
import { useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function TenancyBar({ tenancy, onEnded, onAssignClick }) {
  const [confirming, setConfirming] = useState(false)
  const [moveOut, setMoveOut] = useState(new Date().toISOString().split('T')[0])
  const [ending, setEnding] = useState(false)
  const [error, setError] = useState(null)

  // No tenancy and no assign capability — don't render
  if (!tenancy && !onAssignClick) return null

  // No active/ended tenancy — show assign button
  if (!tenancy) {
    return (
      <div className="bg-gray-50 border-b border-gray-200 px-4 py-2.5 flex items-center justify-between">
        <span className="text-xs text-gray-500">No tenant assigned</span>
        <button
          type="button"
          onClick={onAssignClick}
          className="text-xs font-medium text-red-700 hover:text-red-800"
        >
          Assign to unit
        </button>
      </div>
    )
  }

  const handleEndTenancy = async () => {
    if (!moveOut) return
    setEnding(true)
    setError(null)

    const windowCloses = new Date(moveOut)
    windowCloses.setDate(windowCloses.getDate() + 30)

    // Update tenancy
    const { error: tenancyErr } = await supabase
      .from('tenancies')
      .update({
        status: 'ended',
        move_out: moveOut,
        review_window_closes_at: windowCloses.toISOString(),
      })
      .eq('id', tenancy.id)

    if (tenancyErr) { setError(tenancyErr.message); setEnding(false); return }

    // Flip unit/room back to available
    if (tenancy.room_id) {
      await supabase.from('listing_unit_rooms').update({ status: 'available' }).eq('id', tenancy.room_id)
    } else {
      await supabase.from('listing_units').update({ status: 'available' }).eq('id', tenancy.unit_id)
    }

    setEnding(false)
    setConfirming(false)
    onEnded({ ...tenancy, status: 'ended', move_out: moveOut, review_window_closes_at: windowCloses.toISOString() })
  }

  // Active tenancy
  if (tenancy.status === 'active') {
    const moveInDate = new Date(tenancy.move_in).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })

    return (
      <div className="bg-green-50 border-b border-green-200 px-4 py-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-green-800">
            Tenant: <strong>{tenancy.unit?.unit_name || 'Unit'}</strong>
            {tenancy.room?.room_name ? ` / ${tenancy.room.room_name}` : ''}
            {' '}· since {moveInDate}
          </span>
          {!confirming && (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="text-xs font-medium text-green-700 hover:text-green-900"
            >
              End tenancy
            </button>
          )}
        </div>

        {confirming && (
          <div className="mt-2 flex items-center gap-2">
            <label className="text-xs text-gray-500">Move-out date:</label>
            <input
              type="date"
              value={moveOut}
              onChange={e => setMoveOut(e.target.value)}
              className="border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-red-300"
            />
            <button type="button" onClick={handleEndTenancy} disabled={ending}
              className="text-xs font-medium text-red-700 hover:text-red-800 disabled:opacity-50">
              {ending ? 'Ending...' : 'Confirm'}
            </button>
            <button type="button" onClick={() => setConfirming(false)}
              className="text-xs text-gray-400 hover:text-gray-600">
              Cancel
            </button>
            {error && <span className="text-xs text-red-600">{error}</span>}
          </div>
        )}
      </div>
    )
  }

  // Ended tenancy — handled by ReviewPromptBanner
  return null
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/tenancy/TenancyBar.jsx
git commit -m "feat: add TenancyBar component for conversation view"
```

---

### Task 4: ReviewForm Component

**Files:**
- Create: `src/components/reviews/ReviewForm.jsx`

**Dependencies:** Task 1

- [ ] **Step 1: Create the ReviewForm component**

Create `src/components/reviews/ReviewForm.jsx`:

```jsx
import { useState } from 'react'
import { supabase } from '../../lib/supabase'

const LANDLORD_TAGS = {
  positive: ['Responsive', 'Fair', 'Well-maintained property', 'Easy to deal with', 'Respectful'],
  negative: ['Slow to respond', 'Unclear expectations', 'Poor maintenance', 'Difficult'],
}

const RENTER_TAGS = {
  positive: ['Pays on time', 'Respectful', 'Clean', 'Easy to deal with', 'Great communicator'],
  negative: ['Late payments', 'Unresponsive', 'Left property in poor condition', 'Difficult'],
}

function StarPicker({ value, onChange }) {
  const [hover, setHover] = useState(0)
  return (
    <span className="inline-flex gap-1">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button"
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(n)}
          className="text-2xl transition-transform hover:scale-110 focus:outline-none">
          <span className={(hover || value) >= n ? 'text-amber-400' : 'text-gray-200'}>★</span>
        </button>
      ))}
    </span>
  )
}

export default function ReviewForm({ tenancyId, reviewerId, revieweeId, listingId, reviewingRole, onSubmitted, onCancel }) {
  // reviewingRole: 'landlord' means we're reviewing a landlord (renter writes), 'renter' means reviewing a renter
  const tags = reviewingRole === 'landlord' ? LANDLORD_TAGS : RENTER_TAGS
  const [rating, setRating] = useState(0)
  const [selectedTags, setSelectedTags] = useState([])
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const toggleTag = (tag) => {
    setSelectedTags(prev => {
      if (prev.includes(tag)) return prev.filter(t => t !== tag)
      if (prev.length >= 4) return prev // max 4
      return [...prev, tag]
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!rating) { setError('Please select a star rating.'); return }

    setSaving(true)
    setError(null)

    const { error: insertErr } = await supabase
      .from('reviews')
      .insert({
        tenancy_id: tenancyId,
        reviewer_id: reviewerId,
        reviewee_id: revieweeId,
        listing_id: listingId,
        rating,
        tags: selectedTags,
        comment: comment.trim() || null,
        visible: false,
      })

    if (insertErr) {
      setError(insertErr.code === '23505' ? 'You have already submitted a review for this tenancy.' : insertErr.message)
      setSaving(false)
      return
    }

    // Try to reveal (if both reviews now exist)
    await supabase.rpc('reveal_reviews', { p_tenancy_id: tenancyId })

    setSaving(false)
    onSubmitted()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-2">Rating</label>
        <StarPicker value={rating} onChange={setRating} />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-2">
          Tags <span className="text-gray-400">(optional, up to 4)</span>
        </label>
        <div className="flex flex-wrap gap-1.5">
          {tags.positive.map(tag => (
            <button key={tag} type="button" onClick={() => toggleTag(tag)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${
                selectedTags.includes(tag)
                  ? 'bg-green-100 text-green-800 border border-green-300'
                  : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
              }`}>
              {tag}
            </button>
          ))}
          {tags.negative.map(tag => (
            <button key={tag} type="button" onClick={() => toggleTag(tag)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${
                selectedTags.includes(tag)
                  ? 'bg-red-100 text-red-800 border border-red-300'
                  : 'bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100'
              }`}>
              {tag}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Comment <span className="text-gray-400">(optional)</span></label>
        <textarea
          rows={3}
          value={comment}
          onChange={e => setComment(e.target.value)}
          maxLength={300}
          placeholder="Anything else you'd like to share?"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
        />
        <p className="text-xs text-gray-400 text-right mt-0.5">{comment.length}/300</p>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex gap-2 justify-end">
        {onCancel && (
          <button type="button" onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
            Cancel
          </button>
        )}
        <button type="submit" disabled={saving || !rating}
          className="px-5 py-2 bg-red-700 text-white text-sm font-medium rounded-lg hover:bg-red-800 transition disabled:opacity-50">
          {saving ? 'Submitting...' : 'Submit Review'}
        </button>
      </div>
    </form>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/reviews/ReviewForm.jsx
git commit -m "feat: add ReviewForm component with tags and staggered reveal"
```

---

### Task 5: ReviewPromptBanner Component

**Files:**
- Create: `src/components/reviews/ReviewPromptBanner.jsx`

**Dependencies:** Task 4

- [ ] **Step 1: Create the ReviewPromptBanner component**

Create `src/components/reviews/ReviewPromptBanner.jsx`:

```jsx
import { useState } from 'react'
import ReviewForm from './ReviewForm'

export default function ReviewPromptBanner({
  tenancy,
  currentUserId,
  hasSubmittedReview,
  reviewWindowClosesAt,
  listingTitle,
  onReviewSubmitted,
}) {
  const [showForm, setShowForm] = useState(false)

  // Don't show if already reviewed
  if (hasSubmittedReview) {
    const dateStr = reviewWindowClosesAt
      ? new Date(reviewWindowClosesAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
      : null
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-500">
        Your review has been submitted. It will become visible once the other party also submits
        {dateStr ? `, or after the review window closes on ${dateStr}.` : '.'}
      </div>
    )
  }

  // Don't show if window expired
  if (reviewWindowClosesAt && new Date(reviewWindowClosesAt) < new Date()) return null

  // Don't show if tenancy not ended
  if (tenancy.status !== 'ended') return null

  const isRenter = currentUserId === tenancy.renter_id
  const revieweeId = isRenter ? tenancy.landlord_id : tenancy.renter_id
  const reviewingRole = isRenter ? 'landlord' : 'renter'

  if (showForm) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">
          Leave a review{listingTitle ? ` for ${listingTitle}` : ''}
        </h3>
        <ReviewForm
          tenancyId={tenancy.id}
          reviewerId={currentUserId}
          revieweeId={revieweeId}
          listingId={tenancy.listing_id}
          reviewingRole={reviewingRole}
          onSubmitted={() => {
            setShowForm(false)
            onReviewSubmitted()
          }}
          onCancel={() => setShowForm(false)}
        />
      </div>
    )
  }

  const moveOutDate = tenancy.move_out
    ? new Date(tenancy.move_out).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center justify-between">
      <p className="text-sm text-amber-800">
        {isRenter
          ? `Your stay at ${listingTitle || 'this listing'} ended${moveOutDate ? ` on ${moveOutDate}` : ''}. Leave a review.`
          : `Tenancy ended${moveOutDate ? ` ${moveOutDate}` : ''}. Leave a review.`
        }
      </p>
      <button
        type="button"
        onClick={() => setShowForm(true)}
        className="text-sm font-medium text-amber-800 hover:text-amber-900 whitespace-nowrap ml-2"
      >
        Write review
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/reviews/ReviewPromptBanner.jsx
git commit -m "feat: add ReviewPromptBanner component"
```

---

### Task 6: Wire Tenancy + Review UI into ConversationPage

**Files:**
- Modify: `src/pages/ConversationPage.jsx`

**Dependencies:** Tasks 2, 3, 5

- [ ] **Step 1: Add tenancy imports and state**

At the top of `src/pages/ConversationPage.jsx`, add imports after the existing imports:

```jsx
import TenancyBar from '../components/tenancy/TenancyBar'
import AssignTenantModal from '../components/tenancy/AssignTenantModal'
import ReviewPromptBanner from '../components/reviews/ReviewPromptBanner'
```

Inside the `ConversationPage` component, after the existing state declarations (after line 42 `const lastMessageAtRef = useRef(null)`), add:

```jsx
  const [tenancy, setTenancy] = useState(null)
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [hasSubmittedReview, setHasSubmittedReview] = useState(false)
```

- [ ] **Step 2: Fetch tenancy data after conversation loads**

Add a new `useEffect` after the conversation initialization effect (after the `// Scroll to bottom when messages change` effect). This fetches the tenancy for the current conversation when the user is the landlord:

```jsx
  // Fetch tenancy for this conversation (landlord sees management, both see review prompts)
  useEffect(() => {
    if (!conversation?.id || isNew) return
    const fetchTenancy = async () => {
      // Fetch most recent tenancy for this conversation
      const { data } = await supabase
        .from('tenancies')
        .select('id, listing_id, unit_id, room_id, renter_id, landlord_id, conversation_id, move_in, move_out, status, review_window_closes_at, unit:unit_id(unit_name), room:room_id(room_name)')
        .eq('conversation_id', conversation.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (data) {
        setTenancy(data)
        // Check if current user already submitted a review for this tenancy
        const { data: existingReview } = await supabase
          .from('reviews')
          .select('id')
          .eq('tenancy_id', data.id)
          .eq('reviewer_id', user.id)
          .maybeSingle()
        setHasSubmittedReview(!!existingReview)
      }
    }
    fetchTenancy()
  }, [conversation?.id, isNew, user])
```

- [ ] **Step 3: Render TenancyBar and ReviewPromptBanner in the conversation view**

In the JSX return, between the header `</div>` (the one closing the header block around line 327) and the `{/* Messages */}` comment, add:

```jsx
      {/* Tenancy bar — landlord only */}
      {user.id === conversation?.landlord_id && conversation?.listing?.id && (
        <TenancyBar
          tenancy={tenancy?.status === 'active' ? tenancy : null}
          onEnded={(updated) => setTenancy(updated)}
          onAssignClick={() => setShowAssignModal(true)}
        />
      )}

      {/* Review prompt — both parties, after tenancy ends */}
      {tenancy?.status === 'ended' && (
        <div className="px-4 py-2 flex-shrink-0">
          <ReviewPromptBanner
            tenancy={tenancy}
            currentUserId={user.id}
            hasSubmittedReview={hasSubmittedReview}
            reviewWindowClosesAt={tenancy.review_window_closes_at}
            listingTitle={conversation?.listing?.title}
            onReviewSubmitted={() => setHasSubmittedReview(true)}
          />
        </div>
      )}
```

After the closing `</div>` of the entire component (before the last `}` of the function), add the assign modal:

```jsx
      {showAssignModal && conversation?.listing?.id && (
        <AssignTenantModal
          listingId={conversation.listing.id}
          renterId={conversation.renter_id}
          conversationId={conversation.id}
          onAssigned={(t) => {
            setTenancy({ ...t, unit: { unit_name: '' }, room: null })
            setShowAssignModal(false)
          }}
          onClose={() => setShowAssignModal(false)}
        />
      )}
```

Note: After assigning, the tenancy object won't have nested unit/room names. The TenancyBar will show "Unit" as a fallback. A page refresh loads the full data. This is acceptable for an edge case that happens once per tenancy.

- [ ] **Step 4: Commit**

```bash
git add src/pages/ConversationPage.jsx
git commit -m "feat: wire tenancy management and review prompts into ConversationPage"
```

---

### Task 7: Wire Review Prompt into MessagesInboxPage

**Files:**
- Modify: `src/pages/MessagesInboxPage.jsx`

**Dependencies:** Task 5

- [ ] **Step 1: Add imports and fetch pending review tenancies**

At the top of `src/pages/MessagesInboxPage.jsx`, add after the existing imports:

```jsx
import ReviewPromptBanner from '../components/reviews/ReviewPromptBanner'
```

Inside the `MessagesInboxPage` component, after the existing state declarations, add:

```jsx
  const [pendingReviews, setPendingReviews] = useState({}) // { conversationId: { tenancy, hasSubmitted } }
```

After the `fetchConversations` callback (before the `useEffect` that calls it), add a new function:

```jsx
  const fetchPendingReviews = useCallback(async () => {
    if (!user) return
    // Get ended tenancies where the current user is involved and review window is still open
    const { data: tenancies } = await supabase
      .from('tenancies')
      .select('id, listing_id, renter_id, landlord_id, conversation_id, move_out, status, review_window_closes_at')
      .eq('status', 'ended')
      .or(`renter_id.eq.${user.id},landlord_id.eq.${user.id}`)
      .gt('review_window_closes_at', new Date().toISOString())

    if (!tenancies?.length) return

    // Check which ones the user already reviewed
    const tenancyIds = tenancies.map(t => t.id)
    const { data: existingReviews } = await supabase
      .from('reviews')
      .select('tenancy_id')
      .eq('reviewer_id', user.id)
      .in('tenancy_id', tenancyIds)

    const reviewedSet = new Set((existingReviews || []).map(r => r.tenancy_id))

    const map = {}
    for (const t of tenancies) {
      if (t.conversation_id) {
        map[t.conversation_id] = { tenancy: t, hasSubmitted: reviewedSet.has(t.id) }
      }
    }
    setPendingReviews(map)
  }, [user])
```

Update the existing `useEffect` that calls `fetchConversations` to also call `fetchPendingReviews`:

```jsx
  useEffect(() => {
    if (!user) return
    fetchConversations()
    fetchPendingReviews()
  }, [fetchConversations, fetchPendingReviews, user])
```

- [ ] **Step 2: Render review prompt banners in the conversation list**

Inside the conversation `.map()` block, after the closing `</Link>` tag for each conversation and before the next iteration, add a review banner. Wrap the existing `<Link>` and the new banner in a `<div>`:

Replace the entire `{conversations.map(convo => { ... })}` block with:

```jsx
          {conversations.map(convo => {
            const isRenter = user.id === convo.renter?.id
            const other = isRenter ? convo.landlord : convo.renter
            const unread = isRenter ? (convo.renter_unread || 0) : (convo.landlord_unread || 0)
            const listingImage = convo.listing?.listing_images?.find(i => i.is_primary) || convo.listing?.listing_images?.[0]
            const pending = pendingReviews[convo.id]

            return (
              <div key={convo.id} className="space-y-1.5">
                <Link
                  to={`/messages/${convo.id}`}
                  className="flex items-center gap-3 bg-white rounded-xl border border-gray-100 shadow-sm p-4 hover:shadow-md transition-all"
                >
                  <Avatar profile={other} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-sm text-gray-900 truncate">
                        {other?.full_name || other?.email || 'User'}
                      </p>
                      <span className="text-xs text-gray-400 flex-shrink-0">{timeAgo(convo.last_message_at)}</span>
                    </div>
                    <p className="text-xs text-gray-500 truncate mt-0.5">
                      {convo.listing?.title || 'Listing'}
                      {convo.unit?.unit_name ? ` · ${convo.unit.unit_name}` : ''}
                      {convo.unit?.unit_name && convo.room?.room_name ? ` / ${convo.room.room_name}` : ''}
                      {convo.listing?.city ? ` · ${convo.listing.city}` : ''}
                    </p>
                    <p className={`text-xs truncate mt-0.5 ${unread > 0 ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>
                      {convo.last_message || 'No messages yet'}
                    </p>
                  </div>
                  {listingImage && (
                    <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
                      <img src={listingImage.url} alt="" loading="lazy" className="w-full h-full object-cover" />
                    </div>
                  )}
                  {unread > 0 && (
                    <div className="w-5 h-5 bg-red-600 text-white text-xs rounded-full flex items-center justify-center font-bold flex-shrink-0">
                      {unread > 9 ? '9+' : unread}
                    </div>
                  )}
                </Link>
                {pending && !pending.hasSubmitted && (
                  <ReviewPromptBanner
                    tenancy={pending.tenancy}
                    currentUserId={user.id}
                    hasSubmittedReview={pending.hasSubmitted}
                    reviewWindowClosesAt={pending.tenancy.review_window_closes_at}
                    listingTitle={convo.listing?.title}
                    onReviewSubmitted={() => {
                      setPendingReviews(prev => ({
                        ...prev,
                        [convo.id]: { ...prev[convo.id], hasSubmitted: true },
                      }))
                    }}
                  />
                )}
              </div>
            )
          })}
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/MessagesInboxPage.jsx
git commit -m "feat: wire review prompts into MessagesInboxPage for renters"
```

---

### Task 8: Update ProfilePage — Tags Display, Review List, Remove Old Form

**Files:**
- Modify: `src/pages/ProfilePage.jsx`

**Dependencies:** Task 1

- [ ] **Step 1: Update the reviews fetch to include tags and listing info**

In the `fetchAll` function, update the reviews query (currently at line 121):

Replace:
```jsx
        supabase.from('reviews').select('*, reviewer:reviewer_id(full_name, avatar_url, email)')
          .eq('reviewee_id', viewingId).order('created_at', { ascending: false }),
```

With:
```jsx
        supabase.from('reviews').select('*, reviewer:reviewer_id(full_name, avatar_url, email), tenancy:tenancy_id(listing:listing_id(title), unit:unit_id(unit_name))')
          .eq('reviewee_id', viewingId).eq('visible', true).order('created_at', { ascending: false }),
```

Also, at the start of `fetchAll`, call the expiry function to reveal any reviews past their window:

```jsx
    // Lazy-expire any reviews past their window for this profile
    await supabase.rpc('expire_pending_reviews', { p_profile_id: viewingId })
```

- [ ] **Step 2: Add top tags computation and display**

After the `avgRating` calculation (around line 238), add:

```jsx
  // Compute top tags from visible reviews
  const tagCounts = {}
  reviews.forEach(r => {
    (r.tags || []).forEach(tag => {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1
    })
  })
  const topTags = Object.entries(tagCounts)
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
```

In the profile header, after the existing star rating display (around line 327-332), add the top tags:

```jsx
              {topTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {topTags.map(([tag, count]) => (
                    <span key={tag} className="inline-flex items-center gap-1 bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">
                      {tag} <span className="text-gray-400">({count})</span>
                    </span>
                  ))}
                </div>
              )}
```

- [ ] **Step 3: Update review list to show tags and listing info**

In the reviews tab review list (around line 406-418), update each review card to show tags and listing context. Replace the inner content of the `reviews.map(r => ...)` block:

```jsx
                {reviews.map(r => (
                  <div key={r.id} className="pb-4 border-b border-gray-50 last:border-0">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-500">
                        {(r.reviewer?.full_name || r.reviewer?.email || '?').charAt(0).toUpperCase()}
                      </div>
                      <span className="text-sm font-medium text-gray-700">{r.reviewer?.full_name || 'Anonymous'}</span>
                      <StarRating rating={r.rating} />
                      <span className="text-xs text-gray-400 ml-auto">{new Date(r.created_at).toLocaleDateString('en-CA')}</span>
                    </div>
                    {r.tenancy?.listing?.title && (
                      <p className="text-xs text-gray-400 ml-9 mb-1">
                        {r.tenancy.listing.title}
                        {r.tenancy.unit?.unit_name ? ` · ${r.tenancy.unit.unit_name}` : ''}
                      </p>
                    )}
                    {r.tags?.length > 0 && (
                      <div className="flex flex-wrap gap-1 ml-9 mb-1">
                        {r.tags.map(tag => (
                          <span key={tag} className="bg-gray-100 text-gray-500 text-xs px-2 py-0.5 rounded-full">{tag}</span>
                        ))}
                      </div>
                    )}
                    {r.comment && <p className="text-sm text-gray-600 ml-9">{r.comment}</p>}
                  </div>
                ))}
```

- [ ] **Step 4: Remove the old open review form**

Delete the entire `{/* Leave a review */}` section (lines 423-449 approximately). This is the `{!isOwn && user && !hasReviewed && ( <Section title="Leave a Review">` block. New reviews now come only through the tenancy flow.

Also remove the review form state variables that are no longer needed:
- `const [reviewForm, setReviewForm] = useState({ rating: 0, comment: '' })` (line 108)
- `const [reviewLoading, setReviewLoading] = useState(false)` (line 109)
- `const [reviewError, setReviewError] = useState(null)` (line 110)
- `const [reviewSuccess, setReviewSuccess] = useState(false)` (line 111)
- `const [hasReviewed, setHasReviewed] = useState(false)` (line 112)
- The `hasReviewed` check inside `fetchAll` (line 132)
- The entire `handleSubmitReview` function (lines 202-221)

Keep `StarRating` (used in review display) and `StarPicker` (no longer used here but harmless — or remove if desired).

- [ ] **Step 5: Commit**

```bash
git add src/pages/ProfilePage.jsx
git commit -m "feat: update ProfilePage with top tags, listing context in reviews, remove old review form"
```

---

### Task 9: Show Tenant Indicator on Unit Chips in CreateListingPage

**Files:**
- Modify: `src/pages/CreateListingPage.jsx`

**Dependencies:** Task 1

- [ ] **Step 1: Fetch active tenancies for the listing's units**

In `src/pages/CreateListingPage.jsx`, inside the edit-mode unit-fetching `useEffect` (the one that fetches units when `listingId` is set), add a fetch for active tenancies. Find the existing units fetch (around line 113 where it fetches `listing_units`) and after it resolves, add:

```jsx
        // Fetch active tenancies for these units (landlord only)
        if (!isRenter && data?.length) {
          const { data: tenancyData } = await supabase
            .from('tenancies')
            .select('id, unit_id, room_id, renter:renter_id(full_name)')
            .eq('listing_id', listingId)
            .eq('status', 'active')
          setTenancies(tenancyData || [])
        }
```

Add state for tenancies near the other state declarations in the component:

```jsx
  const [tenancies, setTenancies] = useState([])
```

- [ ] **Step 2: Show tenant name on rented unit chips**

In the unit chips rendering (Step 4 of the form, around line 711 inside the `units.map()`), after the `isFull` badge line and before the Edit button, add:

```jsx
                        {(() => {
                          const t = tenancies.find(t => t.unit_id === unit.id)
                          if (t?.renter?.full_name) {
                            return <span className="text-xs text-gray-400">· {t.renter.full_name}</span>
                          }
                          return null
                        })()}
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/CreateListingPage.jsx
git commit -m "feat: show tenant name indicator on unit chips in listing editor"
```

---

### Task 10: Final Integration — Verify and Fix Cross-Cutting Issues

**Files:**
- Possibly modify: Any file with issues found

**Dependencies:** All previous tasks

- [ ] **Step 1: Verify the build succeeds**

```bash
npm run build
```

Expected: Build completes with no errors.

- [ ] **Step 2: Check all imports resolve**

Verify that:
- `src/components/tenancy/AssignTenantModal.jsx` exists and exports default
- `src/components/tenancy/TenancyBar.jsx` exists and exports default
- `src/components/reviews/ReviewForm.jsx` exists and exports default
- `src/components/reviews/ReviewPromptBanner.jsx` exists and exports default
- `ConversationPage.jsx` imports all three tenancy/review components
- `MessagesInboxPage.jsx` imports `ReviewPromptBanner`
- `ProfilePage.jsx` no longer imports or references removed review form state/handler

- [ ] **Step 3: Verify schema.sql is in sync with migration**

Check that `supabase/schema.sql` contains:
- `tenancies` table definition
- `tenancy_id`, `tags`, `visible` columns in `reviews` table
- All tenancy RLS policies
- Updated reviews SELECT policy with `visible = true`
- `reveal_reviews` and `expire_pending_reviews` functions
- `handle_tenancy_delete` trigger
- All tenancy indexes

- [ ] **Step 4: Fix any issues found and commit**

```bash
git add -A
git commit -m "fix: address integration issues for tenancy review system"
```

---

## Reminder: User Must Run Migration

After all tasks are complete, remind the user to run `supabase/migration_tenancies_reviews.sql` in the Supabase SQL Editor. The migration creates the `tenancies` table, alters the `reviews` table, and installs the database functions and triggers needed for the staggered reveal logic.
