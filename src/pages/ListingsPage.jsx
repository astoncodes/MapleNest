import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const CITIES = ['All', 'Charlottetown', 'Summerside', 'Cornwall', 'Stratford', 'Other']
const TYPES = ['All', 'apartment', 'house', 'room', 'basement', 'condo', 'townhouse']
const TYPE_LABELS = { apartment: 'Apartment', house: 'House', room: 'Room', basement: 'Basement', condo: 'Condo', townhouse: 'Townhouse' }

const timeAgo = (dateStr) => {
  const days = Math.floor((Date.now() - new Date(dateStr)) / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return '1 day ago'
  if (days < 30) return `${days} days ago`
  const months = Math.floor(days / 30)
  return months === 1 ? '1 month ago' : `${months} months ago`
}

function ListingCard({ listing }) {
  if (!listing) return null
  const image = listing.listing_images?.[0]?.url
  const formatPrice = (p) => `$${Number(p || 0).toLocaleString()}`


  return (
    <Link to={`/listings/${listing.id}`} className="group bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-all overflow-hidden">
      {/* Image */}
      <div className="aspect-video bg-gray-100 overflow-hidden relative">
        {image ? (
          <img src={image} alt={listing.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300 text-4xl">🏠</div>
        )}
        <div className="absolute top-2 left-2 bg-white text-gray-700 text-xs font-medium px-2 py-1 rounded-full capitalize shadow-sm">
          {TYPE_LABELS[listing.property_type] || listing.property_type}
        </div>
        {listing.utilities_included && (
          <div className="absolute top-2 right-2 bg-green-500 text-white text-xs font-medium px-2 py-1 rounded-full shadow-sm">
            Utilities incl.
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="font-semibold text-gray-900 text-sm leading-tight line-clamp-2 group-hover:text-red-700 transition-colors">
            {listing.title}
          </h3>
          <span className="text-red-700 font-bold text-sm whitespace-nowrap">{formatPrice(listing.price)}<span className="text-gray-400 font-normal">/mo</span></span>
        </div>

        <p className="text-xs text-gray-500 mb-3">
          📍 {listing.neighbourhood ? `${listing.neighbourhood}, ` : ''}{listing.city}
        </p>

        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>🛏 {listing.bedrooms} bed</span>
          <span>🚿 {listing.bathrooms} bath</span>
          {listing.pet_friendly && <span>🐾 Pets ok</span>}
          {listing.parking_available && <span>🚗 Parking</span>}
        </div>

        <div className="flex items-center justify-between pt-2 mt-2 border-t border-gray-50 text-xs text-gray-400">
          <span>Posted {timeAgo(listing.created_at)}</span>
          {listing.views > 0 && <span>👁 {listing.views}</span>}
        </div>
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

  const updateFilter = (key, value) => setFilters(prev => ({ ...prev, [key]: value }))

  useEffect(() => {
    setSearch(queryFromParams || '')
  }, [searchParams])

  useEffect(() => {
    fetchListings()
  }, [filters, queryFromParams])

  const fetchListings = async () => {
  setLoading(true);

  try {
    let query = supabase
      .from('listings')
      .select('*, listing_images(url, is_primary, sort_order)')
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (filters.city !== 'All')
      query = query.eq('city', filters.city);

    if (filters.type !== 'All')
      query = query.eq('property_type', filters.type);

    if (filters.minPrice)
      query = query.gte('price', Number(filters.minPrice));

    if (filters.maxPrice)
      query = query.lte('price', Number(filters.maxPrice));

    if (filters.bedrooms !== 'Any')
      query = query.gte('bedrooms', Number(filters.bedrooms));


    if (filters.petFriendly)
      query = query.eq('pet_friendly', true);

    if (filters.parking)
      query = query.eq('parking_available', true);

    if (filters.utilitiesIncluded)
      query = query.eq('utilities_included', true);

    if (search?.trim())
      query = query.ilike('title', `%${search.trim()}%`);

    const { data, error } = await query;

    if (error) throw error;

    setListings(data ?? []);

  } catch (err) {
    console.error("Error fetching listings:", err);
    setListings([]); // optional fallback

  } finally {
    setLoading(false);
  }
};
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
    fetchListings()
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
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">PEI Rentals</h1>
        <p className="text-gray-500 text-sm mt-1">
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
          className="flex-1 border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
        />
        <button type="submit" className="bg-red-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-red-800 transition">
          Search
        </button>
      </form>

      <div className="flex gap-6">
        {/* Filters sidebar */}
        <aside className="w-56 flex-shrink-0 hidden md:block">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 sticky top-20">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-800 text-sm">Filters</h3>
              {activeFilterCount > 0 && (
                <button onClick={resetFilters} className="text-xs text-red-600 hover:underline">
                  Reset ({activeFilterCount})
                </button>
              )}
            </div>

            <div className="space-y-5">
              {/* City */}
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">City</label>
                <div className="space-y-1">
                  {CITIES.map(c => (
                    <button key={c} onClick={() => updateFilter('city', c)}
                      className={`w-full text-left px-3 py-1.5 rounded-lg text-sm transition ${
                        filters.city === c ? 'bg-red-50 text-red-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
                      }`}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {/* Type */}
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Type</label>
                <div className="space-y-1">
                  {TYPES.map(t => (
                    <button key={t} onClick={() => updateFilter('type', t)}
                      className={`w-full text-left px-3 py-1.5 rounded-lg text-sm transition capitalize ${
                        filters.type === t ? 'bg-red-50 text-red-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
                      }`}>
                      {t === 'All' ? 'All Types' : TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Price */}
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Price (CAD/mo)</label>
                <div className="flex gap-2">
                  <input type="number" placeholder="Min" value={filters.minPrice}
                    onChange={e => updateFilter('minPrice', e.target.value)}
                    className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-red-300" />
                  <input type="number" placeholder="Max" value={filters.maxPrice}
                    onChange={e => updateFilter('maxPrice', e.target.value)}
                    className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-red-300" />
                </div>
              </div>

              {/* Bedrooms */}
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Bedrooms</label>
                <div className="flex gap-1 flex-wrap">
                  {['Any', '1', '2', '3', '4'].map(b => (
                    <button key={b} onClick={() => updateFilter('bedrooms', b)}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition ${
                        filters.bedrooms === b ? 'bg-red-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}>
                      {b === 'Any' ? 'Any' : `${b}+`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Amenities */}
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Amenities</label>
                <div className="space-y-2">
                  {[
                    { key: 'petFriendly', label: '🐾 Pet Friendly' },
                    { key: 'parking', label: '🚗 Parking' },
                    { key: 'utilitiesIncluded', label: '💡 Utilities incl.' },
                  ].map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={filters[key]}
                        onChange={e => updateFilter(key, e.target.checked)}
                        className="rounded border-gray-300 text-red-700 focus:ring-red-300" />
                      <span className="text-sm text-gray-600">{label}</span>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-100 overflow-hidden animate-pulse">
                  <div className="aspect-video bg-gray-200" />
                  <div className="p-4 space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-3/4" />
                    <div className="h-3 bg-gray-200 rounded w-1/2" />
                    <div className="h-3 bg-gray-200 rounded w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : listings.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <div className="text-5xl mb-4">🏚</div>
              <p className="font-medium text-gray-600">No listings found</p>
              <p className="text-sm mt-1">Try adjusting your filters or search terms</p>
              {activeFilterCount > 0 && (
                <button onClick={resetFilters} className="mt-4 text-red-700 text-sm font-medium hover:underline">
                  Clear all filters
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {listings.map(listing => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
