import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { canModifyListing } from '../utils/listingPermissions'
import ConfirmModal from '../components/shared/ConfirmModal'

const TYPE_LABELS = { apartment: 'Apartment', house: 'House', room: 'Room', basement: 'Basement Suite', condo: 'Condo', townhouse: 'Townhouse' }
const LEASE_LABELS = { monthly: 'Month-to-Month', '6_months': '6 Months', '1_year': '1 Year', flexible: 'Flexible' }

export default function ListingDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [listing, setListing] = useState(null)
  const [landlord, setLandlord] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activePhoto, setActivePhoto] = useState(0)
  const [contacting, setContacting] = useState(false)
  const [contactError, setContactError] = useState(null)
  const [manageLoading, setManageLoading] = useState(false)
  const [manageError, setManageError] = useState(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  useEffect(() => {
    fetchListing()
  }, [id])

  const fetchListing = async () => {
    const { data } = await supabase
      .from('listings')
      .select('*, listing_images(url, is_primary, sort_order)')
      .eq('id', id)
      .single()

    if (!data) { navigate('/listings'); return }

    // Sort images
    if (data.listing_images) {
      data.listing_images.sort((a, b) => a.sort_order - b.sort_order)
    }

    setListing(data)

    // Fetch landlord profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.landlord_id)
      .single()

    setLandlord(profile)
    setLoading(false)

    // Increment view count
    const { error: viewError } = await supabase
      .from('listings')
      .update({ views: (data.views || 0) + 1 })
      .eq('id', id)

    if (viewError && viewError.code !== '42501') {
      console.warn('Could not update listing views:', viewError.message)
    }
  }

  const handleContact = async () => {
    if (!user) { navigate('/login'); return }
    if (user.id === listing.landlord_id) return

    setContacting(true)
    setContactError(null)

    try {
      // Check if conversation already exists
      const { data: existing } = await supabase
        .from('conversations')
        .select('id')
        .eq('listing_id', id)
        .eq('renter_id', user.id)
        .single()

      if (existing) {
        navigate(`/messages/${existing.id}`)
        return
      }

      // Create new conversation
      const { data: convo, error } = await supabase
        .from('conversations')
        .insert({
          listing_id: id,
          renter_id: user.id,
          landlord_id: listing.landlord_id,
        })
        .select()
        .single()

      if (error) throw error
      navigate(`/messages/${convo.id}`)
    } catch (err) {
      setContactError('Could not start conversation. Please try again.')
    } finally {
      setContacting(false)
    }
  }

  const canModify = canModifyListing(user, listing)

  const handleDelete = async () => {
    if (!listing?.id || !user?.id || !canModify) return
    setShowDeleteConfirm(false)

    setManageLoading(true)
    setManageError(null)
    try {
      const { data: removed, error } = await supabase
        .from('listings')
        .delete()
        .eq('id', listing.id)
        .eq('landlord_id', user.id)
        .select('id')

      if (error) throw error
      if (!removed || removed.length === 0) {
        setManageError('Could not delete listing. It may have already been deleted or you may not be authorized.')
        return
      }

      navigate('/profile')
    } catch (err) {
      if (err?.code === '42501') {
        setManageError('Delete blocked by permissions. Make sure you are signed in as this listing owner and your profile role is landlord.')
      } else {
        setManageError(err?.message || 'Could not delete listing. Please try again.')
      }
    } finally {
      setManageLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-10 animate-pulse">
        <div className="h-80 bg-gray-200 rounded-xl mb-6" />
        <div className="h-8 bg-gray-200 rounded w-1/2 mb-4" />
        <div className="h-4 bg-gray-200 rounded w-1/4" />
      </div>
    )
  }

  const images = listing.listing_images || []
  const formatPrice = (p) => `$${p.toLocaleString()}`
  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' }) : 'Immediately'

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-4">
        <Link to="/listings" className="hover:text-gray-600">Listings</Link>
        <span>/</span>
        <span className="text-gray-600 truncate">{listing.title}</span>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left: photos + details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Photo gallery */}
          <div className="rounded-xl overflow-hidden bg-gray-100">
            {images.length > 0 ? (
              <>
                <div className="aspect-video">
                  <img src={images[activePhoto]?.url} alt={listing.title}
                    className="w-full h-full object-cover" />
                </div>
                {images.length > 1 && (
                  <div className="flex gap-2 p-2 overflow-x-auto">
                    {images.map((img, i) => (
                      <button key={i} onClick={() => setActivePhoto(i)}
                        className={`flex-shrink-0 w-16 h-12 rounded overflow-hidden border-2 transition ${
                          i === activePhoto ? 'border-red-700' : 'border-transparent'
                        }`}>
                        <img src={img.url} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="aspect-video flex items-center justify-center text-gray-300 text-6xl">🏠</div>
            )}
          </div>

          {/* Title & location */}
          <div>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{listing.title}</h1>
                <p className="text-gray-500 mt-1">
                  📍 {listing.neighbourhood ? `${listing.neighbourhood}, ` : ''}{listing.city}, PEI
                </p>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-red-700">{formatPrice(listing.price)}</div>
                <div className="text-sm text-gray-400">/month</div>
              </div>
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
              <div key={s.label} className="bg-gray-50 rounded-lg p-3 text-center">
                <div className="text-xl mb-1">{s.icon}</div>
                <div className="text-sm font-semibold text-gray-800">{s.value}</div>
                <div className="text-xs text-gray-400">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Description */}
          {listing.description && (
            <div>
              <h2 className="font-semibold text-gray-800 mb-2">About this place</h2>
              <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-line">{listing.description}</p>
            </div>
          )}

          {/* Details */}
          <div>
            <h2 className="font-semibold text-gray-800 mb-3">Details</h2>
            <div className="grid grid-cols-2 gap-y-3 gap-x-6 text-sm">
              {[
                { label: 'Available', value: formatDate(listing.available_from) },
                { label: 'Lease Term', value: LEASE_LABELS[listing.lease_term] || listing.lease_term },
                { label: 'Laundry', value: listing.laundry === 'in_unit' ? 'In-Unit' : listing.laundry === 'shared' ? 'Shared' : 'None' },
                { label: 'Utilities', value: listing.utilities_included ? '✅ Included' : '❌ Not included' },
                { label: 'Pet Friendly', value: listing.pet_friendly ? '✅ Yes' : '❌ No' },
                { label: 'Parking', value: listing.parking_available ? '✅ Available' : '❌ No' },
                { label: 'Furnished', value: listing.furnished ? '✅ Yes' : '❌ No' },
              ].map(d => (
                <div key={d.label} className="flex justify-between border-b border-gray-50 pb-2">
                  <span className="text-gray-500">{d.label}</span>
                  <span className="text-gray-800 font-medium text-right">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Contact card */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 sticky top-20">
            {/* Landlord info */}
            <div className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-100">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center text-red-700 font-bold text-lg">
                {(landlord?.full_name || landlord?.email || '?')[0].toUpperCase()}
              </div>
              <div>
                <p className="font-medium text-gray-800 text-sm">{landlord?.full_name || 'Landlord'}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  {landlord?.email_verified && (
                    <span className="text-xs bg-green-50 text-green-700 px-1.5 py-0.5 rounded font-medium">✓ Verified</span>
                  )}
                </div>
              </div>
            </div>

            <div className="text-center mb-4">
              <div className="text-2xl font-bold text-red-700">{formatPrice(listing.price)}</div>
              <div className="text-xs text-gray-400">per month</div>
            </div>

            {contactError && (
              <div className="bg-red-50 text-red-700 text-xs px-3 py-2 rounded-lg mb-3">{contactError}</div>
            )}

            {manageError && (
              <div className="bg-red-50 text-red-700 text-xs px-3 py-2 rounded-lg mb-3">{manageError}</div>
            )}

            {canModify ? (
              <div className="space-y-2">
                <Link to={`/listings/${id}/edit`}
                  className="w-full inline-block text-center bg-red-700 text-white py-3 rounded-lg font-semibold text-sm hover:bg-red-800 transition">
                  Edit listing
                </Link>
                <button onClick={() => setShowDeleteConfirm(true)} disabled={manageLoading}
                  className="w-full border border-red-100 text-red-700 bg-white py-3 rounded-lg font-semibold text-sm hover:bg-red-50 transition disabled:opacity-50">
                  {manageLoading ? 'Deleting...' : 'Delete listing'}
                </button>
              </div>
            ) : (
              <button onClick={handleContact} disabled={contacting}
                className="w-full bg-red-700 text-white py-3 rounded-lg font-semibold text-sm hover:bg-red-800 transition disabled:opacity-50">
                {contacting ? 'Opening chat...' : '💬 Contact Landlord'}
              </button>
            )}

            <ConfirmModal
              isOpen={showDeleteConfirm}
              title="Delete listing"
              message="This action permanently deletes the listing and removes it from the platform."
              confirmText="Delete listing"
              cancelText="Keep listing"
              loading={manageLoading}
              onConfirm={handleDelete}
              onCancel={() => setShowDeleteConfirm(false)}
            />

            {!user && (
              <p className="text-xs text-gray-400 text-center mt-2">
                <Link to="/signup" className="text-red-700 hover:underline">Sign up</Link> to message this landlord
              </p>
            )}

            <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-400 text-center space-y-1">
              <p>👁 {listing.views || 0} views</p>
              <p>Posted {new Date(listing.created_at).toLocaleDateString('en-CA')}</p>
            </div>
          </div>

          {/* Report listing */}
          <button className="w-full text-xs text-gray-400 hover:text-gray-500 text-center py-2">
            🚩 Report this listing
          </button>
        </div>
      </div>
    </div>
  )
}
