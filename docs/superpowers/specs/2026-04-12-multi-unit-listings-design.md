# Multi-Unit Listings — Design Spec
**Date:** 2026-04-12

## Overview

Landlords managing apartment complexes or multi-room houses can post a single base listing and attach multiple units beneath it. Each unit can have named rooms with individual pricing and availability. Renters see all units and rooms in one place and can request a specific room, which opens a pre-filled chat with the landlord.

---

## Data Model

### NEW: `listing_units`

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `listing_id` | uuid FK → listings | cascade delete |
| `unit_name` | text NOT NULL | e.g. "Unit 2A", max 60 chars |
| `floor` | int | nullable |
| `price` | int | nullable — falls back to `listings.price` if null |
| `available_from` | date | nullable — falls back to `listings.available_from` if null |
| `notes` | text | nullable, max 300 chars |
| `status` | text | `available` \| `rented`, default `available`. Used when `room_rental = false` |
| `room_rental` | boolean | false = whole unit rented as one; true = individual rooms rented separately |
| `sort_order` | int | default 0, controls display order |
| `created_at` | timestamptz | default now() |

### NEW: `listing_unit_rooms`

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `unit_id` | uuid FK → listing_units | cascade delete |
| `room_name` | text NOT NULL | e.g. "Master", "Room 1", max 60 chars |
| `price` | int | nullable — falls back to `listing_units.price` then `listings.price` |
| `available_from` | date | nullable — falls back up the chain |
| `status` | text | `available` \| `occupied`, default `available` |
| `sort_order` | int | default 0 |

Only used when `listing_units.room_rental = true`. When `room_rental = false`, room rows are ignored.

### MODIFIED: `conversations`

Add two nullable FK columns:
- `unit_id` uuid FK → listing_units
- `room_id` uuid FK → listing_unit_rooms

Both nullable. Set when renter requests a specific unit or room. Used to display a unit/room label in the inbox.

### RLS Policies

- `listing_units` SELECT: public (matches listings visibility)
- `listing_units` INSERT/UPDATE/DELETE: `auth.uid()` must be `listings.landlord_id` (enforced via a security definer function or join policy)
- `listing_unit_rooms` SELECT: public
- `listing_unit_rooms` INSERT/UPDATE/DELETE: same landlord check via `unit_id → listing_id → landlord_id`

---

## Search Results (ListingsPage)

### Query change
The listings fetch adds:
```js
listing_units(id, unit_name, price, status, room_rental,
  listing_unit_rooms(id, status))
```
Limited to the first 3 units for the card strip; total available count computed client-side.

### ListingCard additions (when units exist)
- Price label changes from `$1,400/mo` to `From $1,400/mo` (lowest available unit/room price)
- Unit strip appears below price: `Unit 1A · Unit 2A · +10 more →`
- Strip only shows `status = 'available'` units (or units with at least one `available` room when `room_rental = true`)
- Listings with no units render exactly as today — no change

---

## Listing Detail Page (Renter View)

### Available Units section
Rendered below the existing Details section. Only shown when the listing has at least one unit.

Header: `Available Units (N)` where N = count of available units (or units with available rooms).

#### Whole-unit rentals (`room_rental = false`)
Each unit renders as a compact row:
```
Unit 2A   Floor 2 · Available Jun 1   Corner unit     $1,450/mo   [Request]
```
- Rented units shown greyed out at the bottom, no button, labelled "Rented"
- Sorted by `sort_order`, rented units pushed to end

#### Room-rental units (`room_rental = true`)
Unit renders as a collapsible section header:
```
▾ Unit 2A — 3BR shared   Floor 2   (2 of 3 rooms available)
  Room 1  Master · Available May 1          $750/mo   [Request]
  Room 2  Standard                          $650/mo   Occupied
  Room 3  Standard · Available Jun 1        $650/mo   [Request]
```
- Unit header shows total bedrooms and available count
- Room rows use same compact row style as whole-unit rows
- Occupied rooms greyed, no button

### Request button behaviour
1. If not logged in → redirect to `/login`
2. If own listing → buttons hidden, replaced with "Edit units" link
3. If logged in and not owner:
   - Check for existing conversation on `(listing_id, renter_id)`
   - If exists → navigate to `/messages/:id`
   - If not → navigate to `/messages/new` with router state:
     ```js
     { listingId, landlordId, listing, landlord, unitId, unitName, roomId?, roomName? }
     ```
   - `ConversationPage` in new mode pre-fills the message input:
     - Whole unit: `"Hi, I'm interested in Unit 2A — is it still available?"`
     - Room: `"Hi, I'm interested in Room 1 (Master) in Unit 2A — is it still available?"`
   - On first send, conversation row is created with `unit_id` and optionally `room_id` set

### Inbox label
In `MessagesInboxPage` and `ConversationPage`, conversation rows display:
- Today: `Browns Court · Charlottetown`
- With unit: `Browns Court · Unit 2A · Charlottetown`
- With room: `Browns Court · Unit 2A / Room 1 · Charlottetown`

---

## Landlord Unit Editor (Edit Listing Page)

A new **Step 4: Units** is added to `CreateListingPage` (after photos). Only shown to landlords; renters posting subleases do not see this step.

### Viewing existing units
Units displayed as chips:
```
[Unit 2A · Floor 2 · $1,450]  Edit  ✕
[Unit 1B · Floor 1 · Rented]  Edit
```
- Rented whole-units and fully-occupied room-rental units show a "Rented"/"Full" badge
- Landlord cannot delete a unit/room with status `rented`/`occupied` — must mark it available first
- Chips can be dragged to reorder (updates `sort_order`)

### Adding a unit — modal
Fields:
| field | required | notes |
|---|---|---|
| Unit name | yes | max 60 chars |
| Floor | no | number input |
| Rental type | yes | toggle: "Whole unit" / "Individual rooms" |
| Price | no | placeholder: "Leave blank to use base price ($X)" |
| Available date | no | placeholder: "Leave blank to use listing date" |
| Notes | no | max 300 chars |

Save inserts into `listing_units` immediately (independent of the main listing save).

If "Individual rooms" selected, after saving the unit the modal advances to a room editor sub-section where the landlord adds rooms one by one (room name, price, available date, status). Rooms can be added/edited later by clicking Edit on the unit chip.

### Bulk add shortcut
A secondary "Bulk add" link beneath "+ Add unit" opens a simpler modal:
- Number input: "How many units?"
- Prefix input: "Name prefix" (e.g. "Unit" → generates "Unit 1", "Unit 2"...)
- Rental type toggle (applies to all generated units)

Generates N units with auto-incremented names, all inheriting base listing price and date. Landlord edits individual units afterward.

### Marking status
Inside the Edit unit modal:
- Whole unit: "Mark as rented" toggle → sets `status = 'rented'`
- Room-rental unit: each room row has "Mark as occupied" toggle → sets room `status = 'occupied'`

Status changes save immediately on toggle.

---

## New Files

| file | purpose |
|---|---|
| `supabase/migration_listing_units.sql` | Creates `listing_units` and `listing_unit_rooms` tables with RLS |
| `src/components/listings/UnitStrip.jsx` | Unit chip strip for listing cards in search results |
| `src/components/listings/UnitSection.jsx` | Full unit/room list shown on listing detail page |
| `src/components/listings/UnitEditorModal.jsx` | Add/edit unit modal (landlord) |
| `src/components/listings/BulkAddModal.jsx` | Bulk unit generation modal (landlord) |

---

## Modified Files

| file | change |
|---|---|
| `src/pages/ListingsPage.jsx` | Add units join to fetch; pass unit data to `ListingCard`; show "From $X" price |
| `src/pages/ListingDetailPage.jsx` | Add `UnitSection` below details; update `handleContact` to pass `unitId`/`roomId` |
| `src/pages/CreateListingPage.jsx` | Add Step 4 (Units) for landlords; render `UnitEditorModal`, chips, bulk add |
| `src/pages/ConversationPage.jsx` | Read `unitId`/`roomId` from router state; pre-fill message; pass to conversation insert |
| `src/pages/MessagesInboxPage.jsx` | Show unit/room label in conversation rows |
| `supabase/schema.sql` | Add new tables and modified conversations columns |

---

## Edge Cases

- **Listing with no units**: all existing behaviour unchanged. `UnitSection` and `UnitStrip` render nothing.
- **Unit with no rooms but `room_rental = true`**: treat as 0 available, show "No rooms added yet" in unit section.
- **All units rented**: listing remains visible in search but unit strip shows "No units currently available". Landlord should manually set listing `status = 'inactive'` if fully rented out.
- **Price fallback chain**: room price → unit price → listing price. Display whichever is set first down the chain.
- **Renter requests unit that becomes rented before they send**: no real-time block needed. Landlord sees the message and responds. No auto-rejection.
- **Conversation already exists for listing**: navigates to existing conversation regardless of which unit/room was clicked. The unit label on the conversation is set at creation time only.
