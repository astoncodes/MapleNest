import { useState, useEffect, useCallback } from 'react'
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
  const formatPrice = (p) => `$${Number(p || 0).toLocaleString()}`
  const units = listing.listing_units || []
  const hasAvailableUnits = countAvailable(units) > 0
  const displayPrice = hasAvailableUnits ? resolveLowestPrice(units, listing.price) : listing.price
  const pricePrefix = hasAvailableUnits ? 'From ' : ''

  return (
    <Link to={`/listings/${listing.id}`} className="group block">
      {/* Image */}
      <div className="aspect-[4/3] bg-surface rounded-xl overflow-hidden relative mb-3">
        {image ? (
          <img
            src={image}
            alt={listing.title}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-stone text-4xl">🏠</div>
        )}

        {/* Type pill */}
        <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm text-charcoal text-xs font-medium px-2.5 py-1 rounded-full">
          {TYPE_LABELS[listing.property_type] || listing.property_type}
        </div>

        {/* Utilities pill */}
        {listing.utilities_included && (
          <div className="absolute bottom-3 left-3 bg-emerald-500 text-white text-xs font-medium px-2.5 py-1 rounded-full">
            Utilities incl.
          </div>
        )}

        {/* Save button */}
        {onToggleSave && (
          <button
            onClick={e => { e.preventDefault(); e.stopPropagation(); onToggleSave(listing.id) }}
            className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-white/90 backdrop-blur-sm hover:scale-110 transition-transform shadow-sm"
            title={isSaved ? 'Unsave' : 'Save listing'}
            aria-label={isSaved ? 'Unsave listing' : 'Save listing'}
          >
            <span className={isSaved ? 'text-maple-red' : 'text-stone'}>{isSaved ? '♥' : '♡'}</span>
          </button>
        )}
      </div>

      {/* Content */}
      <div className="px-0.5">
        <div className="flex items-start justify-between gap-2 mb-0.5">
          <h3 className="font-medium text-charcoal text-sm leading-snug line-clamp-1 group-hover:text-maple-red transition-colors">
            {listing.title}
          </h3>
          <span className="text-ink font-semibold text-sm whitespace-nowrap flex-shrink-0">
            {pricePrefix}{formatPrice(displayPrice)}<span className="text-stone font-normal text-xs">/mo</span>
          </span>
        </div>

        <p className="text-xs text-steel mb-2">
          {listing.neighbourhood ? `${listing.neighbourhood}, ` : ''}{listing.city}
        </p>

        <div className="flex items-center gap-3 text-xs text-stone">
          <span>{listing.bedrooms} bed</span>
          <span>·</span>
          <span>{listing.bathrooms} bath</span>
          {listing.pet_friendly && <><span>·</span><span>Pets ok</span></>}
          {listing.parking_available && <><span>·</span><span>Parking</span></>}
        </div>

        <UnitStrip units={units} />

        {listing.created_at && (
          <p className="text-xs text-stone mt-1.5">{timeAgo(listing.created_at)}</p>
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

  const { user } = useAuth()
  const { isSaved, toggleSave } = useSavedListings()

  const updateFilter = (key, value) => setFilters(prev => ({ ...prev, [key]: value }))

  useEffect(() => {
    setSearch(queryFromParams || '')
  }, [queryFromParams])

  const fetchListings = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('listings')
        .select('*, listing_images(url, is_primary, sort_order), listing_units(id, unit_name, price, status, room_rental, listing_unit_rooms(id, price, status))')
        .eq('status', 'active')
        .order('created_at', { ascending: false })

      if (filters.city !== 'All') query = query.eq('city', filters.city)
      if (filters.type !== 'All') query = query.eq('property_type', filters.type)
      if (filters.minPrice) query = query.gte('price', Number(filters.minPrice))
      if (filters.maxPrice) query = query.lte('price', Number(filters.maxPrice))
      if (filters.bedrooms !== 'Any') query = query.gte('bedrooms', Number(filters.bedrooms))
      if (filters.petFriendly) query = query.eq('pet_friendly', true)
      if (filters.parking) query = query.eq('parking_available', true)
      if (filters.utilitiesIncluded) query = query.eq('utilities_included', true)

      if (queryFromParams?.trim()) {
        const q = queryFromParams.trim().replace(/[(),%_]/g, ' ')
        query = query.or(`title.ilike.%${q}%,neighbourhood.ilike.%${q}%,description.ilike.%${q}%`)
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
  }, [filters, queryFromParams])

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
      <div className="max-w-6xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="mb-5">
          <h1 className="text-xl font-semibold text-ink">PEI Rentals</h1>
          <p className="text-sm text-steel mt-0.5">
            {loading ? 'Loading...' : `${listings.length} listing${listings.length !== 1 ? 's' : ''} available`}
          </p>
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="flex gap-2 mb-6">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by title, neighbourhood, keyword..."
            className="flex-1 bg-white border border-hairline rounded-lg px-4 py-2.5 text-sm text-charcoal placeholder:text-stone focus:outline-none focus:ring-2 focus:ring-maple-red/20 focus:border-maple-red/40 transition"
          />
          <button type="submit"
            className="bg-maple-red text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-maple-dark transition-colors">
            Search
          </button>
        </form>

        <div className="flex gap-6">
          {/* Filter sidebar */}
          <aside className="w-52 flex-shrink-0 hidden md:block">
            <div className="bg-white rounded-xl border border-hairline shadow-card p-4 sticky top-20">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-charcoal">Filters</h3>
                {activeFilterCount > 0 && (
                  <button onClick={resetFilters} className="text-xs text-maple-red hover:text-maple-dark transition-colors">
                    Reset ({activeFilterCount})
                  </button>
                )}
              </div>

              <div className="space-y-5">
                {/* City */}
                <div>
                  <label className="block text-[10px] font-semibold text-stone uppercase tracking-wider mb-2">City</label>
                  <div className="space-y-0.5">
                    {CITIES.map(c => (
                      <button key={c} onClick={() => updateFilter('city', c)}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-sm transition-colors ${
                          filters.city === c
                            ? 'bg-maple-light text-maple-red font-medium'
                            : 'text-steel hover:bg-surface hover:text-charcoal'
                        }`}>
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Type */}
                <div>
                  <label className="block text-[10px] font-semibold text-stone uppercase tracking-wider mb-2">Type</label>
                  <div className="space-y-0.5">
                    {TYPES.map(t => (
                      <button key={t} onClick={() => updateFilter('type', t)}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-sm transition-colors capitalize ${
                          filters.type === t
                            ? 'bg-maple-light text-maple-red font-medium'
                            : 'text-steel hover:bg-surface hover:text-charcoal'
                        }`}>
                        {t === 'All' ? 'All Types' : TYPE_LABELS[t]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Price */}
                <div>
                  <label className="block text-[10px] font-semibold text-stone uppercase tracking-wider mb-2">Price (CAD/mo)</label>
                  <div className="flex gap-2">
                    <input type="number" placeholder="Min" value={filters.minPrice}
                      onChange={e => updateFilter('minPrice', e.target.value)}
                      className="w-full border border-hairline rounded-lg px-2.5 py-1.5 text-xs text-charcoal placeholder:text-stone focus:outline-none focus:ring-1 focus:ring-maple-red/30 transition" />
                    <input type="number" placeholder="Max" value={filters.maxPrice}
                      onChange={e => updateFilter('maxPrice', e.target.value)}
                      className="w-full border border-hairline rounded-lg px-2.5 py-1.5 text-xs text-charcoal placeholder:text-stone focus:outline-none focus:ring-1 focus:ring-maple-red/30 transition" />
                  </div>
                </div>

                {/* Bedrooms */}
                <div>
                  <label className="block text-[10px] font-semibold text-stone uppercase tracking-wider mb-2">Bedrooms</label>
                  <div className="flex gap-1 flex-wrap">
                    {['Any', '1', '2', '3', '4'].map(b => (
                      <button key={b} onClick={() => updateFilter('bedrooms', b)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                          filters.bedrooms === b
                            ? 'bg-maple-red text-white'
                            : 'bg-surface text-steel hover:bg-hairline hover:text-charcoal'
                        }`}>
                        {b === 'Any' ? 'Any' : `${b}+`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Amenities */}
                <div>
                  <label className="block text-[10px] font-semibold text-stone uppercase tracking-wider mb-2">Amenities</label>
                  <div className="space-y-2">
                    {[
                      { key: 'petFriendly', label: 'Pet Friendly' },
                      { key: 'parking', label: 'Parking' },
                      { key: 'utilitiesIncluded', label: 'Utilities incl.' },
                    ].map(({ key, label }) => (
                      <label key={key} className="flex items-center gap-2 cursor-pointer group">
                        <input type="checkbox" checked={filters[key]}
                          onChange={e => updateFilter(key, e.target.checked)}
                          className="rounded border-hairline text-maple-red focus:ring-maple-red/30" />
                        <span className="text-sm text-steel group-hover:text-charcoal transition-colors">{label}</span>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="animate-pulse">
                    <div className="aspect-[4/3] bg-hairline rounded-xl mb-3" />
                    <div className="space-y-2 px-0.5">
                      <div className="h-4 bg-hairline rounded w-3/4" />
                      <div className="h-3 bg-hairline rounded w-1/2" />
                      <div className="h-3 bg-hairline rounded w-2/3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : listings.length === 0 ? (
              <div className="text-center py-20 text-stone">
                <div className="text-5xl mb-4">🏚</div>
                <p className="font-medium text-charcoal">No listings found</p>
                <p className="text-sm mt-1 text-steel">Try adjusting your filters or search terms</p>
                {activeFilterCount > 0 && (
                  <button onClick={resetFilters}
                    className="mt-5 text-maple-red text-sm font-medium hover:text-maple-dark transition-colors">
                    Clear all filters
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
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
