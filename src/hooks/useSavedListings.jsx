// src/hooks/useSavedListings.jsx
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

export function useSavedListings() {
  const { user } = useAuth()
  const [savedIds, setSavedIds] = useState(new Set())
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!user) { setSavedIds(new Set()); return }
    setLoading(true)
    supabase
      .from('saved_listings')
      .select('listing_id')
      .eq('user_id', user.id)
      .then(({ data }) => {
        setSavedIds(new Set((data || []).map(r => r.listing_id)))
        setLoading(false)
      })
  }, [user])

  const isSaved = useCallback((listingId) => savedIds.has(listingId), [savedIds])

  const toggleSave = useCallback(async (listingId) => {
    if (!user) return false
    if (savedIds.has(listingId)) {
      await supabase
        .from('saved_listings')
        .delete()
        .eq('user_id', user.id)
        .eq('listing_id', listingId)
      setSavedIds(prev => { const next = new Set(prev); next.delete(listingId); return next })
    } else {
      await supabase
        .from('saved_listings')
        .insert({ user_id: user.id, listing_id: listingId })
      setSavedIds(prev => new Set(prev).add(listingId))
    }
    return true
  }, [user, savedIds])

  return { isSaved, toggleSave, savedIds, loading }
}
