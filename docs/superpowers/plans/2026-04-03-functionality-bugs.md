# Functionality Bug Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix six broken features: double fetch, search scope, view count race, edit listing form, messaging pages, and report button.

**Architecture:** All frontend changes in React/Vite. Two SQL migrations needed (increment_views RPC + missing RLS policies for conversations/messages). No test framework exists in this project — verification is manual via `npm run dev`.

**Tech Stack:** React 18, Vite, Supabase JS v2, React Router v6, Tailwind CSS

---

## File Map

| File | Action | What changes |
|------|--------|-------------|
| `src/pages/ListingsPage.jsx` | Modify | Remove double fetch; extend search to title+neighbourhood+description |
| `src/pages/ListingDetailPage.jsx` | Modify | Use RPC for view count; add report modal |
| `src/pages/EditListingPage.jsx` | Modify | Fetch `listing_images` so edit mode gets photo data |
| `src/pages/CreateListingPage.jsx` | Modify | Accept `mode`/`listing`/`onSubmitSuccess` props; seed form in edit; update vs insert on submit; manage existing images |
| `src/pages/MessagesInboxPage.jsx` | Create | Conversations list for current user |
| `src/pages/ConversationPage.jsx` | Create | Thread view, send input, real-time subscription |
| `src/App.jsx` | Modify | Add `/messages` and `/messages/:id` protected routes |
| `src/components/shared/Navbar.jsx` | Modify | Add Messages link with unread badge |
| `supabase/migration_increment_views.sql` | Create | `increment_views` RPC |
| `supabase/migration_messages_rls.sql` | Create | UPDATE policies for `conversations` and `messages` tables |

---

## Task 1: Fix Double Fetch + Search Scope in ListingsPage

**Files:**
- Modify: `src/pages/ListingsPage.jsx`

- [ ] **Step 1: Remove direct `fetchListings()` call from `handleSearch`**

In `src/pages/ListingsPage.jsx`, the `handleSearch` function both updates `searchParams` (which triggers the `useEffect`) AND calls `fetchListings()` directly — causing two fetches. Remove the direct call.

Replace the entire `handleSearch` function (lines 171–182):
```js
const handleSearch = (e) => {
  e.preventDefault()
  const next = search.trim()
  const params = Object.fromEntries([...searchParams])
  if (next) {
    params.q = next
  } else {
    delete params.q
  }
  setSearchParams(params, { replace: true })
  // Do NOT call fetchListings() here — the useEffect([filters, queryFromParams]) handles it
}
```

- [ ] **Step 2: Extend search to cover neighbourhood and description**

In `fetchListings`, replace:
```js
if (search?.trim())
  query = query.ilike('title', `%${search.trim()}%`);
```
With:
```js
if (search?.trim()) {
  const q = search.trim()
  query = query.or(`title.ilike.%${q}%,neighbourhood.ilike.%${q}%,description.ilike.%${q}%`)
}
```

- [ ] **Step 3: Verify in browser**

Run `npm run dev`. Go to `/listings`, search for a neighbourhood name (e.g. "Sherwood"). Results should appear. Open Network tab — only one request should fire per search.

- [ ] **Step 4: Commit**
```bash
git add src/pages/ListingsPage.jsx
git commit -m "fix: remove double fetch on search and extend search to neighbourhood and description"
```

---

## Task 2: Add SQL Migrations

**Files:**
- Create: `supabase/migration_increment_views.sql`
- Create: `supabase/migration_messages_rls.sql`

- [ ] **Step 1: Create `migration_increment_views.sql`**

Create `supabase/migration_increment_views.sql`:
```sql
-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New query
-- Adds an atomic increment_views RPC to avoid race conditions when multiple
-- users view the same listing simultaneously.

CREATE OR REPLACE FUNCTION public.increment_views(p_listing_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.listings SET views = views + 1 WHERE id = p_listing_id;
$$;

GRANT EXECUTE ON FUNCTION public.increment_views(uuid) TO authenticated, anon;
```

- [ ] **Step 2: Create `migration_messages_rls.sql`**

The `conversations` table has no UPDATE policy, and `messages` has no UPDATE policy. Without these, the conversation page cannot update `last_message`/unread counts, and cannot mark messages as read.

Create `supabase/migration_messages_rls.sql`:
```sql
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
```

- [ ] **Step 3: Run both migrations in Supabase dashboard**

Go to Supabase Dashboard → SQL Editor. Run each file's contents in a new query. Verify no errors.

- [ ] **Step 4: Commit**
```bash
git add supabase/migration_increment_views.sql supabase/migration_messages_rls.sql
git commit -m "feat: add increment_views RPC and missing RLS policies for messaging"
```

---

## Task 3: Atomic View Count + Report Modal in ListingDetailPage

**Files:**
- Modify: `src/pages/ListingDetailPage.jsx`

- [ ] **Step 1: Replace client-side view count with RPC call**

In `fetchListing`, find:
```js
// Increment view count (fire and forget)
supabase.from('listings').update({ views: (data.views || 0) + 1 }).eq('id', id)
```
Replace with:
```js
// Atomic increment — avoids race condition under concurrent views
supabase.rpc('increment_views', { p_listing_id: id })
```

**Why:** The old code reads `views` client-side and writes `views + 1`. If two users load the page at the same time, both read the same number and both write the same incremented value — one increment is lost. The RPC does `SET views = views + 1` inside the database atomically.

- [ ] **Step 2: Add report modal state at the top of the component**

After the existing state declarations (`contacting`, `contactError`, etc.), add:
```js
const [reportOpen, setReportOpen] = useState(false)
const [reportReason, setReportReason] = useState('')
const [reportDetails, setReportDetails] = useState('')
const [reportSubmitting, setReportSubmitting] = useState(false)
const [reportDone, setReportDone] = useState(false)
const [reportError, setReportError] = useState(null)
```

- [ ] **Step 3: Add `handleReport` function**

Add after `handleContact`:
```js
const handleReport = async () => {
  if (!reportReason) return
  setReportSubmitting(true)
  setReportError(null)
  const { error } = await supabase.from('reports').insert({
    reporter_id: user.id,
    listing_id: listing.id,
    reason: reportReason,
    details: reportDetails || null,
  })
  setReportSubmitting(false)
  if (error) {
    setReportError('Could not submit report. Please try again.')
  } else {
    setReportDone(true)
    setReportOpen(false)
  }
}
```

- [ ] **Step 4: Replace the no-op report button with the modal trigger + modal**

Find (near the bottom of the JSX):
```jsx
<button className="w-full text-xs text-gray-400 hover:text-gray-500 text-center py-2 transition">
  🚩 Report this listing
</button>
```

Replace with:
```jsx
{reportDone ? (
  <p className="text-xs text-gray-400 text-center py-2">✓ Report submitted</p>
) : (
  <button
    onClick={() => {
      if (!user) { navigate('/login'); return }
      setReportOpen(true)
    }}
    className="w-full text-xs text-gray-400 hover:text-gray-500 text-center py-2 transition"
  >
    🚩 Report this listing
  </button>
)}

{reportOpen && (
  <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center px-4">
    <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 space-y-4">
      <h3 className="font-semibold text-gray-900">Report Listing</h3>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Reason *</label>
        <select
          value={reportReason}
          onChange={e => setReportReason(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
        >
          <option value="">Select a reason...</option>
          <option value="spam">Spam or duplicate</option>
          <option value="misleading">Misleading information</option>
          <option value="wrong_price">Wrong price listed</option>
          <option value="already_rented">Already rented</option>
          <option value="inappropriate">Inappropriate content</option>
          <option value="scam">Suspected scam</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Details (optional)</label>
        <textarea
          rows={3}
          value={reportDetails}
          onChange={e => setReportDetails(e.target.value)}
          placeholder="Any additional context..."
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
        />
      </div>
      {reportError && <p className="text-xs text-red-600">{reportError}</p>}
      <div className="flex gap-2">
        <button
          onClick={handleReport}
          disabled={!reportReason || reportSubmitting}
          className="flex-1 bg-red-700 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-red-800 transition disabled:opacity-50"
        >
          {reportSubmitting ? 'Submitting...' : 'Submit Report'}
        </button>
        <button
          onClick={() => { setReportOpen(false); setReportReason(''); setReportDetails('') }}
          className="flex-1 border border-gray-200 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 5: Verify in browser**

Load a listing detail page. The 🚩 button should open the modal. Submitting a reason should insert a row in the `reports` table (check Supabase Table Editor). The button should then show "✓ Report submitted".

- [ ] **Step 6: Commit**
```bash
git add src/pages/ListingDetailPage.jsx
git commit -m "fix: atomic view count via RPC and wire up report modal"
```

---

## Task 4: EditListingPage — Fetch listing_images

**Files:**
- Modify: `src/pages/EditListingPage.jsx`

- [ ] **Step 1: Update the `select` call to include `listing_images`**

`CreateListingPage` in edit mode needs to show existing photos. `EditListingPage` fetches the listing but doesn't include images. Fix the query:

Find:
```js
const { data, error } = await supabase
  .from('listings')
  .select('*')
  .eq('id', id)
  .single()
```
Replace with:
```js
const { data, error } = await supabase
  .from('listings')
  .select('*, listing_images(id, url, is_primary, sort_order, storage_path)')
  .eq('id', id)
  .single()
```

- [ ] **Step 2: Commit**
```bash
git add src/pages/EditListingPage.jsx
git commit -m "fix: fetch listing_images in EditListingPage so edit form can display existing photos"
```

---

## Task 5: Edit Mode Support in CreateListingPage

**Files:**
- Modify: `src/pages/CreateListingPage.jsx`

**Why this is broken:** `EditListingPage` renders `<CreateListingPage mode="edit" listing={data} onSubmitSuccess={...} />` but `CreateListingPage` is defined as `function CreateListingPage()` — no props. The form always starts blank and always does an `insert`, ignoring any existing listing data.

- [ ] **Step 1: Accept props in the function signature**

Change:
```js
export default function CreateListingPage() {
```
To:
```js
export default function CreateListingPage({ mode = 'create', listing = null, onSubmitSuccess }) {
```

- [ ] **Step 2: Add state for existing images**

After `const [uploadProgress, setUploadProgress] = useState(null)`, add:
```js
const [existingImages, setExistingImages] = useState([])
const [removedImageIds, setRemovedImageIds] = useState([])
```

- [ ] **Step 3: Seed form state from listing prop in edit mode**

Add this `useEffect` after all the `useState` declarations:
```js
useEffect(() => {
  if (mode === 'edit' && listing) {
    setForm({
      title: listing.title || '',
      description: listing.description || '',
      property_type: listing.property_type || '',
      city: listing.city || 'Charlottetown',
      neighbourhood: listing.neighbourhood || '',
      address: listing.address || '',
      price: listing.price ? String(listing.price) : '',
      utilities_included: listing.utilities_included || false,
      bedrooms: listing.bedrooms || 1,
      bathrooms: listing.bathrooms || 1,
      square_feet: listing.square_feet ? String(listing.square_feet) : '',
      available_from: listing.available_from || '',
      lease_term: listing.lease_term || '1_year',
      pet_friendly: listing.pet_friendly || false,
      parking_available: listing.parking_available || false,
      laundry: listing.laundry || 'none',
      furnished: listing.furnished || false,
    })
    setExistingImages(
      [...(listing.listing_images || [])].sort((a, b) => {
        if (a.is_primary && !b.is_primary) return -1
        if (!a.is_primary && b.is_primary) return 1
        return a.sort_order - b.sort_order
      })
    )
  }
}, [mode, listing])
```

- [ ] **Step 4: Add `removeExistingImage` handler**

After the existing `movePhoto` function, add:
```js
const removeExistingImage = (imgId) => {
  setRemovedImageIds(prev => [...prev, imgId])
  setExistingImages(prev => prev.filter(img => img.id !== imgId))
}
```

- [ ] **Step 5: Update `uploadPhotos` to accept a sort offset**

Change the signature from:
```js
const uploadPhotos = async (listingId) => {
```
To:
```js
const uploadPhotos = async (listingId, sortOffset = 0) => {
```

And update the `uploadedImages.push(...)` call inside `uploadPhotos` — change `is_primary: i === 0` and `sort_order: i` to:
```js
uploadedImages.push({
  listing_id: listingId,
  url: urlData.publicUrl,
  storage_path: uploadData.path,
  is_primary: sortOffset === 0 && i === 0,  // only primary if no existing images
  sort_order: sortOffset + i,
})
```

- [ ] **Step 6: Replace `handleSubmit` with edit/create branching**

Replace the entire `handleSubmit` function with:
```js
const handleSubmit = async () => {
  setError(null)
  setLoading(true)

  try {
    let listingId

    if (mode === 'edit') {
      const { error: updateError } = await supabase
        .from('listings')
        .update({
          title: form.title,
          description: form.description,
          property_type: form.property_type,
          city: form.city,
          neighbourhood: form.neighbourhood,
          address: form.address,
          price: parseInt(form.price),
          utilities_included: form.utilities_included,
          bedrooms: parseInt(form.bedrooms),
          bathrooms: parseFloat(form.bathrooms),
          square_feet: form.square_feet ? parseInt(form.square_feet) : null,
          available_from: form.available_from || null,
          lease_term: form.lease_term,
          pet_friendly: form.pet_friendly,
          parking_available: form.parking_available,
          laundry: form.laundry,
          furnished: form.furnished,
        })
        .eq('id', listing.id)

      if (updateError) throw updateError
      listingId = listing.id

      // Delete any images the user removed
      if (removedImageIds.length > 0) {
        await supabase.from('listing_images').delete().in('id', removedImageIds)
      }
    } else {
      const { data, error: insertError } = await supabase
        .from('listings')
        .insert({
          landlord_id: user.id,
          title: form.title,
          description: form.description,
          property_type: form.property_type,
          city: form.city,
          neighbourhood: form.neighbourhood,
          address: form.address,
          price: parseInt(form.price),
          utilities_included: form.utilities_included,
          bedrooms: parseInt(form.bedrooms),
          bathrooms: parseFloat(form.bathrooms),
          square_feet: form.square_feet ? parseInt(form.square_feet) : null,
          available_from: form.available_from || null,
          lease_term: form.lease_term,
          pet_friendly: form.pet_friendly,
          parking_available: form.parking_available,
          laundry: form.laundry,
          furnished: form.furnished,
          status: 'active',
        })
        .select()
        .single()

      if (insertError) throw insertError
      listingId = data.id
    }

    // Upload any new photos
    if (photos.length > 0) {
      const sortOffset = existingImages.length
      const uploaded = await uploadPhotos(listingId, sortOffset)
      if (uploaded === 0 && photos.length > 0) {
        setError('Listing saved but new photos failed to upload. You can try again from Edit.')
        setTimeout(() => {
          if (onSubmitSuccess) onSubmitSuccess()
          else navigate(`/listings/${listingId}`)
        }, 2500)
        return
      }
    }

    if (onSubmitSuccess) {
      onSubmitSuccess()
    } else {
      navigate(`/listings/${listingId}`)
    }
  } catch (err) {
    console.error('Listing submit failed:', err)
    setError(err.message || 'Something went wrong. Please try again.')
  } finally {
    setLoading(false)
  }
}
```

- [ ] **Step 7: Show existing images in the photo step (Step 3 UI)**

In the Step 3 JSX block, before the upload area `<label>`, add the existing images grid:
```jsx
{existingImages.length > 0 && (
  <div>
    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
      Current Photos ({existingImages.length})
    </p>
    <div className="grid grid-cols-4 gap-2 mb-4">
      {existingImages.map((img, i) => (
        <div key={img.id} className="relative group">
          <div className="aspect-square rounded-lg overflow-hidden bg-gray-100">
            <img src={img.url} alt={`Existing ${i + 1}`} className="w-full h-full object-cover" />
          </div>
          {img.is_primary && (
            <div className="absolute top-1 left-1 bg-red-700 text-white text-xs px-1.5 py-0.5 rounded font-medium">
              Main
            </div>
          )}
          <button
            type="button"
            onClick={() => removeExistingImage(img.id)}
            className="absolute top-1 right-1 bg-red-600 text-white rounded text-xs w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition hover:bg-red-700"
            title="Remove photo"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  </div>
)}
```

Also update the listing summary at the bottom of step 3 to show the correct photo count (existing + new):
Find:
```jsx
<p className="text-gray-500 capitalize">{form.property_type?.replace('_', ' ')}</p>
```
After it, add:
```jsx
<p className="text-gray-400 text-xs">{existingImages.length + photos.length} photo{existingImages.length + photos.length !== 1 ? 's' : ''}</p>
```

- [ ] **Step 8: Update the publish button label for edit mode**

Find:
```jsx
'🍁 Publish Listing'
```
Replace with:
```jsx
mode === 'edit' ? '✓ Save Changes' : '🍁 Publish Listing'
```

Also update the page title and subtitle. Find:
```jsx
<h1 className="text-2xl font-bold text-gray-900">{isRenter ? 'Post a Sublease' : 'Post a Listing'}</h1>
<p className="text-gray-500 text-sm mt-1">
  {isRenter
    ? 'List your space for sublet and find someone to take over your lease'
    : 'Fill in your property details to connect with renters'}
</p>
```
Replace with:
```jsx
<h1 className="text-2xl font-bold text-gray-900">
  {mode === 'edit' ? 'Edit Listing' : isRenter ? 'Post a Sublease' : 'Post a Listing'}
</h1>
<p className="text-gray-500 text-sm mt-1">
  {mode === 'edit'
    ? 'Update your property details'
    : isRenter
    ? 'List your space for sublet and find someone to take over your lease'
    : 'Fill in your property details to connect with renters'}
</p>
```

- [ ] **Step 9: Verify in browser**

Navigate to a listing you own, click "Edit Listing". The form should pre-fill with existing data. Existing photos should show in step 3. Submit should update (not create) the listing and redirect back to the detail page.

- [ ] **Step 10: Commit**
```bash
git add src/pages/CreateListingPage.jsx
git commit -m "fix: add edit mode to CreateListingPage — pre-fills form, updates instead of inserts, manages existing photos"
```

---

## Task 6: Create MessagesInboxPage

**Files:**
- Create: `src/pages/MessagesInboxPage.jsx`

- [ ] **Step 1: Create the file**

Create `src/pages/MessagesInboxPage.jsx`:
```jsx
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

const timeAgo = (dateStr) => {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr)
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
}

function Avatar({ profile, size = 'sm' }) {
  const sz = size === 'sm' ? 'w-10 h-10 text-sm' : 'w-12 h-12 text-base'
  if (profile?.avatar_url) {
    return <img src={profile.avatar_url} alt="" className={`${sz} rounded-full object-cover flex-shrink-0`} />
  }
  return (
    <div className={`${sz} rounded-full bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center font-bold text-white flex-shrink-0`}>
      {(profile?.full_name || profile?.email || '?').charAt(0).toUpperCase()}
    </div>
  )
}

export default function MessagesInboxPage() {
  const { user } = useAuth()
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    fetchConversations()
  }, [user?.id])

  const fetchConversations = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('conversations')
      .select(`
        id, last_message, last_message_at, renter_unread, landlord_unread,
        listing:listing_id(id, title, city, listing_images(url, is_primary)),
        renter:renter_id(id, full_name, avatar_url, email),
        landlord:landlord_id(id, full_name, avatar_url, email)
      `)
      .or(`renter_id.eq.${user.id},landlord_id.eq.${user.id}`)
      .order('last_message_at', { ascending: false })

    setConversations(data || [])
    setLoading(false)
  }

  if (loading) return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-3">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 animate-pulse flex gap-3">
          <div className="w-10 h-10 rounded-full bg-gray-200 flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3 bg-gray-200 rounded w-1/3" />
            <div className="h-3 bg-gray-200 rounded w-2/3" />
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Messages</h1>

      {conversations.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-5xl mb-4">💬</div>
          <p className="font-medium text-gray-600">No conversations yet</p>
          <p className="text-sm mt-1">When you contact a landlord, your conversation will appear here.</p>
          <Link to="/listings" className="mt-4 inline-block text-red-700 text-sm font-medium hover:underline">
            Browse listings
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {conversations.map(convo => {
            const isRenter = user.id === convo.renter?.id
            const other = isRenter ? convo.landlord : convo.renter
            const unread = isRenter ? (convo.renter_unread || 0) : (convo.landlord_unread || 0)
            const listingImage = convo.listing?.listing_images?.find(i => i.is_primary) || convo.listing?.listing_images?.[0]

            return (
              <Link
                key={convo.id}
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
                    {convo.listing?.city ? ` · ${convo.listing.city}` : ''}
                  </p>
                  <p className={`text-xs truncate mt-0.5 ${unread > 0 ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>
                    {convo.last_message || 'No messages yet'}
                  </p>
                </div>
                {listingImage && (
                  <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
                    <img src={listingImage.url} alt="" className="w-full h-full object-cover" />
                  </div>
                )}
                {unread > 0 && (
                  <div className="w-5 h-5 bg-red-600 text-white text-xs rounded-full flex items-center justify-center font-bold flex-shrink-0">
                    {unread > 9 ? '9+' : unread}
                  </div>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**
```bash
git add src/pages/MessagesInboxPage.jsx
git commit -m "feat: add MessagesInboxPage showing all conversations with unread counts"
```

---

## Task 7: Create ConversationPage

**Files:**
- Create: `src/pages/ConversationPage.jsx`

- [ ] **Step 1: Create the file**

Create `src/pages/ConversationPage.jsx`:
```jsx
import { useState, useEffect, useRef } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

function Avatar({ profile }) {
  if (profile?.avatar_url) {
    return <img src={profile.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
  }
  return (
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center font-bold text-white text-xs flex-shrink-0">
      {(profile?.full_name || profile?.email || '?').charAt(0).toUpperCase()}
    </div>
  )
}

const formatTime = (dateStr) => {
  const d = new Date(dateStr)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  if (isToday) return d.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function ConversationPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [conversation, setConversation] = useState(null)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (user) fetchConversation()
  }, [id, user?.id])

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Real-time subscription
  useEffect(() => {
    if (!id || !user) return
    const channel = supabase
      .channel(`messages-${id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` },
        async (payload) => {
          // Skip if we sent it ourselves (already added optimistically)
          if (payload.new.sender_id === user.id) return
          // Fetch with sender profile
          const { data: msg } = await supabase
            .from('messages')
            .select('id, content, created_at, read, sender_id, sender:sender_id(id, full_name, avatar_url, email)')
            .eq('id', payload.new.id)
            .single()
          if (msg) {
            setMessages(prev => [...prev, msg])
            // Mark as read immediately since user is viewing
            supabase.from('messages').update({ read: true }).eq('id', msg.id)
          }
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [id, user?.id])

  const fetchConversation = async () => {
    setLoading(true)
    const { data: convo, error: convoErr } = await supabase
      .from('conversations')
      .select(`
        id, renter_id, landlord_id, renter_unread, landlord_unread,
        listing:listing_id(id, title, city, listing_images(url, is_primary)),
        renter:renter_id(id, full_name, avatar_url, email),
        landlord:landlord_id(id, full_name, avatar_url, email)
      `)
      .eq('id', id)
      .single()

    if (convoErr || !convo) { navigate('/messages'); return }

    // Redirect if current user is not a participant
    if (convo.renter_id !== user.id && convo.landlord_id !== user.id) {
      navigate('/messages'); return
    }

    setConversation(convo)

    const { data: msgs } = await supabase
      .from('messages')
      .select('id, content, created_at, read, sender_id, sender:sender_id(id, full_name, avatar_url, email)')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true })

    setMessages(msgs || [])
    setLoading(false)

    // Mark messages from the other party as read
    await supabase
      .from('messages')
      .update({ read: true })
      .eq('conversation_id', id)
      .neq('sender_id', user.id)
      .eq('read', false)

    // Reset own unread count to 0
    const unreadField = user.id === convo.renter_id ? 'renter_unread' : 'landlord_unread'
    await supabase.from('conversations').update({ [unreadField]: 0 }).eq('id', id)
  }

  const handleSend = async (e) => {
    e.preventDefault()
    const content = newMessage.trim()
    if (!content || sending || !conversation) return

    setSending(true)
    setNewMessage('')
    setError(null)

    const { data: msg, error: sendErr } = await supabase
      .from('messages')
      .insert({ conversation_id: id, sender_id: user.id, content })
      .select('id, content, created_at, read, sender_id, sender:sender_id(id, full_name, avatar_url, email)')
      .single()

    if (sendErr) {
      setError('Failed to send message. Please try again.')
      setNewMessage(content) // restore
      setSending(false)
      return
    }

    // Add optimistically (real-time won't fire for own messages)
    setMessages(prev => [...prev, msg])

    // Update conversation metadata + increment other party's unread
    const otherUnreadField = user.id === conversation.renter_id ? 'landlord_unread' : 'renter_unread'
    const currentOtherUnread = user.id === conversation.renter_id
      ? (conversation.landlord_unread || 0)
      : (conversation.renter_unread || 0)

    await supabase.from('conversations').update({
      last_message: content,
      last_message_at: new Date().toISOString(),
      [otherUnreadField]: currentOtherUnread + 1,
    }).eq('id', id)

    setSending(false)
    inputRef.current?.focus()
  }

  if (loading) return (
    <div className="max-w-2xl mx-auto px-4 py-10 animate-pulse space-y-4">
      <div className="h-14 bg-gray-200 rounded-xl" />
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className={`flex ${i % 2 === 0 ? '' : 'justify-end'}`}>
            <div className="h-10 bg-gray-200 rounded-xl w-48" />
          </div>
        ))}
      </div>
    </div>
  )

  const listingImage = conversation.listing?.listing_images?.find(i => i.is_primary)
    || conversation.listing?.listing_images?.[0]
  const other = user.id === conversation.renter_id ? conversation.landlord : conversation.renter

  return (
    <div className="max-w-2xl mx-auto flex flex-col" style={{ height: 'calc(100vh - 64px)' }}>
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <Link to="/messages" className="text-gray-400 hover:text-gray-600 text-lg leading-none">←</Link>
        {listingImage && (
          <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
            <img src={listingImage.url} alt="" className="w-full h-full object-cover" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <Link to={`/listings/${conversation.listing?.id}`} className="font-semibold text-sm text-gray-900 hover:text-red-700 truncate block transition">
            {conversation.listing?.title || 'Listing'}
          </Link>
          <p className="text-xs text-gray-500 truncate">
            {other?.full_name || other?.email || 'User'}
            {conversation.listing?.city ? ` · ${conversation.listing.city}` : ''}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-center text-sm text-gray-400 py-8">
            No messages yet. Say hello!
          </p>
        )}
        {messages.map(msg => {
          const isOwn = msg.sender_id === user.id
          return (
            <div key={msg.id} className={`flex items-end gap-2 ${isOwn ? 'justify-end' : 'justify-start'}`}>
              {!isOwn && <Avatar profile={msg.sender} />}
              <div className={`max-w-xs lg:max-w-sm ${isOwn ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  isOwn
                    ? 'bg-red-700 text-white rounded-br-md'
                    : 'bg-gray-100 text-gray-800 rounded-bl-md'
                }`}>
                  {msg.content}
                </div>
                <span className="text-xs text-gray-400 px-1">{formatTime(msg.created_at)}</span>
              </div>
              {isOwn && <Avatar profile={user.profile} />}
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Send input */}
      <div className="border-t border-gray-200 bg-white px-4 py-3 flex-shrink-0">
        {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
        <form onSubmit={handleSend} className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={newMessage}
            onChange={e => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 border border-gray-200 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
            disabled={sending}
          />
          <button
            type="submit"
            disabled={!newMessage.trim() || sending}
            className="bg-red-700 text-white px-5 py-2.5 rounded-full text-sm font-medium hover:bg-red-800 transition disabled:opacity-40"
          >
            {sending ? '...' : 'Send'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**
```bash
git add src/pages/ConversationPage.jsx
git commit -m "feat: add ConversationPage with real-time messaging, read receipts, and send input"
```

---

## Task 8: Wire Up Routes + Update Navbar

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/shared/Navbar.jsx`

- [ ] **Step 1: Add imports and routes to App.jsx**

Add imports at the top of `src/App.jsx` alongside existing imports:
```js
import MessagesInboxPage from './pages/MessagesInboxPage'
import ConversationPage from './pages/ConversationPage'
```

Inside `AppRoutes`, after the existing routes, add:
```jsx
<Route path="/messages" element={
  <ProtectedRoute><MessagesInboxPage /></ProtectedRoute>
} />
<Route path="/messages/:id" element={
  <ProtectedRoute><ConversationPage /></ProtectedRoute>
} />
```

- [ ] **Step 2: Add Messages link + unread badge to Navbar**

In `src/components/shared/Navbar.jsx`, add `useState` and `useEffect` to the import:
```js
import { Link, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
```

Inside the `Navbar` component, after the existing hook calls, add:
```js
const [unreadCount, setUnreadCount] = useState(0)

useEffect(() => {
  if (!user) { setUnreadCount(0); return }
  supabase
    .from('conversations')
    .select('renter_id, renter_unread, landlord_unread')
    .or(`renter_id.eq.${user.id},landlord_id.eq.${user.id}`)
    .then(({ data }) => {
      if (!data) return
      const total = data.reduce((sum, c) => {
        return sum + (user.id === c.renter_id ? (c.renter_unread || 0) : (c.landlord_unread || 0))
      }, 0)
      setUnreadCount(total)
    })
}, [user?.id])
```

In the navbar JSX, inside the `{user ? ( ... ) : ( ... )}` block, after the existing "Browse Listings" and "Analytics" links (and before the user-only links), add a Messages link. Place it in the `div.flex.items-center.gap-4`:

After `<Link to="/analytics" ...>Analytics</Link>`, add:
```jsx
{user && (
  <Link to="/messages" className="relative text-gray-600 hover:text-gray-900 text-sm font-medium">
    Messages
    {unreadCount > 0 && (
      <span className="absolute -top-1.5 -right-2.5 bg-red-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold leading-none">
        {unreadCount > 9 ? '9+' : unreadCount}
      </span>
    )}
  </Link>
)}
```

- [ ] **Step 3: Verify full messaging flow in browser**

1. Log in as a renter, go to a listing, click "Contact Landlord" → should create a conversation and navigate to `/messages/:id`
2. The conversation page should load with the listing header
3. Send a message — it should appear in the thread
4. Navigate to `/messages` — the inbox should show the conversation with last message preview
5. The navbar should show a "Messages" link

- [ ] **Step 4: Commit**
```bash
git add src/App.jsx src/components/shared/Navbar.jsx
git commit -m "feat: add messages routes and navbar link with unread count badge"
```

---

## Self-Review Notes

- **Spec coverage:** All 6 bugs addressed. ✓
- **Migrations:** Two SQL files created; both need to be run manually in Supabase before testing Tasks 3 and 7. ✓
- **RLS gap:** `conversations` UPDATE and `messages` UPDATE policies are added in Task 2 migration — without this, Task 7 send/read-receipt would silently fail. ✓
- **Sublease RLS issue (out of scope):** The `listings` insert policy requires `is_landlord()`. Renter sublease creation will fail at the DB level. This is a separate bug — add `OR (auth.uid() = landlord_id AND property_type = 'sublease')` to the insert policy as a follow-up.
- **Type consistency:** `renter:renter_id(...)` and `landlord:landlord_id(...)` aliased Supabase joins used consistently across Tasks 6, 7, and 8. ✓
- **No placeholders:** All code blocks are complete. ✓
