import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { canModifyListing } from '../utils/listingPermissions'

export default function ProfilePage() {
  const { user, loading } = useAuth()
  const [profile, setProfile] = useState(null)
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [error, setError] = useState('')
  const [listings, setListings] = useState([])
  const [removingListingId, setRemovingListingId] = useState(null)

  useEffect(() => {
    let isActive = true

    if (!user?.id) {
      setLoadingProfile(false)
      return
    }

    const fetchProfileData = async () => {
      setLoadingProfile(true)
      setError('')
      const [{ data: profileData, error: profileError }, { data: listingsData, error: listingsError }] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, email, role, full_name, phone, avatar_url, bio, email_verified, phone_verified, id_verified, created_at')
          .eq('id', user.id)
          .maybeSingle(),
        supabase
          .from('listings')
          .select('id, title, city, property_type, status, price, created_at')
          .eq('landlord_id', user.id)
          .order('created_at', { ascending: false }),
      ])

      if (!isActive) return
      if (profileError) setError(`Failed to load profile: ${profileError.message}`)
      if (listingsError) setError(`Failed to load listings: ${listingsError.message}`)
      if (profileData) setProfile(profileData)
      if (listingsData) setListings(listingsData)
      if (!isActive) return
      setLoadingProfile(false)
    }

    fetchProfileData()
    return () => {
      isActive = false
    }
  }, [user?.id])

  const role = user?.role || profile?.role || 'renter'
  const isLandlord = role === 'landlord'

  const cityBuckets = useMemo(() => {
    return listings.reduce((acc, listing) => {
      const key = listing.city || 'Unknown'
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})
  }, [listings])

  const typeBuckets = useMemo(() => {
    return listings.reduce((acc, listing) => {
      const key = listing.property_type || 'Unknown'
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})
  }, [listings])

  const handleDeleteListing = async (listingId) => {
    if (!listingId || !window.confirm('Remove this listing? It will be marked as removed.')) return

    setRemovingListingId(listingId)
    setError('')
    try {
      const { error: removeError } = await supabase
        .from('listings')
        .update({ status: 'removed' })
        .eq('id', listingId)

      if (removeError) throw removeError

      setListings(prev => prev.filter(item => item.id !== listingId))
    } catch (err) {
      setError(`Failed to remove listing: ${err.message}`)
    } finally {
      setRemovingListingId(null)
    }
  }

  if (loading || loadingProfile) {
    return <div className="max-w-4xl mx-auto px-4 py-12 text-gray-500">Loading...</div>
  }

  if (!user?.id) {
    return <div className="max-w-4xl mx-auto px-4 py-12 text-gray-500">Sign in to view your profile.</div>
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-8">
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        {error && (
          <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
            <p className="text-gray-500 text-sm mt-1">Role: <span className="font-medium text-gray-700">{role}</span></p>
            <p className="text-sm text-gray-600 mt-3">{profile?.full_name || 'No name on file'}</p>
            <p className="text-sm text-gray-500">{profile?.email || user?.email}</p>
            {profile?.phone && <p className="text-sm text-gray-500">Phone: {profile.phone}</p>}
            {profile?.bio && <p className="text-sm text-gray-500 mt-2 max-w-xl">{profile.bio}</p>}
          </div>
          <div className="text-right text-sm text-gray-500">
            <p>📍 Listings owned</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{listings.length}</p>
            {!isLandlord && (
              <Link to="/signup" className="inline-flex mt-3 text-red-700 font-medium hover:underline">
                Need to post as landlord? Create another account
              </Link>
            )}
          </div>
        </div>
        <div className="mt-4 text-xs text-gray-500">
          Verified: {profile?.email_verified ? '✅ Email' : '❌ Email'} · {profile?.phone_verified ? '✅ Phone' : '❌ Phone'} · {profile?.id_verified ? '✅ ID' : '❌ ID'}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-800 mb-3">Listings by city</h2>
          {Object.keys(cityBuckets).length === 0 ? (
            <p className="text-sm text-gray-500">No listings yet.</p>
          ) : (
            <ul className="space-y-2 text-sm text-gray-700">
              {Object.entries(cityBuckets).map(([city, count]) => (
                <li key={city} className="flex justify-between border-b border-gray-100 pb-2">
                  <span>{city}</span><span>{count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-800 mb-3">Listings by type</h2>
          {Object.keys(typeBuckets).length === 0 ? (
            <p className="text-sm text-gray-500">No listings yet.</p>
          ) : (
            <ul className="space-y-2 text-sm text-gray-700">
              {Object.entries(typeBuckets).map(([type, count]) => (
                <li key={type} className="flex justify-between border-b border-gray-100 pb-2">
                  <span className="capitalize">{type}</span><span>{count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-800 mb-3">My listings</h2>
            {listings.length === 0 ? (
              <p className="text-sm text-gray-500">No listings found.</p>
            ) : (
              <div className="space-y-3">
                {listings.map(listing => (
                  <div
                    key={listing.id}
                    className="flex flex-wrap items-center justify-between gap-3 border border-gray-100 rounded-lg p-3 hover:bg-gray-50"
                  >
                    <Link to={`/listings/${listing.id}`} className="min-w-0 flex-1">
                      <p className="font-medium text-sm text-gray-800">{listing.title}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {listing.city} · {listing.property_type} · ${listing.price}/mo
                      </p>
                    </Link>
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-1 rounded-full bg-green-50 text-green-700">
                        {listing.status}
                      </span>
                      {canModifyListing(user, listing) && (
                        <>
                          <Link to={`/listings/${listing.id}/edit`}
                            className="text-xs font-medium text-red-700 border border-red-200 rounded px-2 py-1 hover:bg-red-50">
                            Edit
                          </Link>
                          <button
                            onClick={() => handleDeleteListing(listing.id)}
                            disabled={removingListingId === listing.id}
                            className="text-xs font-medium text-gray-700 border border-gray-200 rounded px-2 py-1 hover:bg-gray-50 disabled:opacity-50"
                          >
                            {removingListingId === listing.id ? 'Removing...' : 'Delete'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
      </div>
    </div>
  )
}
