import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import ReviewPromptBanner from '../components/reviews/ReviewPromptBanner'

const timeAgo = (dateStr) => {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr)
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
}

function Avatar({ profile }) {
  if (profile?.avatar_url) {
    return <img src={profile.avatar_url} alt="" className="w-10 h-10 object-cover flex-shrink-0" />
  }
  return (
    <div className="w-10 h-10 bg-maple flex items-center justify-center font-normal text-white flex-shrink-0 text-sm">
      {(profile?.full_name || profile?.email || '?').charAt(0).toUpperCase()}
    </div>
  )
}

export default function MessagesInboxPage() {
  const { user } = useAuth()
  const userId = user?.id
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)
  const [pendingReviews, setPendingReviews] = useState({})

  const fetchConversations = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    const { data } = await supabase
      .from('conversations')
      .select(`
        id, last_message, last_message_at, renter_unread, landlord_unread,
        listing:listing_id(id, title, city, listing_images(url, is_primary)),
        renter:renter_id(id, full_name, avatar_url, email),
        landlord:landlord_id(id, full_name, avatar_url, email),
        unit:unit_id(id, unit_name),
        room:room_id(id, room_name)
      `)
      .or(`renter_id.eq.${userId},landlord_id.eq.${userId}`)
      .not('last_message', 'is', null)
      .order('last_message_at', { ascending: false })

    setConversations(data || [])
    setLoading(false)
  }, [userId])

  const fetchPendingReviews = useCallback(async () => {
    if (!userId) return
    const { data: tenancies } = await supabase
      .from('tenancies')
      .select('id, listing_id, renter_id, landlord_id, conversation_id, move_out, status, review_window_closes_at')
      .eq('status', 'ended')
      .or(`renter_id.eq.${userId},landlord_id.eq.${userId}`)
      .gt('review_window_closes_at', new Date().toISOString())

    if (!tenancies?.length) return

    const tenancyIds = tenancies.map(t => t.id)
    const { data: existingReviews } = await supabase
      .from('reviews')
      .select('tenancy_id')
      .eq('reviewer_id', userId)
      .in('tenancy_id', tenancyIds)

    const reviewedSet = new Set((existingReviews || []).map(r => r.tenancy_id))
    const map = {}
    for (const t of tenancies) {
      if (t.conversation_id) {
        map[t.conversation_id] = { tenancy: t, hasSubmitted: reviewedSet.has(t.id) }
      }
    }
    setPendingReviews(map)
  }, [userId])

  useEffect(() => {
    if (!userId) return
    fetchConversations()
    fetchPendingReviews()
  }, [fetchConversations, fetchPendingReviews, userId])

  if (loading) return (
    <div className="max-w-2xl mx-auto px-6 py-12 space-y-3">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="border border-hairline bg-canvas p-4 animate-pulse flex gap-3">
          <div className="w-10 h-10 bg-hairline flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3 bg-hairline rounded w-1/3" />
            <div className="h-3 bg-hairline rounded w-2/3" />
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <div className="bg-canvas min-h-screen">

      {/* Page header */}
      <div className="border-b border-hairline px-6 py-10">
        <div className="max-w-2xl mx-auto">
          <div className="text-[10px] tracking-widest uppercase text-maple mb-3">Inbox</div>
          <h1 className="font-serif font-normal text-ink" style={{ fontSize: 'clamp(28px, 4vw, 44px)', lineHeight: 1.1 }}>
            Messages
          </h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8">
        {conversations.length === 0 ? (
          <div className="py-24 text-center">
            <div className="font-serif font-light text-5xl text-stone mb-5">∅</div>
            <p className="font-serif font-normal text-xl text-ink mb-2">No conversations yet</p>
            <p className="text-sm text-steel mb-6">When you contact a landlord, your conversation will appear here.</p>
            <Link
              to="/listings"
              className="text-[11px] tracking-widest uppercase text-maple hover:text-maple-dark transition-colors inline-flex items-center gap-2"
            >
              Browse listings <span>→</span>
            </Link>
          </div>
        ) : (
          <div className="space-y-px border border-hairline">
            {conversations.map(convo => {
              const isRenter = userId === convo.renter?.id
              const other = isRenter ? convo.landlord : convo.renter
              const unread = isRenter ? (convo.renter_unread || 0) : (convo.landlord_unread || 0)
              const listingImage = convo.listing?.listing_images?.find(i => i.is_primary) || convo.listing?.listing_images?.[0]
              const pending = pendingReviews[convo.id]

              return (
                <div key={convo.id}>
                  <Link
                    to={`/messages/${convo.id}`}
                    className={`flex items-center gap-4 p-4 hover:bg-surface transition-colors duration-150 ${unread > 0 ? 'bg-maple-light/40' : 'bg-canvas'}`}
                  >
                    <Avatar profile={other} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-3 mb-0.5">
                        <p className={`text-sm truncate ${unread > 0 ? 'font-medium text-ink' : 'font-normal text-charcoal'}`}>
                          {other?.full_name || other?.email || 'User'}
                        </p>
                        <span className="text-[10px] tracking-wide uppercase text-stone flex-shrink-0">
                          {timeAgo(convo.last_message_at)}
                        </span>
                      </div>
                      <p className="text-[11px] tracking-wide text-steel truncate mb-1">
                        {convo.listing?.title || 'Listing'}
                        {convo.unit?.unit_name ? ` · ${convo.unit.unit_name}` : ''}
                        {convo.listing?.city ? ` · ${convo.listing.city}` : ''}
                      </p>
                      <p className={`text-xs truncate ${unread > 0 ? 'text-charcoal font-medium' : 'text-stone'}`}>
                        {convo.last_message || 'No messages yet'}
                      </p>
                    </div>

                    {listingImage && (
                      <div className="w-12 h-12 overflow-hidden flex-shrink-0 bg-surface">
                        <img src={listingImage.url} alt="" loading="lazy" className="w-full h-full object-cover" />
                      </div>
                    )}

                    {unread > 0 && (
                      <div className="w-5 h-5 bg-maple text-white text-[10px] flex items-center justify-center font-medium flex-shrink-0">
                        {unread > 9 ? '9+' : unread}
                      </div>
                    )}
                  </Link>

                  {pending && !pending.hasSubmitted && (
                    <div className="border-t border-hairline">
                      <ReviewPromptBanner
                        tenancy={pending.tenancy}
                        currentUserId={userId}
                        hasSubmittedReview={pending.hasSubmitted}
                        reviewWindowClosesAt={pending.tenancy.review_window_closes_at}
                        listingTitle={convo.listing?.title}
                        onReviewSubmitted={() => {
                          setPendingReviews(prev => ({
                            ...prev,
                            [convo.id]: { ...prev[convo.id], hasSubmitted: true },
                          }))
                        }}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
