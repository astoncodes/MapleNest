import { useState, useEffect, useCallback, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useSavedListings } from '../hooks/useSavedListings'
import UnitStrip, { resolveLowestPrice, countAvailable } from '../components/listings/UnitStrip'

const CITIES = ['All', 'Charlottetown', 'Summerside', 'Cornwall', 'Stratford', 'Other']
const TYPES = ['All', 'apartment', 'house', 'room', 'basement', 'condo', 'townhouse', 'sublease']
const TYPE_LABELS = { apartment: 'Apartment', house: 'House', room: 'Room', basement: 'Basement', condo: 'Condo', townhouse: 'Townhouse', sublease: 'Sublease' }

const timeAgo = (dateStr) => {
  if (!dateStr) return ''
  const days = Math.floor((Date.now() - new Date(dateStr)) / 86400000)
  if (isNaN(days)) return ''
  if (days === 0) return 'Today'
  if (days === 1) return '1 day ago'
  if (days < 30) return `${days} days ago`
  const months = Math.floor(days / 30)
  return months === 1 ? '1 month ago' : `${months} months ago`
}

function ListingCard({ listing, isSaved, onToggleSave }) {
  if (!listing) return null
  const image = listing.listing_images?.[0]?.url
  const units = listing.listing_units || []
  const hasAvailableUnits = countAvailable(units) > 0
  const displayPrice = hasAvailableUnits ? resolveLowestPrice(units, listing.price) : listing.price
  const hasPrice = displayPrice != null && Number(displayPrice) > 0
  const pricePrefix = hasPrice && hasAvailableUnits ? 'From ' : ''
  const priceLabel = hasPrice ? `$${Number(displayPrice).toLocaleString()}` : 'Contact for price'

  return (
    <Link to={`/listings/${listing.id}`} className="group block">
      {/* Image */}
      <div className="aspect-[4/3] bg-surface overflow-hidden relative mb-4">
        {image ? (
          <img
            src={image}
            alt={listing.title}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-103 transition-transform duration-700"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-surface">
            <span className="text-[10px] tracking-widest uppercase text-stone">No image</span>
          </div>
        )}

        {/* Type tag */}
        <div className="absolute top-3 left-3 bg-canvas/90 backdrop-blur-sm text-[9px] tracking-widest uppercase text-charcoal px-2.5 py-1">
          {TYPE_LABELS[listing.property_type] || listing.property_type}
        </div>

        {/* Utilities tag */}
        {listing.utilities_included && (
          <div className="absolute bottom-3 left-3 bg-maple text-white text-[9px] tracking-widest uppercase px-2.5 py-1">
            Utilities incl.
          </div>
        )}

        {/* Save button */}
        {onToggleSave && (
          <button
            onClick={e => { e.preventDefault(); e.stopPropagation(); onToggleSave(listing.id) }}
            className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center bg-canvas/90 backdrop-blur-sm hover:bg-maple hover:text-white transition-colors"
            title={isSaved ? 'Unsave' : 'Save listing'}
            aria-label={isSaved ? 'Unsave listing' : 'Save listing'}
          >
            <span className={`text-sm ${isSaved ? 'text-maple' : 'text-stone'}`}>{isSaved ? '♥' : '♡'}</span>
          </button>
        )}
      </div>

      {/* Content */}
      <div>
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="font-serif font-normal text-lg text-ink leading-snug line-clamp-1 group-hover:text-maple transition-colors duration-200">
            {listing.title}
          </h3>
          <span className="font-serif font-normal text-lg text-maple whitespace-nowrap flex-shrink-0">
            {pricePrefix}{priceLabel}{hasPrice && <span className="text-stone text-xs">/mo</span>}
          </span>
        </div>

        <p className="text-[11px] tracking-wide uppercase text-stone mb-3">
          {listing.neighbourhood ? `${listing.neighbourhood}, ` : ''}{listing.city}
        </p>

        <div className="flex items-center gap-3 text-xs text-steel border-t border-hairline pt-3">
          <span>{listing.bedrooms} bed</span>
          <span className="text-hairline">·</span>
          <span>{listing.bathrooms} bath</span>
          {listing.pet_friendly && <><span className="text-hairline">·</span><span>Pets ok</span></>}
          {listing.parking_available && <><span className="text-hairline">·</span><span>Parking</span></>}
        </div>

        <UnitStrip units={units} />

        {listing.created_at && (
          <p className="text-[10px] tracking-wide uppercase text-stone mt-2">{timeAgo(listing.created_at)}</p>
        )}
      </div>
    </Link>
  )
}

export default function ListingsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [listings, setListings] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState(searchParams.get('q') || '')
  const queryFromParams = searchParams.get('q') || ''

  const [filters, setFilters] = useState({
    city: 'All',
    type: 'All',
    minPrice: '',
    maxPrice: '',
    bedrooms: 'Any',
    petFriendly: false,
    parking: false,
    utilitiesIncluded: false,
  })
  // Debounced copy used for the actual query — keystrokes in min/max price
  // otherwise fire a fetch on every digit.
  const [debouncedFilters, setDebouncedFilters] = useState(filters)

  const { user } = useAuth()
  const { isSaved, toggleSave } = useSavedListings()

  const updateFilter = (key, value) => setFilters(prev => ({ ...prev, [key]: value }))

  useEffect(() => {
    const t = setTimeout(() => setDebouncedFilters(filters), 300)
    return () => clearTimeout(t)
  }, [filters])

  // Only adopt a URL q change when we haven't picked up fresh typing since
  // the last sync — keeps an in-progress search from getting clobbered when
  // the URL param updates (e.g., programmatic setSearchParams elsewhere).
  const lastSyncedQueryRef = useRef(queryFromParams)
  const hasUnsyncedTypingRef = useRef(false)

  useEffect(() => {
    if (lastSyncedQueryRef.current === queryFromParams) return
    lastSyncedQueryRef.current = queryFromParams
    if (!hasUnsyncedTypingRef.current) {
      setSearch(queryFromParams || '')
    }
    hasUnsyncedTypingRef.current = false
  }, [queryFromParams])

  const fetchListings = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('listings')
        .select('*, listing_images(url, is_primary, sort_order), listing_units(id, unit_name, price, status, room_rental, listing_unit_rooms(id, price, status))')
        .eq('status', 'active')
        .order('created_at', { ascending: false })

      if (debouncedFilters.city !== 'All') query = query.eq('city', debouncedFilters.city)
      if (debouncedFilters.type !== 'All') query = query.eq('property_type', debouncedFilters.type)
      if (debouncedFilters.minPrice) query = query.gte('price', Number(debouncedFilters.minPrice))
      if (debouncedFilters.maxPrice) query = query.lte('price', Number(debouncedFilters.maxPrice))
      if (debouncedFilters.bedrooms !== 'Any') query = query.gte('bedrooms', Number(debouncedFilters.bedrooms))
      if (debouncedFilters.petFriendly) query = query.eq('pet_friendly', true)
      if (debouncedFilters.parking) query = query.eq('parking_available', true)
      if (debouncedFilters.utilitiesIncluded) query = query.eq('utilities_included', true)

      if (queryFromParams?.trim()) {
        // .or() splits on commas/parens, and ilike treats %/_ as wildcards, so
        // strip everything that isn't a word char, whitespace, or dash before
        // interpolating. Prevents 400s from "foo,bar" or SQL-pattern injection (B15).
        const q = queryFromParams.trim().replace(/[^\w\s-]/g, ' ').replace(/\s+/g, ' ').trim()
        if (q) {
          query = query.or(`title.ilike.%${q}%,neighbourhood.ilike.%${q}%,description.ilike.%${q}%`)
        }
      }

      const { data, error } = await query
      if (error) throw error
      setListings(data ?? [])
    } catch (err) {
      console.error('Error fetching listings:', err)
      setListings([])
    } finally {
      setLoading(false)
    }
  }, [debouncedFilters, queryFromParams])

  useEffect(() => {
    fetchListings()
  }, [fetchListings])

  const handleSearch = (e) => {
    e.preventDefault()
    const next = search.trim()
    const params = Object.fromEntries([...searchParams])
    if (next) {
      params.q = next
    } else {
      delete params.q
    }
    hasUnsyncedTypingRef.current = false
    setSearchParams(params, { replace: true })
  }

  const activeFilterCount = [
    filters.city !== 'All',
    filters.type !== 'All',
    filters.minPrice,
    filters.maxPrice,
    filters.bedrooms !== 'Any',
    filters.petFriendly,
    filters.parking,
    filters.utilitiesIncluded,
  ].filter(Boolean).length

  const resetFilters = () => setFilters({
    city: 'All', type: 'All', minPrice: '', maxPrice: '',
    bedrooms: 'Any', petFriendly: false, parking: false, utilitiesIncluded: false,
  })

  return (
    <div className="bg-canvas min-h-screen">

      {/* Page header */}
      <div className="border-b border-hairline px-6 md:px-10 py-10">
        <div className="max-w-6xl mx-auto">
          <div className="text-[10px] tracking-widest uppercase text-maple mb-3">Prince Edward Island</div>
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <h1 className="font-serif font-light text-ink" style={{ fontSize: 'clamp(32px, 5vw, 52px)', lineHeight: 1.1 }}>
              PEI Rentals
            </h1>
            <p className="text-[11px] tracking-widest uppercase text-stone">
              {loading ? 'Loading...' : `${listings.length} listing${listings.length !== 1 ? 's' : ''} available`}
            </p>
          </div>

          {/* Search */}
          <form onSubmit={handleSearch}
            className="flex mt-8 max-w-xl"
            style={{ borderBottom: '1px solid #E8E0D5' }}
          >
            <input
              type="text"
              value={search}
              onChange={e => { hasUnsyncedTypingRef.current = true; setSearch(e.target.value) }}
              placeholder="Search by title, neighbourhood, keyword..."
              className="flex-1 bg-transparent py-3 text-sm text-charcoal placeholder:text-stone focus:outline-none font-light"
            />
            <button type="submit"
              className="text-[11px] tracking-widest uppercase text-maple hover:text-maple-dark transition-colors py-3 pl-6 flex-shrink-0 flex items-center gap-1.5">
              Search <span>→</span>
            </button>
          </form>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 md:px-10 py-10">
        <div className="flex gap-10">

          {/* Filter sidebar */}
          <aside className="w-48 flex-shrink-0 hidden md:block">
            <div className="sticky top-24">
              <div className="flex items-center justify-between mb-6">
                <span className="text-[10px] tracking-widest uppercase text-stone">Filters</span>
                {activeFilterCount > 0 && (
                  <button onClick={resetFilters}
                    className="text-[10px] tracking-widest uppercase text-maple hover:text-maple-dark transition-colors">
                    Reset ({activeFilterCount})
                  </button>
                )}
              </div>

              <div className="space-y-7">
                {/* City */}
                <div>
                  <div className="text-[9px] tracking-widest uppercase text-stone mb-3 border-b border-hairline pb-2">City</div>
                  <div className="space-y-0.5">
                    {CITIES.map(c => (
                      <button key={c} onClick={() => updateFilter('city', c)}
                        className={`w-full text-left py-1.5 text-xs transition-colors ${
                          filters.city === c ? 'text-maple font-medium' : 'text-steel hover:text-ink'
                        }`}>
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Type */}
                <div>
                  <div className="text-[9px] tracking-widest uppercase text-stone mb-3 border-b border-hairline pb-2">Type</div>
                  <div className="space-y-0.5">
                    {TYPES.map(t => (
                      <button key={t} onClick={() => updateFilter('type', t)}
                        className={`w-full text-left py-1.5 text-xs transition-colors capitalize ${
                          filters.type === t ? 'text-maple font-medium' : 'text-steel hover:text-ink'
                        }`}>
                        {t === 'All' ? 'All Types' : TYPE_LABELS[t]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Price */}
                <div>
                  <div className="text-[9px] tracking-widest uppercase text-stone mb-3 border-b border-hairline pb-2">Price (CAD/mo)</div>
                  <div className="flex gap-2">
                    <input type="number" placeholder="Min" value={filters.minPrice}
                      onChange={e => updateFilter('minPrice', e.target.value)}
                      className="w-full border-b border-hairline bg-transparent py-1.5 text-xs text-charcoal placeholder:text-stone focus:outline-none focus:border-maple transition" />
                    <input type="number" placeholder="Max" value={filters.maxPrice}
                      onChange={e => updateFilter('maxPrice', e.target.value)}
                      className="w-full border-b border-hairline bg-transparent py-1.5 text-xs text-charcoal placeholder:text-stone focus:outline-none focus:border-maple transition" />
                  </div>
                </div>

                {/* Bedrooms */}
                <div>
                  <div className="text-[9px] tracking-widest uppercase text-stone mb-3 border-b border-hairline pb-2">Bedrooms</div>
                  <div className="flex gap-1.5 flex-wrap">
                    {['Any', '1', '2', '3', '4'].map(b => (
                      <button key={b} onClick={() => updateFilter('bedrooms', b)}
                        className={`px-2.5 py-1 text-xs transition-colors border ${
                          filters.bedrooms === b
                            ? 'border-maple bg-maple text-white'
                            : 'border-hairline text-steel hover:border-maple hover:text-maple'
                        }`}>
                        {b === 'Any' ? 'Any' : `${b}+`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Amenities */}
                <div>
                  <div className="text-[9px] tracking-widest uppercase text-stone mb-3 border-b border-hairline pb-2">Amenities</div>
                  <div className="space-y-2.5">
                    {[
                      { key: 'petFriendly', label: 'Pet Friendly' },
                      { key: 'parking', label: 'Parking' },
                      { key: 'utilitiesIncluded', label: 'Utilities incl.' },
                    ].map(({ key, label }) => (
                      <label key={key} className="flex items-center gap-2.5 cursor-pointer group">
                        <input type="checkbox" checked={filters[key]}
                          onChange={e => updateFilter(key, e.target.checked)}
                          className="border-hairline text-maple focus:ring-maple/30 rounded-none" />
                        <span className="text-xs text-steel group-hover:text-charcoal transition-colors">{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </aside>

          {/* Listings grid */}
          <div className="flex-1">
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="animate-pulse">
                    <div className="aspect-[4/3] bg-hairline mb-4" />
                    <div className="space-y-2">
                      <div className="h-5 bg-hairline rounded w-3/4" />
                      <div className="h-3 bg-hairline rounded w-1/3" />
                      <div className="h-3 bg-hairline rounded w-1/2 mt-3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : listings.length === 0 ? (
              <div className="py-24 text-center">
                <div className="font-serif font-light text-4xl text-stone mb-4">∅</div>
                <p className="font-serif font-light text-xl text-ink mb-2">No listings found</p>
                <p className="text-sm text-steel">Try adjusting your filters or search terms</p>
                {activeFilterCount > 0 && (
                  <button onClick={resetFilters}
                    className="mt-6 text-[11px] tracking-widest uppercase text-maple hover:text-maple-dark transition-colors">
                    Clear all filters
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                {listings.map(listing => (
                  <ListingCard
                    key={listing.id}
                    listing={listing}
                    isSaved={user ? isSaved(listing.id) : false}
                    onToggleSave={user ? toggleSave : null}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
