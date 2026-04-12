import { useState, useEffect, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useSavedListings } from '../hooks/useSavedListings'

const TYPE_LABELS = {
  apartment: 'Apartment', house: 'House', room: 'Room',
  basement: 'Basement Suite', condo: 'Condo', townhouse: 'Townhouse'
}
const LEASE_LABELS = {
  monthly: 'Month-to-Month', '6_months': '6 Months',
  '1_year': '1 Year', flexible: 'Flexible'
}

// ── Slideshow component ───────────────────────────────────────────────────────
function PhotoSlideshow({ images }) {
  const [active, setActive] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)

  const prev = useCallback(() => setActive(i => (i - 1 + images.length) % images.length), [images.length])
  const next = useCallback(() => setActive(i => (i + 1) % images.length), [images.length])

  // Keyboard navigation
  useEffect(() => {
    if (!lightboxOpen) return
    const handler = (e) => {
      if (e.key === 'ArrowLeft') prev()
      if (e.key === 'ArrowRight') next()
      if (e.key === 'Escape') setLightboxOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [lightboxOpen, prev, next])

  if (!images || images.length === 0) {
    return (
      <div className="aspect-video bg-gray-100 rounded-xl flex items-center justify-center text-gray-300 text-6xl">
        🏠
      </div>
    )
  }

  return (
    <>
      {/* Main image */}
      <div className="relative rounded-xl overflow-hidden bg-gray-100 group">
        <div className="aspect-video">
          <img
            src={images[active].url}
            alt={`Photo ${active + 1}`}
            className="w-full h-full object-cover cursor-zoom-in"
            onClick={() => setLightboxOpen(true)}
          />
        </div>

        {/* Nav arrows — only show if multiple images */}
        {images.length > 1 && (
          <>
            <button onClick={prev}
              className="absolute left-3 top-1/2 -translate-y-1/2 bg-black bg-opacity-40 hover:bg-opacity-70 text-white rounded-full w-9 h-9 flex items-center justify-center transition opacity-0 group-hover:opacity-100">
              ‹
            </button>
            <button onClick={next}
              className="absolute right-3 top-1/2 -translate-y-1/2 bg-black bg-opacity-40 hover:bg-opacity-70 text-white rounded-full w-9 h-9 flex items-center justify-center transition opacity-0 group-hover:opacity-100">
              ›
            </button>
          </>
        )}

        {/* Photo counter */}
        <div className="absolute bottom-3 right-3 bg-black bg-opacity-50 text-white text-xs px-2.5 py-1 rounded-full">
          {active + 1} / {images.length}
        </div>

        {/* Expand hint */}
        <div className="absolute bottom-3 left-3 bg-black bg-opacity-50 text-white text-xs px-2.5 py-1 rounded-full opacity-0 group-hover:opacity-100 transition">
          Click to expand
        </div>
      </div>

      {/* Thumbnail strip */}
      {images.length > 1 && (
        <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
          {images.map((img, i) => (
            <button key={i} onClick={() => setActive(i)}
              className={`flex-shrink-0 w-16 h-12 rounded-lg overflow-hidden border-2 transition ${
                i === active ? 'border-red-700 opacity-100' : 'border-transparent opacity-60 hover:opacity-90'
              }`}>
              <img src={img.url} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {/* Dot indicators for mobile */}
      {images.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-2 md:hidden">
          {images.map((_, i) => (
            <button key={i} onClick={() => setActive(i)}
              className={`w-1.5 h-1.5 rounded-full transition-all ${
                i === active ? 'bg-red-700 w-3' : 'bg-gray-300'
              }`} />
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-95 z-50 flex items-center justify-center"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            onClick={() => setLightboxOpen(false)}
            className="absolute top-4 right-4 text-white text-2xl bg-white bg-opacity-10 rounded-full w-10 h-10 flex items-center justify-center hover:bg-opacity-20 transition z-10"
          >
            ✕
          </button>

          {images.length > 1 && (
            <>
              <button
                onClick={e => { e.stopPropagation(); prev() }}
                className="absolute left-4 text-white text-4xl bg-white bg-opacity-10 rounded-full w-12 h-12 flex items-center justify-center hover:bg-opacity-20 transition z-10"
              >
                ‹
              </button>
              <button
                onClick={e => { e.stopPropagation(); next() }}
                className="absolute right-4 text-white text-4xl bg-white bg-opacity-10 rounded-full w-12 h-12 flex items-center justify-center hover:bg-opacity-20 transition z-10"
              >
                ›
              </button>
            </>
          )}

          <img
            src={images[active].url}
            alt=""
            className="max-h-screen max-w-full object-contain px-16"
            onClick={e => e.stopPropagation()}
          />

          <div className="absolute bottom-4 text-white text-sm bg-black bg-opacity-50 px-3 py-1 rounded-full">
            {active + 1} / {images.length}
          </div>
        </div>
      )}
    </>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ListingDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [listing, setListing] = useState(null)
  const [landlord, setLandlord] = useState(null)
  const [loading, setLoading] = useState(true)
  const [contacting, setContacting] = useState(false)
  const { isSaved, toggleSave } = useSavedListings()
  const [contactError, setContactError] = useState(null)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportReason, setReportReason] = useState('')
  const [reportDetails, setReportDetails] = useState('')
  const [reportSubmitting, setReportSubmitting] = useState(false)
  const [reportDone, setReportDone] = useState(false)
  const [reportError, setReportError] = useState(null)

  useEffect(() => {
    fetchListing()
  }, [id])

  const fetchListing = async () => {
    const { data, error } = await supabase
      .from('listings')
      .select('*, listing_images(id, url, is_primary, sort_order)')
      .eq('id', id)
      .single()

    if (error || !data) { navigate('/listings'); return }

    // Sort images: primary first, then by sort_order
    if (data.listing_images?.length > 0) {
      data.listing_images.sort((a, b) => {
        if (a.is_primary && !b.is_primary) return -1
        if (!a.is_primary && b.is_primary) return 1
        return a.sort_order - b.sort_order
      })
    }

    setListing(data)

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, full_name, email, avatar_url, email_verified, phone_verified, created_at, avg_rating, total_reviews')
      .eq('id', data.landlord_id)
      .single()

    setLandlord(profile)
    setLoading(false)

    // Atomic increment — avoids race condition under concurrent views
    supabase.rpc('increment_views', { p_listing_id: id })
  }

  const handleContact = async () => {
    if (!user) { navigate('/login'); return }
    if (user.id === listing.landlord_id) return

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

      // Don't create the conversation until the first message is sent.
      // Pass context via router state so the chat page can display the listing/landlord.
      navigate('/messages/new', {
        state: {
          listingId: id,
          landlordId: listing.landlord_id,
          listing: { id, title: listing.title, city: listing.city, listing_images: listing.listing_images },
          landlord,
        },
      })
    } catch (err) {
      setContactError('Could not open conversation. Please try again.')
    } finally {
      setContacting(false)
    }
  }

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

  if (loading) return (
    <div className="max-w-5xl mx-auto px-4 py-10 animate-pulse space-y-4">
      <div className="h-80 bg-gray-200 rounded-xl" />
      <div className="h-6 bg-gray-200 rounded w-1/2" />
      <div className="h-4 bg-gray-200 rounded w-1/3" />
    </div>
  )

  const images = listing.listing_images || []
  const isOwnListing = user?.id === listing.landlord_id
  const saved = isSaved(listing.id)
  const formatPrice = p => `$${p.toLocaleString()}`
  const formatDate = d => d
    ? new Date(d).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })
    : 'Immediately'

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-4">
        <Link to="/listings" className="hover:text-gray-600 transition">← Back to listings</Link>
        <span>/</span>
        <span className="text-gray-600 truncate max-w-xs">{listing.title}</span>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">

          {/* Photo slideshow */}
          <PhotoSlideshow images={images} />

          {/* Title + price */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 leading-tight">{listing.title}</h1>
              <p className="text-gray-500 mt-1 text-sm">
                📍 {listing.neighbourhood ? `${listing.neighbourhood}, ` : ''}{listing.city}, PEI
              </p>
              <div className="flex items-center gap-2 mt-2 flex-wrap text-xs text-gray-400">
                <span>Posted {new Date(listing.created_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                <span>·</span>
                <span>👁 {listing.views || 0} views</span>
                {images.length > 0 && <><span>·</span><span>📷 {images.length} photo{images.length !== 1 ? 's' : ''}</span></>}
              </div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-red-700">{formatPrice(listing.price)}</div>
              <div className="text-sm text-gray-400">/month</div>
              {listing.utilities_included && (
                <div className="text-xs text-green-600 font-medium mt-1">✓ Utilities included</div>
              )}
            </div>
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { icon: '🏠', label: 'Type', value: TYPE_LABELS[listing.property_type] || listing.property_type },
              { icon: '🛏', label: 'Bedrooms', value: listing.bedrooms },
              { icon: '🚿', label: 'Bathrooms', value: listing.bathrooms },
              { icon: '📐', label: 'Size', value: listing.square_feet ? `${listing.square_feet} sqft` : '—' },
            ].map(s => (
              <div key={s.label} className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
                <div className="text-xl mb-1">{s.icon}</div>
                <div className="text-sm font-semibold text-gray-800">{s.value}</div>
                <div className="text-xs text-gray-400 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Description */}
          {listing.description && (
            <div>
              <h2 className="font-semibold text-gray-800 mb-2 text-lg">About this place</h2>
              <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-line">{listing.description}</p>
            </div>
          )}

          {/* Details grid */}
          <div>
            <h2 className="font-semibold text-gray-800 mb-3 text-lg">Details</h2>
            <div className="grid grid-cols-2 gap-y-3 gap-x-8 text-sm">
              {[
                { label: 'Available', value: formatDate(listing.available_from) },
                { label: 'Lease Term', value: LEASE_LABELS[listing.lease_term] || listing.lease_term },
                { label: 'Laundry', value: listing.laundry === 'in_unit' ? 'In-Unit' : listing.laundry === 'shared' ? 'Shared' : 'None' },
                { label: 'Utilities', value: listing.utilities_included ? '✅ Included' : '❌ Not included' },
                { label: 'Pet Friendly', value: listing.pet_friendly ? '✅ Yes' : '❌ No' },
                { label: 'Parking', value: listing.parking_available ? '✅ Available' : '❌ No' },
                { label: 'Furnished', value: listing.furnished ? '✅ Yes' : '❌ No' },
              ].map(d => (
                <div key={d.label} className="flex justify-between py-2 border-b border-gray-50">
                  <span className="text-gray-500">{d.label}</span>
                  <span className="text-gray-800 font-medium text-right">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right column — contact card */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 sticky top-20">

            {/* Landlord info */}
            <Link to={`/profile/${landlord?.id}`} className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-100 hover:opacity-80 transition">
              <div className="w-11 h-11 bg-gradient-to-br from-red-600 to-red-800 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                {landlord?.avatar_url
                  ? <img src={landlord.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                  : (landlord?.full_name || landlord?.email || '?')[0].toUpperCase()
                }
              </div>
              <div className="min-w-0">
                <p className="font-medium text-gray-800 text-sm">{landlord?.full_name || 'Landlord'}</p>
                <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                  {landlord?.email_verified && (
                    <span className="text-xs bg-green-50 text-green-700 px-1.5 py-0.5 rounded-full font-medium border border-green-200">✓ Verified</span>
                  )}
                  {landlord?.avg_rating > 0 && (
                    <span className="text-xs text-amber-500">{'★'.repeat(Math.round(landlord.avg_rating))} {landlord.avg_rating.toFixed(1)}</span>
                  )}
                </div>
              </div>
            </Link>

            {/* Price */}
            <div className="text-center mb-5">
              <div className="text-3xl font-bold text-red-700">{formatPrice(listing.price)}</div>
              <div className="text-xs text-gray-400 mt-0.5">per month</div>
            </div>

            {user && !isOwnListing && (
              <button
                onClick={() => toggleSave(listing.id)}
                aria-label={saved ? 'Unsave listing' : 'Save listing'}
                className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium transition mb-3 ${
                  saved
                    ? 'border-red-200 text-red-700 bg-red-50 hover:bg-red-100'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <span>{saved ? '♥' : '♡'}</span>
                {saved ? 'Saved' : 'Save Listing'}
              </button>
            )}

            {contactError && (
              <div className="bg-red-50 text-red-700 text-xs px-3 py-2 rounded-lg mb-3 border border-red-100">
                {contactError}
              </div>
            )}

            {isOwnListing ? (
              <div className="space-y-2">
                <div className="text-center text-sm text-gray-500 py-2 bg-gray-50 rounded-lg">
                  This is your listing
                </div>
                <Link to={`/listings/${listing.id}/edit`}
                  className="block w-full text-center py-2.5 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50 transition">
                  Edit Listing
                </Link>
              </div>
            ) : (
              <button onClick={handleContact} disabled={contacting}
                className="w-full bg-red-700 text-white py-3 rounded-lg font-semibold text-sm hover:bg-red-800 transition disabled:opacity-50 flex items-center justify-center gap-2">
                {contacting ? <><span className="animate-spin">⏳</span> Opening chat...</> : '💬 Contact Landlord'}
              </button>
            )}

            {!user && (
              <p className="text-xs text-gray-400 text-center mt-2">
                <Link to="/signup" className="text-red-700 hover:underline font-medium">Sign up</Link> or{' '}
                <Link to="/login" className="text-red-700 hover:underline font-medium">log in</Link> to message
              </p>
            )}

            <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-400 text-center space-y-1">
              <p>👁 {listing.views || 0} views · 📷 {images.length} photo{images.length !== 1 ? 's' : ''}</p>
              <p>Listed {new Date(listing.created_at).toLocaleDateString('en-CA')}</p>
            </div>
          </div>

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
                    maxLength={1000}
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
                    onClick={() => { setReportOpen(false); setReportReason(''); setReportDetails(''); setReportError(null) }}
                    className="flex-1 border border-gray-200 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
