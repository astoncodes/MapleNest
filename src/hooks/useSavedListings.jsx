import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

export function useSavedListings() {
  const { user } = useAuth()
  const [savedIds, setSavedIds] = useState(new Set())
  const [loading, setLoading] = useState(!!user)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!user) {
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
      .eq('user_id', user.id)
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
  }, [user?.id])

  const isSaved = useCallback((listingId) => savedIds.has(listingId), [savedIds])

  const toggleSave = useCallback(async (listingId) => {
    if (!user) return false
    // Read current state to decide direction
    let isCurrentlySaved = false
    setSavedIds(prev => { isCurrentlySaved = prev.has(listingId); return prev })

    // Optimistic update
    setSavedIds(prev => {
      const next = new Set(prev)
      if (isCurrentlySaved) { next.delete(listingId) } else { next.add(listingId) }
      return next
    })

    // DB call
    const { error: mutError } = isCurrentlySaved
      ? await supabase.from('saved_listings').delete().eq('user_id', user.id).eq('listing_id', listingId)
      : await supabase.from('saved_listings').insert({ user_id: user.id, listing_id: listingId })

    if (mutError) {
      // Roll back optimistic update on failure
      setSavedIds(prev => {
        const next = new Set(prev)
        if (isCurrentlySaved) { next.add(listingId) } else { next.delete(listingId) }
        return next
      })
      setError(mutError.message)
      return false
    }
    return true
  }, [user])

  return { isSaved, toggleSave, savedIds, loading, error }
}
