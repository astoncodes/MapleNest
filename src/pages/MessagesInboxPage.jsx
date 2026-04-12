import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

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
    return <img src={profile.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
  }
  return (
    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center font-bold text-white flex-shrink-0 text-sm">
      {(profile?.full_name || profile?.email || '?').charAt(0).toUpperCase()}
    </div>
  )
}

export default function MessagesInboxPage() {
  const { user } = useAuth()
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    fetchConversations()
  }, [user?.id])

  const fetchConversations = async () => {
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
      .or(`renter_id.eq.${user.id},landlord_id.eq.${user.id}`)
      .not('last_message', 'is', null)
      .order('last_message_at', { ascending: false })

    setConversations(data || [])
    setLoading(false)
  }

  if (loading) return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-3">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 animate-pulse flex gap-3">
          <div className="w-10 h-10 rounded-full bg-gray-200 flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3 bg-gray-200 rounded w-1/3" />
            <div className="h-3 bg-gray-200 rounded w-2/3" />
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Messages</h1>

      {conversations.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-5xl mb-4">💬</div>
          <p className="font-medium text-gray-600">No conversations yet</p>
          <p className="text-sm mt-1">When you contact a landlord, your conversation will appear here.</p>
          <Link to="/listings" className="mt-4 inline-block text-red-700 text-sm font-medium hover:underline">
            Browse listings
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {conversations.map(convo => {
            const isRenter = user.id === convo.renter?.id
            const other = isRenter ? convo.landlord : convo.renter
            const unread = isRenter ? (convo.renter_unread || 0) : (convo.landlord_unread || 0)
            const listingImage = convo.listing?.listing_images?.find(i => i.is_primary) || convo.listing?.listing_images?.[0]

            return (
              <Link
                key={convo.id}
                to={`/messages/${convo.id}`}
                className="flex items-center gap-3 bg-white rounded-xl border border-gray-100 shadow-sm p-4 hover:shadow-md transition-all"
              >
                <Avatar profile={other} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-sm text-gray-900 truncate">
                      {other?.full_name || other?.email || 'User'}
                    </p>
                    <span className="text-xs text-gray-400 flex-shrink-0">{timeAgo(convo.last_message_at)}</span>
                  </div>
                  <p className="text-xs text-gray-500 truncate mt-0.5">
                    {convo.listing?.title || 'Listing'}
                    {convo.unit?.unit_name ? ` · ${convo.unit.unit_name}` : ''}
                    {convo.room?.room_name ? ` / ${convo.room.room_name}` : ''}
                    {convo.listing?.city ? ` · ${convo.listing.city}` : ''}
                  </p>
                  <p className={`text-xs truncate mt-0.5 ${unread > 0 ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>
                    {convo.last_message || 'No messages yet'}
                  </p>
                </div>
                {listingImage && (
                  <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
                    <img src={listingImage.url} alt="" className="w-full h-full object-cover" />
                  </div>
                )}
                {unread > 0 && (
                  <div className="w-5 h-5 bg-red-600 text-white text-xs rounded-full flex items-center justify-center font-bold flex-shrink-0">
                    {unread > 9 ? '9+' : unread}
                  </div>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
