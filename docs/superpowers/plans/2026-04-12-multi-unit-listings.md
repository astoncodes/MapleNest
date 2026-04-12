# Multi-Unit Listings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow landlords to attach multiple units (and optional per-room breakdowns) to a single listing, with renters able to browse, compare, and request specific units or rooms via chat.

**Architecture:** A new `listing_units` table hangs off `listings`; a `listing_unit_rooms` table hangs off units for room-rental mode. All UI is additive — listings without units behave exactly as today. The landlord editor lives inside the existing `CreateListingPage` step flow as a new Step 4. Renter-facing unit display is split into two focused components: `UnitStrip` (search card) and `UnitSection` (detail page).

**Tech Stack:** React 18, Supabase JS v2, Tailwind CSS, React Router v6, PostgreSQL RLS

---

## File Map

**New files:**
- `supabase/migration_listing_units.sql` — DDL + RLS for both new tables + conversations columns
- `src/components/listings/UnitStrip.jsx` — unit chip strip for listing cards in search results
- `src/components/listings/UnitSection.jsx` — full unit/room list on detail page (renter view)
- `src/components/listings/UnitEditorModal.jsx` — add/edit unit modal + room sub-editor (landlord)
- `src/components/listings/BulkAddModal.jsx` — bulk unit generation modal (landlord)

**Modified files:**
- `src/pages/ListingsPage.jsx` — add units join to fetch; pass to `ListingCard`; show "From $X"
- `src/pages/ListingDetailPage.jsx` — add `UnitSection`; add `handleUnitRequest`
- `src/pages/CreateListingPage.jsx` — add Step 4 (Units); render unit chips, modals
- `src/pages/ConversationPage.jsx` — read `unitId`/`roomId` from router state; pre-fill message; pass to conversation insert
- `src/pages/MessagesInboxPage.jsx` — show unit/room label in conversation rows
- `supabase/schema.sql` — add new tables + conversations columns

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migration_listing_units.sql`
- Modify: `supabase/schema.sql`

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migration_listing_units.sql` with this exact content:

```sql
-- listing_units table
CREATE TABLE IF NOT EXISTS public.listing_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  unit_name text NOT NULL CHECK (char_length(unit_name) <= 60),
  floor int,
  price int,
  available_from date,
  notes text CHECK (char_length(notes) <= 300),
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'rented')),
  room_rental boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- listing_unit_rooms table
CREATE TABLE IF NOT EXISTS public.listing_unit_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES public.listing_units(id) ON DELETE CASCADE,
  room_name text NOT NULL CHECK (char_length(room_name) <= 60),
  price int,
  available_from date,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'occupied')),
  sort_order int NOT NULL DEFAULT 0
);

-- Add unit/room context to conversations
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES public.listing_units(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS room_id uuid REFERENCES public.listing_unit_rooms(id) ON DELETE SET NULL;

-- RLS: listing_units
ALTER TABLE public.listing_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "listing_units_public_read" ON public.listing_units
  FOR SELECT USING (true);

CREATE POLICY "listing_units_landlord_write" ON public.listing_units
  FOR ALL
  USING (
    auth.uid() = (SELECT landlord_id FROM public.listings WHERE id = listing_id)
  )
  WITH CHECK (
    auth.uid() = (SELECT landlord_id FROM public.listings WHERE id = listing_id)
  );

-- RLS: listing_unit_rooms
ALTER TABLE public.listing_unit_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "listing_unit_rooms_public_read" ON public.listing_unit_rooms
  FOR SELECT USING (true);

CREATE POLICY "listing_unit_rooms_landlord_write" ON public.listing_unit_rooms
  FOR ALL
  USING (
    auth.uid() = (
      SELECT l.landlord_id FROM public.listings l
      JOIN public.listing_units lu ON lu.listing_id = l.id
      WHERE lu.id = unit_id
    )
  )
  WITH CHECK (
    auth.uid() = (
      SELECT l.landlord_id FROM public.listings l
      JOIN public.listing_units lu ON lu.listing_id = l.id
      WHERE lu.id = unit_id
    )
  );
```

- [ ] **Step 2: Run the migration in Supabase SQL Editor**

Open your Supabase project → SQL Editor → paste the contents of `supabase/migration_listing_units.sql` → Run. Expected: no errors, tables appear in Table Editor.

- [ ] **Step 3: Add to schema.sql**

Append to `supabase/schema.sql` after the existing tables section:

```sql
-- ── listing_units ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.listing_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  unit_name text NOT NULL CHECK (char_length(unit_name) <= 60),
  floor int,
  price int,
  available_from date,
  notes text CHECK (char_length(notes) <= 300),
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'rented')),
  room_rental boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.listing_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "listing_units_public_read" ON public.listing_units FOR SELECT USING (true);
CREATE POLICY "listing_units_landlord_write" ON public.listing_units FOR ALL
  USING (auth.uid() = (SELECT landlord_id FROM public.listings WHERE id = listing_id))
  WITH CHECK (auth.uid() = (SELECT landlord_id FROM public.listings WHERE id = listing_id));

-- ── listing_unit_rooms ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.listing_unit_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES public.listing_units(id) ON DELETE CASCADE,
  room_name text NOT NULL CHECK (char_length(room_name) <= 60),
  price int,
  available_from date,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'occupied')),
  sort_order int NOT NULL DEFAULT 0
);

ALTER TABLE public.listing_unit_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "listing_unit_rooms_public_read" ON public.listing_unit_rooms FOR SELECT USING (true);
CREATE POLICY "listing_unit_rooms_landlord_write" ON public.listing_unit_rooms FOR ALL
  USING (auth.uid() = (SELECT l.landlord_id FROM public.listings l JOIN public.listing_units lu ON lu.listing_id = l.id WHERE lu.id = unit_id))
  WITH CHECK (auth.uid() = (SELECT l.landlord_id FROM public.listings l JOIN public.listing_units lu ON lu.listing_id = l.id WHERE lu.id = unit_id));

-- ── conversations: unit/room context ─────────────────────────────────────────
-- ALTER TABLE public.conversations
--   ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES public.listing_units(id) ON DELETE SET NULL,
--   ADD COLUMN IF NOT EXISTS room_id uuid REFERENCES public.listing_unit_rooms(id) ON DELETE SET NULL;
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migration_listing_units.sql supabase/schema.sql
git commit -m "feat: add listing_units and listing_unit_rooms tables with RLS"
```

---

## Task 2: UnitStrip Component (Search Card)

**Files:**
- Create: `src/components/listings/UnitStrip.jsx`

This component shows the unit chip strip at the bottom of a listing card in search results.

- [ ] **Step 1: Create the component**

Create `src/components/listings/UnitStrip.jsx`:

```jsx
// Computes the lowest available price across units and their rooms.
// Falls back to the listing's base price when a unit/room has no price set.
export function resolveLowestPrice(units, basePrice) {
  let lowest = null
  for (const unit of units) {
    if (unit.room_rental) {
      for (const room of unit.listing_unit_rooms || []) {
        if (room.status === 'available') {
          const p = room.price ?? unit.price ?? basePrice
          if (lowest === null || p < lowest) lowest = p
        }
      }
    } else {
      if (unit.status === 'available') {
        const p = unit.price ?? basePrice
        if (lowest === null || p < lowest) lowest = p
      }
    }
  }
  return lowest ?? basePrice
}

// Returns count of available units (whole-unit) or units with ≥1 available room
export function countAvailable(units) {
  return units.filter(u => {
    if (u.room_rental) {
      return (u.listing_unit_rooms || []).some(r => r.status === 'available')
    }
    return u.status === 'available'
  }).length
}

export default function UnitStrip({ units }) {
  if (!units || units.length === 0) return null

  const available = units.filter(u => {
    if (u.room_rental) return (u.listing_unit_rooms || []).some(r => r.status === 'available')
    return u.status === 'available'
  })

  if (available.length === 0) {
    return (
      <p className="text-xs text-gray-400 mt-1">No units currently available</p>
    )
  }

  const preview = available.slice(0, 2)
  const overflow = available.length - preview.length

  return (
    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
      {preview.map(u => (
        <span
          key={u.id}
          className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full"
        >
          {u.unit_name}
        </span>
      ))}
      {overflow > 0 && (
        <span className="text-xs text-red-700 font-medium">+{overflow} more →</span>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/listings/UnitStrip.jsx
git commit -m "feat: add UnitStrip component for listing cards"
```

---

## Task 3: Wire UnitStrip into ListingsPage

**Files:**
- Modify: `src/pages/ListingsPage.jsx`

- [ ] **Step 1: Update the fetch query to include units**

In `fetchListings`, change the `.select(...)` line from:
```js
.select('*, listing_images(url, is_primary, sort_order)')
```
to:
```js
.select('*, listing_images(url, is_primary, sort_order), listing_units(id, unit_name, price, status, room_rental, listing_unit_rooms(id, status))')
```

- [ ] **Step 2: Update ListingCard to use UnitStrip and "From $X" price**

At the top of `ListingsPage.jsx`, add the import:
```js
import UnitStrip, { resolveLowestPrice, countAvailable } from '../components/listings/UnitStrip'
```

In the `ListingCard` component, find:
```jsx
const formatPrice = (p) => `$${Number(p || 0).toLocaleString()}`
```
Replace with:
```jsx
const formatPrice = (p) => `$${Number(p || 0).toLocaleString()}`
const units = listing.listing_units || []
const hasUnits = units.length > 0
const displayPrice = hasUnits ? resolveLowestPrice(units, listing.price) : listing.price
const pricePrefix = hasUnits ? 'From ' : ''
```

Find the price display in the card content:
```jsx
<span className="text-red-700 font-bold text-sm whitespace-nowrap">{formatPrice(listing.price)}<span className="text-gray-400 font-normal">/mo</span></span>
```
Replace with:
```jsx
<span className="text-red-700 font-bold text-sm whitespace-nowrap">
  {pricePrefix}{formatPrice(displayPrice)}<span className="text-gray-400 font-normal">/mo</span>
</span>
```

After the `<div className="flex items-center gap-3 ...">` amenity row (the one with beds/baths/pets/parking), add:
```jsx
<UnitStrip units={units} />
```

- [ ] **Step 3: Verify in browser**

Run `npm run dev`. Open `/listings`. Listings without units look identical to before. If you have a listing with units in the DB, the chip strip and "From $X" price appear.

- [ ] **Step 4: Commit**

```bash
git add src/pages/ListingsPage.jsx
git commit -m "feat: show unit strip and 'From $X' price on listing cards"
```

---

## Task 4: UnitSection Component (Detail Page, Renter View)

**Files:**
- Create: `src/components/listings/UnitSection.jsx`

- [ ] **Step 1: Create the component**

Create `src/components/listings/UnitSection.jsx`:

```jsx
import { useState } from 'react'

const formatDate = (d) => d
  ? new Date(d).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
  : null

const formatPrice = (p) => `$${Number(p).toLocaleString()}`

function UnitRow({ unit, basePrice, baseDate, onRequest, isOwn, user }) {
  const price = unit.price ?? basePrice
  const date = unit.available_from ?? baseDate
  const isRented = unit.status === 'rented'

  return (
    <div className={`flex items-center justify-between gap-4 py-3 px-4 rounded-lg border ${
      isRented ? 'bg-gray-50 border-gray-100 opacity-60' : 'bg-white border-gray-100'
    }`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm text-gray-900">{unit.unit_name}</span>
          {unit.floor != null && (
            <span className="text-xs text-gray-500">Floor {unit.floor}</span>
          )}
          {date && !isRented && (
            <span className="text-xs text-gray-500">· Available {formatDate(date)}</span>
          )}
        </div>
        {unit.notes && (
          <p className="text-xs text-gray-400 mt-0.5 truncate">{unit.notes}</p>
        )}
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className="font-bold text-sm text-red-700">{formatPrice(price)}<span className="text-gray-400 font-normal text-xs">/mo</span></span>
        {isRented ? (
          <span className="text-xs text-gray-400 font-medium">Rented</span>
        ) : isOwn ? null : !user ? (
          <button
            onClick={() => onRequest({ unitId: unit.id, unitName: unit.unit_name })}
            className="bg-red-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-red-800 transition"
          >
            Request
          </button>
        ) : (
          <button
            onClick={() => onRequest({ unitId: unit.id, unitName: unit.unit_name })}
            className="bg-red-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-red-800 transition"
          >
            Request
          </button>
        )}
      </div>
    </div>
  )
}

function RoomRow({ room, unitPrice, basePrice, baseDate, unitId, unitName, onRequest, isOwn, user }) {
  const price = room.price ?? unitPrice ?? basePrice
  const date = room.available_from ?? baseDate
  const isOccupied = room.status === 'occupied'

  return (
    <div className={`flex items-center justify-between gap-4 py-2.5 px-4 ml-4 rounded-lg border ${
      isOccupied ? 'bg-gray-50 border-gray-100 opacity-60' : 'bg-white border-gray-100'
    }`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm text-gray-800">{room.room_name}</span>
          {date && !isOccupied && (
            <span className="text-xs text-gray-500">· Available {formatDate(date)}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className="font-bold text-sm text-red-700">{formatPrice(price)}<span className="text-gray-400 font-normal text-xs">/mo</span></span>
        {isOccupied ? (
          <span className="text-xs text-gray-400 font-medium">Occupied</span>
        ) : isOwn ? null : (
          <button
            onClick={() => onRequest({ unitId, unitName, roomId: room.id, roomName: room.room_name })}
            className="bg-red-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-red-800 transition"
          >
            Request
          </button>
        )}
      </div>
    </div>
  )
}

function RoomRentalUnit({ unit, basePrice, baseDate, onRequest, isOwn, user }) {
  const [open, setOpen] = useState(true)
  const rooms = [...(unit.listing_unit_rooms || [])].sort((a, b) => a.sort_order - b.sort_order)
  const availableCount = rooms.filter(r => r.status === 'available').length
  const totalCount = rooms.length

  return (
    <div className="space-y-1">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-4 py-3 px-4 rounded-lg border border-gray-100 bg-gray-50 hover:bg-gray-100 transition text-left"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm text-gray-900">{unit.unit_name}</span>
          {unit.floor != null && <span className="text-xs text-gray-500">Floor {unit.floor}</span>}
          <span className="text-xs text-gray-500">
            · {availableCount} of {totalCount} room{totalCount !== 1 ? 's' : ''} available
          </span>
        </div>
        <span className="text-gray-400 text-xs">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="space-y-1">
          {totalCount === 0 && (
            <p className="text-xs text-gray-400 ml-4 py-2">No rooms added yet.</p>
          )}
          {rooms.map(room => (
            <RoomRow
              key={room.id}
              room={room}
              unitPrice={unit.price}
              basePrice={basePrice}
              baseDate={baseDate}
              unitId={unit.id}
              unitName={unit.unit_name}
              onRequest={onRequest}
              isOwn={isOwn}
              user={user}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function UnitSection({ units, basePrice, baseDate, onRequest, isOwn, user, listingId }) {
  if (!units || units.length === 0) return null

  const sorted = [...units].sort((a, b) => {
    const aRented = a.room_rental
      ? (a.listing_unit_rooms || []).every(r => r.status === 'occupied')
      : a.status === 'rented'
    const bRented = b.room_rental
      ? (b.listing_unit_rooms || []).every(r => r.status === 'occupied')
      : b.status === 'rented'
    if (aRented !== bRented) return aRented ? 1 : -1
    return a.sort_order - b.sort_order
  })

  const availableCount = units.filter(u => {
    if (u.room_rental) return (u.listing_unit_rooms || []).some(r => r.status === 'available')
    return u.status === 'available'
  }).length

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-800 text-lg">
          Available Units <span className="text-gray-400 font-normal text-base">({availableCount})</span>
        </h2>
        {isOwn && (
          <a href={`/listings/${listingId}/edit`} className="text-xs text-red-700 font-medium hover:underline">
            Edit units
          </a>
        )}
      </div>
      <div className="space-y-2">
        {sorted.map(unit => (
          unit.room_rental ? (
            <RoomRentalUnit
              key={unit.id}
              unit={unit}
              basePrice={basePrice}
              baseDate={baseDate}
              onRequest={onRequest}
              isOwn={isOwn}
              user={user}
            />
          ) : (
            <UnitRow
              key={unit.id}
              unit={unit}
              basePrice={basePrice}
              baseDate={baseDate}
              onRequest={onRequest}
              isOwn={isOwn}
              user={user}
            />
          )
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/listings/UnitSection.jsx
git commit -m "feat: add UnitSection component for listing detail page"
```

---

## Task 5: Wire UnitSection into ListingDetailPage

**Files:**
- Modify: `src/pages/ListingDetailPage.jsx`

- [ ] **Step 1: Update the fetch to include units and rooms**

In `fetchListing`, change the select from:
```js
.select('*, listing_images(id, url, is_primary, sort_order)')
```
to:
```js
.select('*, listing_images(id, url, is_primary, sort_order), listing_units(id, unit_name, floor, price, available_from, notes, status, room_rental, sort_order, listing_unit_rooms(id, room_name, price, available_from, status, sort_order))')
```

- [ ] **Step 2: Add import and handleUnitRequest function**

At the top of the file, add:
```js
import UnitSection from '../components/listings/UnitSection'
```

After the `handleContact` function, add:

```js
const handleUnitRequest = async ({ unitId, unitName, roomId, roomName }) => {
  if (!user) { navigate('/login'); return }

  setContacting(true)
  setContactError(null)
  try {
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .eq('listing_id', id)
      .eq('renter_id', user.id)
      .maybeSingle()

    if (existing) { navigate(`/messages/${existing.id}`); return }

    navigate('/messages/new', {
      state: {
        listingId: id,
        landlordId: listing.landlord_id,
        listing: { id, title: listing.title, city: listing.city, listing_images: listing.listing_images },
        landlord,
        unitId,
        unitName,
        roomId: roomId || null,
        roomName: roomName || null,
      },
    })
  } catch {
    setContactError('Could not open conversation. Please try again.')
  } finally {
    setContacting(false)
  }
}
```

- [ ] **Step 3: Render UnitSection below the Details section**

Find the closing `</div>` of the Details grid section (the one that ends the `<div>` containing `<h2>Details</h2>`). After it, add:

```jsx
{(listing.listing_units?.length > 0) && (
  <UnitSection
    units={listing.listing_units}
    basePrice={listing.price}
    baseDate={listing.available_from}
    onRequest={handleUnitRequest}
    isOwn={isOwnListing}
    user={user}
    listingId={listing.id}
  />
)}
```

- [ ] **Step 4: Verify in browser**

Navigate to a listing detail page. If no units: nothing new appears. If the listing has units in the DB: the "Available Units" section appears below Details with correct rows.

- [ ] **Step 5: Commit**

```bash
git add src/pages/ListingDetailPage.jsx
git commit -m "feat: add UnitSection to listing detail page with unit request flow"
```

---

## Task 6: UnitEditorModal Component (Landlord)

**Files:**
- Create: `src/components/listings/UnitEditorModal.jsx`

- [ ] **Step 1: Create the modal**

Create `src/components/listings/UnitEditorModal.jsx`:

```jsx
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const inputClass = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
const labelClass = "block text-xs font-medium text-gray-500 mb-1"

function RoomEditor({ unitId, basePricePlaceholder }) {
  const [rooms, setRooms] = useState([])
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ room_name: '', price: '', available_from: '', status: 'available' })
  const [editingId, setEditingId] = useState(null)

  useEffect(() => { fetchRooms() }, [unitId])

  const fetchRooms = async () => {
    const { data } = await supabase
      .from('listing_unit_rooms')
      .select('*')
      .eq('unit_id', unitId)
      .order('sort_order')
    setRooms(data || [])
  }

  const resetForm = () => {
    setForm({ room_name: '', price: '', available_from: '', status: 'available' })
    setEditingId(null)
  }

  const handleSave = async () => {
    if (!form.room_name.trim()) return
    setSaving(true)
    const payload = {
      unit_id: unitId,
      room_name: form.room_name.trim(),
      price: form.price ? parseInt(form.price) : null,
      available_from: form.available_from || null,
      status: form.status,
      sort_order: editingId ? undefined : rooms.length,
    }
    if (editingId) {
      await supabase.from('listing_unit_rooms').update(payload).eq('id', editingId)
    } else {
      await supabase.from('listing_unit_rooms').insert(payload)
    }
    await fetchRooms()
    resetForm()
    setSaving(false)
  }

  const handleDelete = async (roomId, status) => {
    if (status === 'occupied') return
    await supabase.from('listing_unit_rooms').delete().eq('id', roomId)
    setRooms(prev => prev.filter(r => r.id !== roomId))
  }

  const handleToggleOccupied = async (room) => {
    const next = room.status === 'occupied' ? 'available' : 'occupied'
    await supabase.from('listing_unit_rooms').update({ status: next }).eq('id', room.id)
    setRooms(prev => prev.map(r => r.id === room.id ? { ...r, status: next } : r))
  }

  const startEdit = (room) => {
    setForm({
      room_name: room.room_name,
      price: room.price ? String(room.price) : '',
      available_from: room.available_from || '',
      status: room.status,
    })
    setEditingId(room.id)
  }

  return (
    <div className="mt-4 border-t border-gray-100 pt-4">
      <p className="text-xs font-semibold text-gray-700 mb-3">Rooms</p>
      <div className="space-y-2 mb-3">
        {rooms.map(room => (
          <div key={room.id} className={`flex items-center justify-between gap-2 p-2 rounded-lg border text-xs ${room.status === 'occupied' ? 'bg-gray-50 border-gray-100' : 'bg-white border-gray-200'}`}>
            <span className="font-medium text-gray-800">{room.room_name}</span>
            {room.price && <span className="text-gray-500">${room.price}/mo</span>}
            <div className="flex items-center gap-2 ml-auto">
              <button onClick={() => handleToggleOccupied(room)} className={`text-xs px-2 py-0.5 rounded-full font-medium ${room.status === 'occupied' ? 'bg-gray-200 text-gray-600' : 'bg-green-100 text-green-700'}`}>
                {room.status === 'occupied' ? 'Occupied' : 'Available'}
              </button>
              <button onClick={() => startEdit(room)} className="text-red-700 font-medium">Edit</button>
              <button onClick={() => handleDelete(room.id, room.status)} disabled={room.status === 'occupied'} className="text-gray-400 disabled:opacity-40">✕</button>
            </div>
          </div>
        ))}
      </div>
      <div className="space-y-2 bg-gray-50 rounded-lg p-3">
        <p className="text-xs font-medium text-gray-600">{editingId ? 'Edit room' : 'Add room'}</p>
        <input className={inputClass} placeholder="Room name e.g. Master, Room 1" maxLength={60}
          value={form.room_name} onChange={e => setForm(p => ({ ...p, room_name: e.target.value }))} />
        <div className="grid grid-cols-2 gap-2">
          <input className={inputClass} placeholder={`Price (blank = ${basePricePlaceholder})`} type="number"
            value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))} />
          <input className={inputClass} type="date"
            value={form.available_from} onChange={e => setForm(p => ({ ...p, available_from: e.target.value }))} />
        </div>
        <div className="flex gap-2">
          <button onClick={handleSave} disabled={saving || !form.room_name.trim()}
            className="bg-red-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-red-800 transition disabled:opacity-50">
            {saving ? 'Saving...' : editingId ? 'Update room' : 'Add room'}
          </button>
          {editingId && (
            <button onClick={resetForm} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function UnitEditorModal({ listingId, basePrice, unit, onSaved, onClose }) {
  const isEdit = !!unit
  const [form, setForm] = useState({
    unit_name: unit?.unit_name || '',
    floor: unit?.floor != null ? String(unit.floor) : '',
    price: unit?.price ? String(unit.price) : '',
    available_from: unit?.available_from || '',
    notes: unit?.notes || '',
    room_rental: unit?.room_rental || false,
    status: unit?.status || 'available',
  })
  const [savedUnit, setSavedUnit] = useState(unit || null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const handleSave = async () => {
    if (!form.unit_name.trim()) { setError('Unit name is required.'); return }
    setSaving(true)
    setError(null)
    const payload = {
      listing_id: listingId,
      unit_name: form.unit_name.trim(),
      floor: form.floor ? parseInt(form.floor) : null,
      price: form.price ? parseInt(form.price) : null,
      available_from: form.available_from || null,
      notes: form.notes.trim() || null,
      room_rental: form.room_rental,
      status: form.status,
    }
    let result
    if (isEdit && savedUnit) {
      const { data, error: err } = await supabase.from('listing_units').update(payload).eq('id', savedUnit.id).select().single()
      if (err) { setError(err.message); setSaving(false); return }
      result = data
    } else {
      const { data, error: err } = await supabase.from('listing_units').insert(payload).select().single()
      if (err) { setError(err.message); setSaving(false); return }
      result = data
    }
    setSavedUnit(result)
    setSaving(false)
    if (!form.room_rental) { onSaved(result); onClose() }
    // If room_rental, stay open so landlord can add rooms
  }

  const handleToggleRented = async () => {
    if (!savedUnit) return
    const next = savedUnit.status === 'rented' ? 'available' : 'rented'
    await supabase.from('listing_units').update({ status: next }).eq('id', savedUnit.id)
    setSavedUnit(prev => ({ ...prev, status: next }))
    onSaved({ ...savedUnit, status: next })
  }

  const basePricePlaceholder = basePrice ? `base $${basePrice}` : 'listing base price'

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <h3 className="font-semibold text-gray-900 mb-4">{isEdit ? 'Edit Unit' : 'Add Unit'}</h3>

        <div className="space-y-3">
          <div>
            <label className={labelClass}>Unit name *</label>
            <input className={inputClass} placeholder="e.g. Unit 2A" maxLength={60}
              value={form.unit_name} onChange={e => setForm(p => ({ ...p, unit_name: e.target.value }))} />
          </div>

          <div>
            <label className={labelClass}>Rental type</label>
            <div className="flex gap-2">
              {[{ val: false, label: 'Whole unit' }, { val: true, label: 'Individual rooms' }].map(opt => (
                <button key={String(opt.val)} type="button"
                  onClick={() => setForm(p => ({ ...p, room_rental: opt.val }))}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium transition ${form.room_rental === opt.val ? 'bg-red-700 text-white border-red-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Floor</label>
              <input className={inputClass} type="number" placeholder="e.g. 2"
                value={form.floor} onChange={e => setForm(p => ({ ...p, floor: e.target.value }))} />
            </div>
            <div>
              <label className={labelClass}>Price/mo</label>
              <input className={inputClass} type="number" placeholder={basePricePlaceholder}
                value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))} />
            </div>
          </div>

          <div>
            <label className={labelClass}>Available from</label>
            <input className={inputClass} type="date"
              value={form.available_from} onChange={e => setForm(p => ({ ...p, available_from: e.target.value }))} />
          </div>

          <div>
            <label className={labelClass}>Notes (optional)</label>
            <input className={inputClass} maxLength={300} placeholder="e.g. Corner unit, extra windows"
              value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
          </div>

          {savedUnit && !form.room_rental && (
            <div className="flex items-center justify-between py-2 border-t border-gray-100">
              <span className="text-sm text-gray-600">Mark as rented</span>
              <button onClick={handleToggleRented}
                className={`w-10 h-6 rounded-full transition-colors ${savedUnit.status === 'rented' ? 'bg-red-700' : 'bg-gray-200'}`}>
                <span className={`block w-4 h-4 bg-white rounded-full shadow transform transition-transform mx-1 ${savedUnit.status === 'rented' ? 'translate-x-4' : ''}`} />
              </button>
            </div>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button onClick={handleSave} disabled={saving}
              className="flex-1 bg-red-700 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-red-800 transition disabled:opacity-50">
              {saving ? 'Saving...' : savedUnit ? 'Update unit' : 'Save unit'}
            </button>
            <button onClick={onClose}
              className="flex-1 border border-gray-200 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
              {savedUnit && form.room_rental ? 'Done' : 'Cancel'}
            </button>
          </div>
        </div>

        {savedUnit && form.room_rental && (
          <RoomEditor unitId={savedUnit.id} basePricePlaceholder={basePricePlaceholder} />
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/listings/UnitEditorModal.jsx
git commit -m "feat: add UnitEditorModal with room sub-editor for landlords"
```

---

## Task 7: BulkAddModal Component (Landlord)

**Files:**
- Create: `src/components/listings/BulkAddModal.jsx`

- [ ] **Step 1: Create the modal**

Create `src/components/listings/BulkAddModal.jsx`:

```jsx
import { useState } from 'react'
import { supabase } from '../../lib/supabase'

const inputClass = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
const labelClass = "block text-xs font-medium text-gray-500 mb-1"

export default function BulkAddModal({ listingId, existingCount, onSaved, onClose }) {
  const [count, setCount] = useState('')
  const [prefix, setPrefix] = useState('Unit')
  const [roomRental, setRoomRental] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const handleSave = async () => {
    const n = parseInt(count)
    if (!n || n < 1 || n > 50) { setError('Enter a number between 1 and 50.'); return }
    setSaving(true)
    setError(null)
    const units = Array.from({ length: n }, (_, i) => ({
      listing_id: listingId,
      unit_name: `${prefix.trim() || 'Unit'} ${existingCount + i + 1}`,
      room_rental: roomRental,
      sort_order: existingCount + i,
    }))
    const { data, error: err } = await supabase.from('listing_units').insert(units).select()
    if (err) { setError(err.message); setSaving(false); return }
    onSaved(data)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <h3 className="font-semibold text-gray-900">Bulk Add Units</h3>

        <div>
          <label className={labelClass}>How many units?</label>
          <input className={inputClass} type="number" min={1} max={50} placeholder="e.g. 12"
            value={count} onChange={e => setCount(e.target.value)} />
        </div>

        <div>
          <label className={labelClass}>Name prefix</label>
          <input className={inputClass} placeholder="Unit" maxLength={30}
            value={prefix} onChange={e => setPrefix(e.target.value)} />
          <p className="text-xs text-gray-400 mt-1">
            Will generate: {prefix || 'Unit'} {existingCount + 1}, {prefix || 'Unit'} {existingCount + 2}...
          </p>
        </div>

        <div>
          <label className={labelClass}>Rental type</label>
          <div className="flex gap-2">
            {[{ val: false, label: 'Whole unit' }, { val: true, label: 'Individual rooms' }].map(opt => (
              <button key={String(opt.val)} type="button"
                onClick={() => setRoomRental(opt.val)}
                className={`flex-1 py-2 rounded-lg border text-sm font-medium transition ${roomRental === opt.val ? 'bg-red-700 text-white border-red-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex gap-2">
          <button onClick={handleSave} disabled={saving || !count}
            className="flex-1 bg-red-700 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-red-800 transition disabled:opacity-50">
            {saving ? 'Adding...' : 'Add Units'}
          </button>
          <button onClick={onClose}
            className="flex-1 border border-gray-200 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/listings/BulkAddModal.jsx
git commit -m "feat: add BulkAddModal for landlord bulk unit creation"
```

---

## Task 8: Wire Unit Editor into CreateListingPage (Step 4)

**Files:**
- Modify: `src/pages/CreateListingPage.jsx`

- [ ] **Step 1: Add imports and state**

At the top of `CreateListingPage.jsx`, add imports:
```js
import UnitEditorModal from '../components/listings/UnitEditorModal'
import BulkAddModal from '../components/listings/BulkAddModal'
```

Inside the `CreateListingPage` component, after the existing state declarations, add:
```js
const [units, setUnits] = useState([])
const [unitModalOpen, setUnitModalOpen] = useState(false)
const [editingUnit, setEditingUnit] = useState(null) // null = adding new
const [bulkModalOpen, setBulkModalOpen] = useState(false)
```

- [ ] **Step 2: Fetch units in edit mode**

In the existing `useEffect([mode, listing])` that seeds form state, after `setExistingImages(...)`, add:
```js
if (listing?.id) {
  supabase
    .from('listing_units')
    .select('*, listing_unit_rooms(*)')
    .eq('listing_id', listing.id)
    .order('sort_order')
    .then(({ data }) => setUnits(data || []))
}
```

- [ ] **Step 3: Update the step indicator and canProceed**

Find the step indicator array `[1, 2, 3]` and replace with `[1, 2, 3, ...(isRenter ? [] : [4])]`:

Replace:
```jsx
{[1, 2, 3].map(s => (
  <div key={s} className="flex items-center gap-2">
    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
      s < step ? 'bg-green-500 text-white' :
      s === step ? 'bg-red-700 text-white' :
      'bg-gray-100 text-gray-400'
    }`}>
      {s < step ? '✓' : s}
    </div>
    <span className={`text-sm ${s === step ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>
      {s === 1 ? 'Property' : s === 2 ? 'Details' : 'Photos'}
    </span>
    {s < 3 && <div className={`w-8 h-px ${s < step ? 'bg-green-400' : 'bg-gray-200'}`} />}
  </div>
))}
```
With:
```jsx
{[1, 2, 3, ...(isRenter ? [] : [4])].map((s, idx, arr) => (
  <div key={s} className="flex items-center gap-2">
    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
      s < step ? 'bg-green-500 text-white' :
      s === step ? 'bg-red-700 text-white' :
      'bg-gray-100 text-gray-400'
    }`}>
      {s < step ? '✓' : s}
    </div>
    <span className={`text-sm ${s === step ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>
      {s === 1 ? 'Property' : s === 2 ? 'Details' : s === 3 ? 'Photos' : 'Units'}
    </span>
    {idx < arr.length - 1 && <div className={`w-8 h-px ${s < step ? 'bg-green-400' : 'bg-gray-200'}`} />}
  </div>
))}
```

Update `canProceed` — Step 4 is always valid (units are optional):
```js
const canProceed = () => {
  if (step === 1) return form.title && form.property_type && form.city
  if (step === 2) return form.price && form.bedrooms && form.bathrooms
  return true
}
```
(No change needed — `return true` already covers step 3 and 4.)

Update the Next/Submit button logic. Find:
```jsx
{step < 3 ? (
```
Replace with:
```jsx
{step < (isRenter ? 3 : 4) ? (
```

Find the Submit button label area — the button that calls `handleSubmit`. Ensure the button only appears on the final step. The existing condition `step === 3` should become:
```jsx
onClick={step === (isRenter ? 3 : 4) ? handleSubmit : () => setStep(s => s + 1)}
```

- [ ] **Step 4: Add Step 4 JSX**

After the closing `})}` of the Step 3 photos section (look for `{/* Step 3`), add:

```jsx
{/* Step 4: Units (landlords only) */}
{step === 4 && !isRenter && (
  <div className="space-y-4">
    <div>
      <h2 className="font-semibold text-gray-800 text-lg mb-1">Units</h2>
      <p className="text-sm text-gray-500 mb-4">
        Add individual units if this listing has multiple rentable spaces (e.g. apartments in a building, rooms in a house).
      </p>
    </div>

    {/* Unit chips */}
    <div className="flex flex-wrap gap-2">
      {units.map(unit => {
        const isRented = unit.room_rental
          ? false
          : unit.status === 'rented'
        return (
          <div key={unit.id} className={`flex items-center gap-2 border rounded-lg px-3 py-1.5 text-xs ${isRented ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-200'}`}>
            <span className="font-medium text-gray-800">{unit.unit_name}</span>
            {unit.floor != null && <span className="text-gray-400">· Floor {unit.floor}</span>}
            {unit.price && <span className="text-gray-400">· ${unit.price}/mo</span>}
            {isRented && <span className="text-xs bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded-full">Rented</span>}
            <button
              type="button"
              onClick={() => { setEditingUnit(unit); setUnitModalOpen(true) }}
              className="text-red-700 font-medium hover:text-red-800"
            >
              Edit
            </button>
            {!isRented && (
              <button
                type="button"
                onClick={async () => {
                  await supabase.from('listing_units').delete().eq('id', unit.id)
                  setUnits(prev => prev.filter(u => u.id !== unit.id))
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            )}
          </div>
        )
      })}
    </div>

    {/* Add unit / Bulk add */}
    <button
      type="button"
      onClick={() => { setEditingUnit(null); setUnitModalOpen(true) }}
      className="w-full border border-dashed border-gray-300 rounded-lg py-2.5 text-sm text-gray-500 hover:border-red-300 hover:text-red-700 transition"
    >
      + Add unit
    </button>
    <div className="text-center">
      <button
        type="button"
        onClick={() => setBulkModalOpen(true)}
        className="text-xs text-red-700 font-medium hover:underline"
      >
        Bulk add multiple units
      </button>
    </div>
  </div>
)}

{/* Modals */}
{unitModalOpen && (
  <UnitEditorModal
    listingId={mode === 'edit' ? listing?.id : null}
    basePrice={form.price ? parseInt(form.price) : null}
    unit={editingUnit}
    onSaved={(saved) => {
      setUnits(prev => {
        const idx = prev.findIndex(u => u.id === saved.id)
        if (idx >= 0) {
          const next = [...prev]; next[idx] = { ...prev[idx], ...saved }; return next
        }
        return [...prev, saved]
      })
    }}
    onClose={() => { setUnitModalOpen(false); setEditingUnit(null) }}
  />
)}
{bulkModalOpen && (
  <BulkAddModal
    listingId={mode === 'edit' ? listing?.id : null}
    existingCount={units.length}
    onSaved={(newUnits) => setUnits(prev => [...prev, ...newUnits])}
    onClose={() => setBulkModalOpen(false)}
  />
)}
```

**Note:** When `mode === 'create'`, the listing doesn't exist yet when the user is on Step 4. The unit modals need a `listingId` to insert rows. Handle this by creating the listing on "Save Changes" / moving to Step 4 in create mode — or, simpler: in create mode, hide Step 4 and show a note "You can add units after publishing." Add this guard inside Step 4:

Replace the `listingId={mode === 'edit' ? listing?.id : null}` in both modals with:
```jsx
listingId={listing?.id || null}
```

And add at the top of the Step 4 JSX block, before the chips:
```jsx
{mode === 'create' && (
  <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 rounded-lg">
    Units can be added after publishing your listing. Click "Publish Listing" then use Edit to add units.
  </div>
)}
{mode === 'edit' && (
  <>
    {/* chips, add button, bulk add — existing JSX */}
  </>
)}
```

- [ ] **Step 5: Verify in browser**

Go to Edit Listing as a landlord. A new "Units" step (Step 4) appears. "+ Add unit" opens the modal. Saving a unit shows it as a chip. Bulk add generates multiple chips. Renter accounts do not see Step 4.

- [ ] **Step 6: Commit**

```bash
git add src/pages/CreateListingPage.jsx
git commit -m "feat: add Step 4 units editor to CreateListingPage for landlords"
```

---

## Task 9: Update ConversationPage for Unit/Room Context

**Files:**
- Modify: `src/pages/ConversationPage.jsx`

- [ ] **Step 1: Read unit/room from router state and pre-fill message**

In `ConversationPage`, find where `newConvoState` is destructured from `location.state`. The existing code reads `listingId`, `landlordId`, `listing`, `landlord`. Update the initialization `useEffect` that sets up the "new" conversation state:

Find:
```js
setConversation({
  id: null,
  renter_id: user.id,
  landlord_id: newConvoState.landlordId,
  listing: newConvoState.listing,
  landlord: newConvoState.landlord,
  renter: user?.profile,
})
setLoading(false)
```

Replace with:
```js
setConversation({
  id: null,
  renter_id: user.id,
  landlord_id: newConvoState.landlordId,
  listing: newConvoState.listing,
  landlord: newConvoState.landlord,
  renter: user?.profile,
})
// Pre-fill message with unit/room context
if (newConvoState.unitName) {
  const roomPart = newConvoState.roomName
    ? ` (${newConvoState.roomName})`
    : ''
  setNewMessage(`Hi, I'm interested in ${newConvoState.unitName}${roomPart} — is it still available?`)
}
setLoading(false)
```

- [ ] **Step 2: Pass unit/room to conversation insert**

In the `handleSend` function, inside the `if (isNew)` branch, find the conversation insert:
```js
const { data: convo, error: convoErr } = await supabase
  .from('conversations')
  .insert({
    listing_id: newConvoState.listingId,
    renter_id: user.id,
    landlord_id: newConvoState.landlordId,
  })
  .select('id')
  .single()
```

Replace with:
```js
const { data: convo, error: convoErr } = await supabase
  .from('conversations')
  .insert({
    listing_id: newConvoState.listingId,
    renter_id: user.id,
    landlord_id: newConvoState.landlordId,
    unit_id: newConvoState.unitId || null,
    room_id: newConvoState.roomId || null,
  })
  .select('id')
  .single()
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/ConversationPage.jsx
git commit -m "feat: pre-fill unit/room request message and save to conversation"
```

---

## Task 10: Update Inbox Labels

**Files:**
- Modify: `src/pages/MessagesInboxPage.jsx`

- [ ] **Step 1: Add unit/room to the fetch**

In `fetchConversations`, update the select string. Find:
```js
.select(`
  id, last_message, last_message_at, renter_unread, landlord_unread,
  listing:listing_id(id, title, city, listing_images(url, is_primary)),
  renter:renter_id(id, full_name, avatar_url, email),
  landlord:landlord_id(id, full_name, avatar_url, email)
`)
```

Replace with:
```js
.select(`
  id, last_message, last_message_at, renter_unread, landlord_unread,
  listing:listing_id(id, title, city, listing_images(url, is_primary)),
  renter:renter_id(id, full_name, avatar_url, email),
  landlord:landlord_id(id, full_name, avatar_url, email),
  unit:unit_id(id, unit_name),
  room:room_id(id, room_name)
`)
```

- [ ] **Step 2: Update the listing title label in the row**

Find the listing subtitle line:
```jsx
<p className="text-xs text-gray-500 truncate mt-0.5">
  {convo.listing?.title || 'Listing'}
  {convo.listing?.city ? ` · ${convo.listing.city}` : ''}
</p>
```

Replace with:
```jsx
<p className="text-xs text-gray-500 truncate mt-0.5">
  {convo.listing?.title || 'Listing'}
  {convo.unit?.unit_name ? ` · ${convo.unit.unit_name}` : ''}
  {convo.room?.room_name ? ` / ${convo.room.room_name}` : ''}
  {convo.listing?.city ? ` · ${convo.listing.city}` : ''}
</p>
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/MessagesInboxPage.jsx
git commit -m "feat: show unit/room label in messages inbox conversation rows"
```

---

## Task 11: End-to-End Verification

- [ ] **Step 1: Verify landlord flow**
  1. Log in as a landlord
  2. Go to Edit Listing on any active listing
  3. Navigate to Step 4 (Units)
  4. Click "+ Add unit" → fill in Unit 1A, Floor 1, Whole unit → Save
  5. Verify chip appears: `Unit 1A · Floor 1`
  6. Click "+ Add unit" again → Individual rooms → Save unit → Add 3 rooms (Master $750, Room 2 $650, Room 3 $650)
  7. Click Done
  8. Click "Bulk add" → enter 3, prefix "Apt" → Add Units
  9. Verify 3 more chips appear: Apt 4, Apt 5, Apt 6

- [ ] **Step 2: Verify search results**
  1. Go to `/listings`
  2. Find the listing you just edited
  3. Verify the card shows unit chips and "From $X" price

- [ ] **Step 3: Verify listing detail (renter view)**
  1. Open the listing detail page while logged out or as a different account
  2. Verify "Available Units" section appears below Details
  3. Whole units show a "Request" button; room-rental units are collapsible with per-room rows

- [ ] **Step 4: Verify request flow**
  1. Click "Request" on Unit 1A
  2. Verify navigation to `/messages/new` with pre-filled message: `"Hi, I'm interested in Unit 1A — is it still available?"`
  3. Send the message
  4. Verify conversation is created and inbox shows `[Listing Title] · Unit 1A · [City]`

- [ ] **Step 5: Verify rented/occupied greying**
  1. Edit Unit 1A → toggle "Mark as rented"
  2. Return to listing detail — Unit 1A should appear greyed at the bottom with no Request button

- [ ] **Step 6: Commit if any small fixes were needed**

```bash
git add -p
git commit -m "fix: multi-unit listing end-to-end verification fixes"
```

---

## Task 12: Final Commit

- [ ] **Step 1: Verify no console errors in browser DevTools on all touched pages**

- [ ] **Step 2: Final commit**

```bash
git add .
git commit -m "feat: multi-unit listings with room-level availability and request flow"
```
