import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import CreateListingPage from './CreateListingPage'
import { supabase } from '../lib/supabase'
import { canModifyListing } from '../utils/listingPermissions'
import { useAuth } from '../hooks/useAuth'

// 'loading' stays until both auth and the listing fetch resolve, so we
// never render CreateListingPage against a stale/missing user.
export default function EditListingPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'not_found' | 'unauthorized'
  const [listing, setListing] = useState(null)

  useEffect(() => {
    if (authLoading) return

    let isActive = true
    setStatus('loading')

    const run = async () => {
      if (!user) {
        if (isActive) setStatus('unauthorized')
        return
      }

      const { data, error } = await supabase
        .from('listings')
        .select('*, listing_images(id, url, is_primary, sort_order, storage_path)')
        .eq('id', id)
        .single()

      if (!isActive) return

      if (error || !data) {
        setStatus('not_found')
        return
      }

      if (!canModifyListing(user, data)) {
        setStatus('unauthorized')
        return
      }

      setListing(data)
      setStatus('ready')
    }

    run()

    return () => { isActive = false }
  }, [id, user, authLoading])

  if (status === 'loading') {
    return <div className="max-w-2xl mx-auto px-4 py-10 text-gray-500">Loading...</div>
  }

  if (status !== 'ready') {
    const message = status === 'not_found'
      ? 'Listing not found.'
      : 'You are not authorized to edit this listing.'
    return (
      <div className="max-w-2xl mx-auto px-4 py-10 space-y-4 text-center">
        <p className="text-red-700 text-sm">{message}</p>
        <button
          onClick={() => navigate('/profile')}
          className="text-sm text-red-700 hover:underline"
        >
          Back to profile
        </button>
      </div>
    )
  }

  return (
    <CreateListingPage
      mode="edit"
      listing={listing}
      onSubmitSuccess={() => navigate(`/listings/${id}`)}
    />
  )
}
