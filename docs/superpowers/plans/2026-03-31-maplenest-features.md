
# MapleNest Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement four features: listing metadata on cards, saved listings, analytics dashboard, and renter sublease posting.

**Architecture:** All frontend uses React + Supabase (no direct calls to the Express/MongoDB backend). Saved listings and sublease require small Supabase schema additions run via the Supabase SQL editor. Analytics are computed client-side from Supabase data using pure Tailwind CSS bar charts (no new library dependencies).

**Tech Stack:** React 18, Vite, Tailwind CSS 3, Supabase JS v2, React Router v6

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `src/pages/ListingsPage.jsx` | Modify | Add posted date + views to `ListingCard`; add save button to card |
| `src/pages/ListingDetailPage.jsx` | Modify | Add save/unsave button to the contact card sidebar |
| `src/pages/ProfilePage.jsx` | Modify | Add "Saved" tab for renters showing their saved listings |
| `src/pages/AnalyticsPage.jsx` | Create | New page with price stats + bar charts from Supabase data |
| `src/hooks/useSavedListings.jsx` | Create | Hook: fetch saved IDs, toggle save, expose `isSaved()` |
| `src/App.jsx` | Modify | Add `/analytics` route; change `/create-listing` guard to allow renters |
| `src/components/shared/Navbar.jsx` | Modify | Add Analytics link; show "+ Post Sublease" button for renters |
| `src/pages/CreateListingPage.jsx` | Modify | Add `sublease` property type option; lock renters to sublease only |
| `src/utils/listingPermissions.js` | Modify | Allow renter to modify their own sublease listing |
| `supabase/schema.sql` | Modify | Add `saved_listings` table and extend `property_type` CHECK |
| `supabase/migration_saved_listings.sql` | Create | SQL to run in Supabase dashboard for saved_listings table + RLS |
| `supabase/migration_sublease.sql` | Create | SQL to run in Supabase dashboard to add 'sublease' to property_type |

---

## Task 1: Listing Metadata on Cards (posted date + views)

**Files:**
- Modify: `src/pages/ListingsPage.jsx` (lines 9–56, the `ListingCard` component)

The listing card currently shows title, price, city, bedrooms, bathrooms, pet-friendly, parking. Add a subtle footer row showing "Posted X days ago" and view count.

- [ ] **Step 1: Add a `timeAgo` helper at the top of `ListingsPage.jsx`**

Place this after the `TYPE_LABELS` constant at line 7, before `function ListingCard`:

```jsx
const timeAgo = (dateStr) => {
  const days = Math.floor((Date.now() - new Date(dateStr)) / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return '1 day ago'
  if (days < 30) return `${days} days ago`
  const months = Math.floor(days / 30)
  return months === 1 ? '1 month ago' : `${months} months ago`
}
```

- [ ] **Step 2: Add the metadata row inside `ListingCard`**

In `ListingCard`, after the amenities row (`<div className="flex items-center gap-3 text-xs text-gray-500">`), add:

```jsx
<div className="flex items-center justify-between pt-2 mt-2 border-t border-gray-50 text-xs text-gray-400">
  <span>Posted {timeAgo(listing.created_at)}</span>
  {listing.views > 0 && <span>👁 {listing.views}</span>}
</div>
```

- [ ] **Step 3: Verify in browser**

Run `npm run dev`. Open `/listings`. Each card should show "Posted X days ago" at the bottom and a view count if views > 0.

- [ ] **Step 4: Commit**

```bash
cd /Users/ayo/MapleNest
git add src/pages/ListingsPage.jsx
git commit -m "feat: add posting date and view count to listing cards"
```

---

## Task 2: Saved Listings

### Task 2a: Supabase schema — `saved_listings` table

**Files:**
- Create: `supabase/migration_saved_listings.sql`
- Modify: `supabase/schema.sql`

- [ ] **Step 1: Create the migration SQL file**

Create `supabase/migration_saved_listings.sql` with this content:

```sql
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)

CREATE TABLE IF NOT EXISTS public.saved_listings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  listing_id UUID REFERENCES public.listings(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, listing_id)
);

-- RLS: users can only see and manage their own saved listings
ALTER TABLE public.saved_listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own saved listings"
  ON public.saved_listings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can save listings"
  ON public.saved_listings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unsave listings"
  ON public.saved_listings FOR DELETE
  USING (auth.uid() = user_id);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS saved_listings_user_id_idx ON public.saved_listings(user_id);
CREATE INDEX IF NOT EXISTS saved_listings_listing_id_idx ON public.saved_listings(listing_id);
```

- [ ] **Step 2: Run the migration**

Open the Supabase dashboard → SQL Editor → paste the contents of `supabase/migration_saved_listings.sql` → Run. Confirm the `saved_listings` table appears in Table Editor.

- [ ] **Step 3: Add `saved_listings` table definition to `supabase/schema.sql`**

Append after the `listing_images` table block in `schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS public.saved_listings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  listing_id UUID REFERENCES public.listings(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, listing_id)
);
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migration_saved_listings.sql supabase/schema.sql
git commit -m "feat: add saved_listings table schema and migration"
```

### Task 2b: `useSavedListings` hook

**Files:**
- Create: `src/hooks/useSavedListings.jsx`

- [ ] **Step 1: Create the hook**

```jsx
// src/hooks/useSavedListings.jsx
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

export function useSavedListings() {
  const { user } = useAuth()
  const [savedIds, setSavedIds] = useState(new Set())
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!user) { setSavedIds(new Set()); return }
    setLoading(true)
    supabase
      .from('saved_listings')
      .select('listing_id')
      .eq('user_id', user.id)
      .then(({ data }) => {
        setSavedIds(new Set((data || []).map(r => r.listing_id)))
        setLoading(false)
      })
  }, [user])

  const isSaved = useCallback((listingId) => savedIds.has(listingId), [savedIds])

  const toggleSave = useCallback(async (listingId) => {
    if (!user) return false
    if (savedIds.has(listingId)) {
      await supabase
        .from('saved_listings')
        .delete()
        .eq('user_id', user.id)
        .eq('listing_id', listingId)
      setSavedIds(prev => { const next = new Set(prev); next.delete(listingId); return next })
    } else {
      await supabase
        .from('saved_listings')
        .insert({ user_id: user.id, listing_id: listingId })
      setSavedIds(prev => new Set(prev).add(listingId))
    }
    return true
  }, [user, savedIds])

  return { isSaved, toggleSave, savedIds, loading }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useSavedListings.jsx
git commit -m "feat: add useSavedListings hook"
```

### Task 2c: Save button on listing cards

**Files:**
- Modify: `src/pages/ListingsPage.jsx`

The `ListingCard` is a `<Link>` element. The save button must call `e.preventDefault()` + `e.stopPropagation()` so it doesn't navigate.

- [ ] **Step 1: Import `useSavedListings` and `useAuth` in `ListingsPage.jsx`**

At the top of `ListingsPage.jsx`, add:

```jsx
import { useAuth } from '../hooks/useAuth'
import { useSavedListings } from '../hooks/useSavedListings'
```

- [ ] **Step 2: Update `ListingCard` to accept and use save props**

Change the `ListingCard` function signature and add the save button. Replace:

```jsx
function ListingCard({ listing }) {
  if (!listing) return null
  const image = listing.listing_images?.[0]?.url
  const formatPrice = (p) => `$${Number(p || 0).toLocaleString()}`
```

with:

```jsx
function ListingCard({ listing, isSaved, onToggleSave }) {
  if (!listing) return null
  const image = listing.listing_images?.[0]?.url
  const formatPrice = (p) => `$${Number(p || 0).toLocaleString()}`
```

- [ ] **Step 3: Add the save button inside the card image area**

Inside `ListingCard`, after the `utilities_included` badge div (around line 28–31), add:

```jsx
{onToggleSave && (
  <button
    onClick={e => { e.preventDefault(); e.stopPropagation(); onToggleSave(listing.id) }}
    className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center rounded-full bg-white shadow-sm hover:scale-110 transition-transform"
    title={isSaved ? 'Unsave' : 'Save listing'}
  >
    <span className={isSaved ? 'text-red-600' : 'text-gray-300'}>{isSaved ? '♥' : '♡'}</span>
  </button>
)}
```

Note: remove the existing `{listing.utilities_included && ...}` badge from `top-2 right-2` and move the save button there. Change the utilities badge to `top-2 right-10` when the save button is present, or re-position both. Simplest: move utilities badge to a different position:

Replace the utilities badge:
```jsx
{listing.utilities_included && (
  <div className="absolute top-2 right-2 bg-green-500 text-white text-xs font-medium px-2 py-1 rounded-full shadow-sm">
    Utilities incl.
  </div>
)}
```
with:
```jsx
{listing.utilities_included && (
  <div className="absolute bottom-2 left-2 bg-green-500 text-white text-xs font-medium px-2 py-1 rounded-full shadow-sm">
    Utilities incl.
  </div>
)}
{onToggleSave && (
  <button
    onClick={e => { e.preventDefault(); e.stopPropagation(); onToggleSave(listing.id) }}
    className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center rounded-full bg-white shadow-sm hover:scale-110 transition-transform"
    title={isSaved ? 'Unsave' : 'Save listing'}
  >
    <span className={isSaved ? 'text-red-600' : 'text-gray-300'}>{isSaved ? '♥' : '♡'}</span>
  </button>
)}
```

- [ ] **Step 4: Wire up the hook in `ListingsPage`**

Inside the `ListingsPage` component (after the state declarations), add:

```jsx
const { user } = useAuth()
const { isSaved, toggleSave } = useSavedListings()
```

Then update where `ListingCard` is rendered (around line 312–315):

```jsx
{listings.map(listing => (
  <ListingCard
    key={listing.id}
    listing={listing}
    isSaved={user ? isSaved(listing.id) : false}
    onToggleSave={user ? toggleSave : null}
  />
))}
```

- [ ] **Step 5: Verify in browser**

Open `/listings` while logged in. Each card shows a heart icon (♡). Click it — it turns red (♥) and stays red on reload. Click again — it goes back to ♡. Not logged in: hearts don't appear.

- [ ] **Step 6: Commit**

```bash
git add src/pages/ListingsPage.jsx
git commit -m "feat: add save button to listing cards"
```

### Task 2d: Save button on listing detail page

**Files:**
- Modify: `src/pages/ListingDetailPage.jsx`

- [ ] **Step 1: Import `useSavedListings` in `ListingDetailPage.jsx`**

Add to imports at the top:

```jsx
import { useSavedListings } from '../hooks/useSavedListings'
```

- [ ] **Step 2: Use the hook inside `ListingDetailPage`**

Inside `ListingDetailPage`, after `const [contacting, setContacting] = useState(false)` add:

```jsx
const { isSaved, toggleSave } = useSavedListings()
```

- [ ] **Step 3: Add save button to the right-column contact card**

In the contact card sidebar, after the price block and before the `{contactError && ...}` block, add:

```jsx
{user && !isOwnListing && (
  <button
    onClick={() => toggleSave(listing.id)}
    className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium transition mb-3 ${
      isSaved(listing.id)
        ? 'border-red-200 text-red-700 bg-red-50 hover:bg-red-100'
        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
    }`}
  >
    <span>{isSaved(listing.id) ? '♥' : '♡'}</span>
    {isSaved(listing.id) ? 'Saved' : 'Save Listing'}
  </button>
)}
```

- [ ] **Step 4: Verify in browser**

Open a listing detail page while logged in (as a non-owner). The sidebar shows a "Save Listing" button. Click it — it changes to "♥ Saved" with red styling. Navigate to `/listings` — the card shows the filled heart. Click again to unsave.

- [ ] **Step 5: Commit**

```bash
git add src/pages/ListingDetailPage.jsx
git commit -m "feat: add save button to listing detail page"
```

### Task 2e: Saved tab on Profile page

**Files:**
- Modify: `src/pages/ProfilePage.jsx`

- [ ] **Step 1: Add saved listings state and fetch in `ProfilePage`**

Inside `ProfilePage`, add state for saved listings after the `reviews` state:

```jsx
const [savedListings, setSavedListings] = useState([])
```

Inside `fetchAll`, add a fetch for saved listings (only for own profile):

```jsx
// Inside the Promise.all in fetchAll, add a 4th entry:
const [{ data: prof }, { data: listData }, { data: revData }, { data: savedData }] = await Promise.all([
  supabase.from('profiles').select('*').eq('id', viewingId).single(),
  supabase.from('listings').select('id, title, city, property_type, status, price, created_at, listing_images(url, is_primary)')
    .eq('landlord_id', viewingId).eq('status', 'active').order('created_at', { ascending: false }),
  supabase.from('reviews').select('*, reviewer:reviewer_id(full_name, avatar_url, email)')
    .eq('reviewee_id', viewingId).order('created_at', { ascending: false }),
  isOwn
    ? supabase.from('saved_listings').select('listing_id, listings(id, title, city, property_type, price, created_at, listing_images(url, is_primary))').eq('user_id', viewingId).order('created_at', { ascending: false })
    : Promise.resolve({ data: [] }),
])
```

After setting other state, add:

```jsx
setSavedListings((savedData || []).map(r => r.listings).filter(Boolean))
```

- [ ] **Step 2: Add "Saved" tab to the TABS array**

In the `TABS` array definition, add a saved tab after the reviews tab:

```jsx
const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'listings', label: `Listings (${listings.length})`, show: isLandlord },
  { key: 'reviews', label: `Reviews (${reviews.length})` },
  ...(isOwn ? [
    { key: 'saved', label: `Saved (${savedListings.length})` },
    { key: 'settings', label: '⚙️ Settings' },
  ] : []),
].filter(t => t.show !== false)
```

- [ ] **Step 3: Add the saved tab panel**

After the reviews tab panel (`{tab === 'reviews' && ...}`) and before the settings tab panel, add:

```jsx
{tab === 'saved' && isOwn && (
  <Section title="Saved Listings">
    {savedListings.length === 0 ? (
      <p className="text-sm text-gray-400 text-center py-6">
        No saved listings yet. Browse listings and click ♡ to save them.
      </p>
    ) : (
      <div className="space-y-3">
        {savedListings.map(l => {
          const img = l.listing_images?.find(i => i.is_primary) || l.listing_images?.[0]
          return (
            <Link key={l.id} to={`/listings/${l.id}`}
              className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition">
              <div className="w-14 h-14 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
                {img ? <img src={img.url} alt="" className="w-full h-full object-cover" /> :
                  <div className="w-full h-full flex items-center justify-center text-gray-300 text-xl">🏠</div>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-gray-800 truncate">{l.title}</p>
                <p className="text-xs text-gray-500">{l.city} · {l.property_type} · ${l.price}/mo</p>
              </div>
              <span className="text-red-500 text-lg">♥</span>
            </Link>
          )
        })}
      </div>
    )}
  </Section>
)}
```

Make sure `Link` is already imported — it is (from react-router-dom at line 2).

- [ ] **Step 4: Verify in browser**

Log in as a renter. Save 2–3 listings from `/listings`. Go to `/profile`. A "Saved (2)" tab appears. Click it — saved listings are shown with thumbnails, title, price. Click a listing — navigates correctly.

- [ ] **Step 5: Commit**

```bash
git add src/pages/ProfilePage.jsx
git commit -m "feat: add saved listings tab to profile page"
```

---

## Task 3: Analytics Dashboard

**Files:**
- Create: `src/pages/AnalyticsPage.jsx`
- Modify: `src/App.jsx`
- Modify: `src/components/shared/Navbar.jsx`

The analytics page fetches all active listings from Supabase and computes stats client-side. Charts are built with Tailwind div bars — no new library needed.

### Task 3a: Create `AnalyticsPage.jsx`

- [ ] **Step 1: Create the file**

```jsx
// src/pages/AnalyticsPage.jsx
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const TYPE_LABELS = {
  apartment: 'Apartment', house: 'House', room: 'Room',
  basement: 'Basement', condo: 'Condo', townhouse: 'Townhouse', sublease: 'Sublease'
}

function BarChart({ data, valueKey = 'count', labelKey = 'label', colorClass = 'bg-red-600' }) {
  const max = Math.max(...data.map(d => d[valueKey]), 1)
  return (
    <div className="flex items-end gap-2 h-40">
      {data.map(item => (
        <div key={item[labelKey]} className="flex flex-col items-center gap-1 flex-1 min-w-0">
          <span className="text-xs font-medium text-gray-700">{item[valueKey]}</span>
          <div className="w-full flex items-end" style={{ height: '120px' }}>
            <div
              className={`w-full ${colorClass} rounded-t transition-all`}
              style={{ height: `${Math.max((item[valueKey] / max) * 100, 4)}%` }}
            />
          </div>
          <span className="text-xs text-gray-500 truncate w-full text-center">{item[labelKey]}</span>
        </div>
      ))}
    </div>
  )
}

function StatCard({ label, value, sub }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 text-center">
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-sm text-gray-500 mt-1">{label}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  )
}

export default function AnalyticsPage() {
  const [listings, setListings] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('listings')
      .select('price, city, property_type, bedrooms, created_at')
      .eq('status', 'active')
      .then(({ data }) => {
        setListings(data || [])
        setLoading(false)
      })
  }, [])

  if (loading) return (
    <div className="max-w-5xl mx-auto px-4 py-10 animate-pulse space-y-4">
      <div className="h-8 bg-gray-200 rounded w-48" />
      <div className="grid grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-gray-200 rounded-xl" />)}
      </div>
      <div className="h-56 bg-gray-200 rounded-xl" />
    </div>
  )

  // Compute summary stats
  const prices = listings.map(l => l.price).filter(Boolean)
  const avgPrice = prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0
  const minPrice = prices.length ? Math.min(...prices) : 0
  const maxPrice = prices.length ? Math.max(...prices) : 0

  // By city
  const cityMap = {}
  listings.forEach(l => { cityMap[l.city] = (cityMap[l.city] || 0) + 1 })
  const byCity = Object.entries(cityMap)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)

  // By type
  const typeMap = {}
  listings.forEach(l => { typeMap[l.property_type] = (typeMap[l.property_type] || 0) + 1 })
  const byType = Object.entries(typeMap)
    .map(([key, count]) => ({ label: TYPE_LABELS[key] || key, count }))
    .sort((a, b) => b.count - a.count)

  // Avg price by city
  const cityPriceMap = {}
  listings.forEach(l => {
    if (!cityPriceMap[l.city]) cityPriceMap[l.city] = []
    cityPriceMap[l.city].push(l.price)
  })
  const avgByCity = Object.entries(cityPriceMap)
    .map(([label, arr]) => ({ label, count: Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)

  // Price buckets
  const buckets = [
    { label: '<$800', min: 0, max: 800 },
    { label: '$800–1k', min: 800, max: 1000 },
    { label: '$1k–1.2k', min: 1000, max: 1200 },
    { label: '$1.2k–1.5k', min: 1200, max: 1500 },
    { label: '$1.5k–2k', min: 1500, max: 2000 },
    { label: '>$2k', min: 2000, max: Infinity },
  ]
  const priceDistribution = buckets.map(b => ({
    label: b.label,
    count: prices.filter(p => p >= b.min && p < b.max).length,
  }))

  const fmt = (n) => `$${Number(n).toLocaleString()}`

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">PEI Rental Market</h1>
        <p className="text-gray-500 text-sm mt-1">Based on {listings.length} active listings</p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total Listings" value={listings.length} />
        <StatCard label="Average Rent" value={fmt(avgPrice)} sub="per month" />
        <StatCard label="Lowest Rent" value={fmt(minPrice)} sub="per month" />
        <StatCard label="Highest Rent" value={fmt(maxPrice)} sub="per month" />
      </div>

      {/* Charts row */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Listings by City</h2>
          <BarChart data={byCity} valueKey="count" labelKey="label" colorClass="bg-red-600" />
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Listings by Type</h2>
          <BarChart data={byType} valueKey="count" labelKey="label" colorClass="bg-red-400" />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Price Distribution</h2>
          <BarChart data={priceDistribution} valueKey="count" labelKey="label" colorClass="bg-orange-500" />
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Avg Rent by City</h2>
          <BarChart data={avgByCity} valueKey="count" labelKey="label" colorClass="bg-amber-500" />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/AnalyticsPage.jsx
git commit -m "feat: add analytics dashboard page"
```

### Task 3b: Wire up route and nav link

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/shared/Navbar.jsx`

- [ ] **Step 1: Add analytics route to `App.jsx`**

In `App.jsx`, add the import:

```jsx
import AnalyticsPage from './pages/AnalyticsPage'
```

In the `<Routes>` block, add after the listings route:

```jsx
<Route path="/analytics" element={<AnalyticsPage />} />
```

- [ ] **Step 2: Add Analytics link to `Navbar.jsx`**

In `Navbar.jsx`, add an "Analytics" link after the "Browse Listings" link:

```jsx
<Link to="/analytics" className="text-gray-600 hover:text-gray-900 text-sm font-medium">
  Analytics
</Link>
```

- [ ] **Step 3: Verify in browser**

Navigate to `/analytics`. Summary cards show total listings, avg/min/max rent. Four bar charts render: Listings by City, Listings by Type, Price Distribution, Avg Rent by City. The Analytics link appears in the navbar.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx src/components/shared/Navbar.jsx
git commit -m "feat: add analytics route and navbar link"
```

---

## Task 4: Renter Sublease Posting

Renters should be able to post sublease listings. Currently `LandlordRoute` blocks all renters from `/create-listing`. The fix: allow renters through the route, but in `CreateListingPage` restrict their property type options to `sublease` only and auto-select it. Also update the schema to accept `sublease` as a valid `property_type`.

### Task 4a: Database migration for sublease type

**Files:**
- Create: `supabase/migration_sublease.sql`
- Modify: `supabase/schema.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migration_sublease.sql
-- Run in Supabase SQL Editor

-- Drop the old constraint and add sublease
ALTER TABLE public.listings
  DROP CONSTRAINT IF EXISTS listings_property_type_check;

ALTER TABLE public.listings
  ADD CONSTRAINT listings_property_type_check
  CHECK (property_type IN ('apartment', 'house', 'room', 'basement', 'condo', 'townhouse', 'sublease'));
```

- [ ] **Step 2: Run the migration in Supabase dashboard**

Open Supabase → SQL Editor → paste and run `supabase/migration_sublease.sql`. Confirm no error.

- [ ] **Step 3: Update `supabase/schema.sql` to reflect new constraint**

In `schema.sql`, find:

```sql
  property_type TEXT NOT NULL CHECK (property_type IN ('apartment', 'house', 'room', 'basement', 'condo', 'townhouse')),
```

Replace with:

```sql
  property_type TEXT NOT NULL CHECK (property_type IN ('apartment', 'house', 'room', 'basement', 'condo', 'townhouse', 'sublease')),
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migration_sublease.sql supabase/schema.sql
git commit -m "feat: add sublease as valid property_type in schema"
```

### Task 4b: Update routing to allow renters

**Files:**
- Modify: `src/App.jsx`

Currently, `/create-listing` uses `<LandlordRoute>` which redirects renters to `/profile`. Replace it with `<ProtectedRoute>` so any logged-in user can access it.

- [ ] **Step 1: Change the route guard in `App.jsx`**

Find:

```jsx
<Route path="/create-listing" element={
  <LandlordRoute><CreateListingPage /></LandlordRoute>
} />
```

Replace with:

```jsx
<Route path="/create-listing" element={
  <ProtectedRoute><CreateListingPage /></ProtectedRoute>
} />
```

- [ ] **Step 2: Commit**

```bash
git add src/App.jsx
git commit -m "feat: allow renters to access create-listing page for subleases"
```

### Task 4c: Update `CreateListingPage` for renters

**Files:**
- Modify: `src/pages/CreateListingPage.jsx`

- [ ] **Step 1: Import `useAuth` in `CreateListingPage.jsx`**

`useAuth` is already imported — it is on line 4. Good.

- [ ] **Step 2: Get `role` from `useAuth` and add sublease to property types**

At the top of `CreateListingPage`, after `const { user } = useAuth()`, add:

```jsx
const { user, role } = useAuth()
const isRenter = role === 'renter'
```

Replace the `PROPERTY_TYPES` constant with a version that includes sublease:

```jsx
const ALL_PROPERTY_TYPES = [
  { value: 'apartment', label: '🏢 Apartment' },
  { value: 'house', label: '🏠 House' },
  { value: 'room', label: '🛏 Room' },
  { value: 'basement', label: '🏚 Basement Suite' },
  { value: 'condo', label: '🏙 Condo' },
  { value: 'townhouse', label: '🏘 Townhouse' },
  { value: 'sublease', label: '🔄 Sublease' },
]
const RENTER_PROPERTY_TYPES = [
  { value: 'sublease', label: '🔄 Sublease' },
]
```

And inside the component, derive which list to show:

```jsx
const PROPERTY_TYPES = isRenter ? RENTER_PROPERTY_TYPES : ALL_PROPERTY_TYPES
```

- [ ] **Step 3: Auto-select sublease for renters**

Update the initial `form` state so renters start with `property_type: 'sublease'`:

```jsx
const [form, setForm] = useState({
  title: '',
  description: '',
  property_type: isRenter ? 'sublease' : '',
  // ... rest unchanged
})
```

Wait — `isRenter` is derived from `role` which comes from `useAuth()`. But hooks can't be called after conditionals. The state initializer runs once. We can't use `isRenter` inside `useState` initial value directly since `isRenter` is derived after `useAuth`.

Use a function initializer that reads role from the auth context before the component renders. Since `useAuth` returns the role synchronously from context, we can access `role` before useState:

```jsx
const { user, role } = useAuth()
const isRenter = role === 'renter'

const [form, setForm] = useState(() => ({
  title: '',
  description: '',
  property_type: role === 'renter' ? 'sublease' : '',
  city: 'Charlottetown',
  neighbourhood: '',
  address: '',
  price: '',
  utilities_included: false,
  bedrooms: 1,
  bathrooms: 1,
  square_feet: '',
  available_from: '',
  lease_term: '1_year',
  pet_friendly: false,
  parking_available: false,
  laundry: 'none',
  furnished: false,
}))
```

This is valid — `role` is available in closure when `useState` initializer runs.

- [ ] **Step 4: Update page title for renters**

In the JSX, find the heading:

```jsx
<h1 className="text-2xl font-bold text-gray-900">Post a Listing</h1>
<p className="text-gray-500 text-sm mt-1">Fill in your property details to connect with renters</p>
```

Replace with:

```jsx
<h1 className="text-2xl font-bold text-gray-900">{isRenter ? 'Post a Sublease' : 'Post a Listing'}</h1>
<p className="text-gray-500 text-sm mt-1">
  {isRenter
    ? 'List your space for sublet and find someone to take over your lease'
    : 'Fill in your property details to connect with renters'}
</p>
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/CreateListingPage.jsx
git commit -m "feat: allow renters to post sublease listings"
```

### Task 4d: Update navbar to show sublease button for renters

**Files:**
- Modify: `src/components/shared/Navbar.jsx`

Currently the navbar shows "+ Post Listing" only for `isLandlord`. Renters should see a sublease button.

- [ ] **Step 1: Update navbar logic**

In `Navbar.jsx`, replace:

```jsx
{isLandlord && (
  <Link to="/create-listing"
    className="bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-800 transition">
    + Post Listing
  </Link>
)}
```

with:

```jsx
{isLandlord ? (
  <Link to="/create-listing"
    className="bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-800 transition">
    + Post Listing
  </Link>
) : user ? (
  <Link to="/create-listing"
    className="bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-800 transition">
    + Post Sublease
  </Link>
) : null}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/shared/Navbar.jsx
git commit -m "feat: show post sublease button for renters in navbar"
```

### Task 4e: Update listing permissions for renter-owned subleases

**Files:**
- Modify: `src/utils/listingPermissions.js`

Currently `canModifyListing` requires `role === 'landlord'`. Renters who own a sublease should be able to edit it.

- [ ] **Step 1: Update `canModifyListing`**

Replace the entire file content with:

```js
const normalizeRole = (role) => {
  const normalized = String(role || '').trim().toLowerCase()
  return normalized === 'admin' ? 'admin' : normalized === 'landlord' ? 'landlord' : 'renter'
}

export const canModifyListing = (user, listing) => {
  if (!user || !listing) return false

  const role = normalizeRole(
    typeof user.role === 'string'
      ? user.role
      : user.profile?.role
  )

  if (user.id !== listing.landlord_id) return false
  if (role === 'landlord' || role === 'admin') return true
  if (role === 'renter' && listing.property_type === 'sublease') return true
  return false
}
```

- [ ] **Step 2: Verify in browser**

Log in as a renter. Click "+ Post Sublease" in the navbar. The create listing page shows "Post a Sublease" heading, only the "🔄 Sublease" type is available (auto-selected). Fill in details and publish. The listing appears in `/listings`. Navigate to it — "Edit Listing" link shows (since you're the owner). Click it — edit page loads correctly.

- [ ] **Step 3: Commit**

```bash
git add src/utils/listingPermissions.js
git commit -m "feat: allow renters to modify their own sublease listings"
```

---

## Self-Review

**Spec coverage:**
- ✅ Listing data (posting date) → Task 1 adds `timeAgo` + views to listing cards
- ✅ Saved listings → Tasks 2a–2e cover schema, hook, card button, detail button, profile tab
- ✅ Analytics dashboard → Tasks 3a–3b create the page with 4 charts + route + nav
- ✅ Renter sublease → Tasks 4a–4e cover schema, routing, form, navbar, permissions

**Placeholder scan:** All code blocks contain complete, runnable code. No "TBD" or "fill in later" entries.

**Type consistency:**
- `useSavedListings` exports `{ isSaved, toggleSave, savedIds, loading }` — all call sites use `isSaved` and `toggleSave` consistently
- `ListingCard` prop signature `{ listing, isSaved, onToggleSave }` matches usage in `ListingsPage`
- `canModifyListing(user, listing)` signature unchanged — all existing call sites still work
- `listing.landlord_id` is used in `canModifyListing` and matches the Supabase schema column name used throughout the codebase
