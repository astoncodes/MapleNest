import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

export function useSavedListings() {
  const { user } = useAuth()
  const userId = user?.id
  const [savedIds, setSavedIds] = useState(new Set())
  const [loading, setLoading] = useState(!!userId)
  const [error, setError] = useState(null)
  // Tracks listingIds whose save/unsave request is in flight so a
  // rapid double-click can't launch two mutations and end up with the
  // UI and the DB disagreeing.
  const inFlightRef = useRef(new Set())

  useEffect(() => {
    if (!userId) {
      setSavedIds(new Set())
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    supabase
      .from('saved_listings')
      .select('listing_id')
      .eq('user_id', userId)
      .then(({ data, error: fetchError }) => {
        if (cancelled) return
        if (fetchError) {
          setError(fetchError.message)
        } else {
          setSavedIds(new Set((data || []).map(r => r.listing_id)))
        }
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [userId])

  const isSaved = useCallback((listingId) => savedIds.has(listingId), [savedIds])

  const toggleSave = useCallback(async (listingId) => {
    if (!userId) return false
    if (inFlightRef.current.has(listingId)) return false
    inFlightRef.current.add(listingId)
    try {
      const isCurrentlySaved = savedIds.has(listingId)

      setSavedIds(prev => {
        const next = new Set(prev)
        if (isCurrentlySaved) { next.delete(listingId) } else { next.add(listingId) }
        return next
      })

      const { error: mutError } = isCurrentlySaved
        ? await supabase.from('saved_listings').delete().eq('user_id', userId).eq('listing_id', listingId)
        : await supabase.from('saved_listings').insert({ user_id: userId, listing_id: listingId })

      if (mutError) {
        // 23505 = unique_violation: the row already exists. That's the
        // exact state our optimistic update assumed, so treat it as success.
        if (mutError.code === '23505') return true
        setSavedIds(prev => {
          const next = new Set(prev)
          if (isCurrentlySaved) { next.add(listingId) } else { next.delete(listingId) }
          return next
        })
        setError(mutError.message)
        return false
      }
      return true
    } finally {
      inFlightRef.current.delete(listingId)
    }
  }, [userId, savedIds])

  return { isSaved, toggleSave, savedIds, loading, error }
}
