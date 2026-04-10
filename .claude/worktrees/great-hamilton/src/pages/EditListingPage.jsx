import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import CreateListingPage from './CreateListingPage'
import { supabase } from '../lib/supabase'
import { canModifyListing } from '../utils/listingPermissions'
import { useAuth } from '../hooks/useAuth'

export default function EditListingPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const [listing, setListing] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let isActive = true

    const fetchListing = async () => {
      const { data, error } = await supabase
        .from('listings')
        .select('*, listing_images(id, url, is_primary, sort_order, storage_path)')
        .eq('id', id)
        .single()

      if (!isActive) return

      if (error || !data) {
        setError('Listing not found or you do not have access to edit it.')
        setListing(null)
        setLoading(false)
        return
      }

      setListing(data)
      setLoading(false)
    }

    fetchListing()

    return () => {
      isActive = false
    }
  }, [id])

  useEffect(() => {
    if (loading || authLoading || !user || !listing) return

    if (!canModifyListing(user, listing)) {
      setError('You are not authorized to edit this listing.')
      setLoading(false)
    }
  }, [loading, authLoading, user, listing])

  if (authLoading || loading) {
    return <div className="max-w-2xl mx-auto px-4 py-10 text-gray-500">Loading...</div>
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10 space-y-4 text-center">
        <p className="text-red-700 text-sm">{error}</p>
        <button
          onClick={() => navigate('/profile')}
          className="text-sm text-red-700 hover:underline"
        >
          Back to profile
        </button>
      </div>
    )
  }

  if (!canModifyListing(user, listing)) {
    return null
  }

  return (
    <CreateListingPage
      mode="edit"
      listing={listing}
      onSubmitSuccess={() => navigate(`/listings/${id}`)}
    />
  )
}

