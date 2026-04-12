import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useParams, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

function Avatar({ profile }) {
  if (profile?.avatar_url) {
    return <img src={profile.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
  }
  return (
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center font-bold text-white text-xs flex-shrink-0">
      {(profile?.full_name || profile?.email || '?').charAt(0).toUpperCase()}
    </div>
  )
}

const formatTime = (dateStr) => {
  const d = new Date(dateStr)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  if (isToday) return d.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function ConversationPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const isNew = id === 'new'
  const newConvoState = location.state // { listingId, landlordId, listing, landlord, unitId?, unitName?, roomId?, roomName? }

  const [conversation, setConversation] = useState(null)
  const conversationRef = useRef(null)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(!isNew)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const lastMessageAtRef = useRef(null)

  // Keep ref in sync with conversation state for use inside real-time callbacks
  useEffect(() => {
    conversationRef.current = conversation
  }, [conversation])

  const fetchConversation = useCallback(async () => {
    setLoading(true)
    const { data: convo, error: convoErr } = await supabase
      .from('conversations')
      .select(`
        id, renter_id, landlord_id, renter_unread, landlord_unread,
        listing:listing_id(id, title, city, listing_images(url, is_primary)),
        renter:renter_id(id, full_name, avatar_url, email),
        landlord:landlord_id(id, full_name, avatar_url, email),
        unit:unit_id(id, unit_name),
        room:room_id(id, room_name)
      `)
      .eq('id', id)
      .single()

    if (convoErr || !convo) { navigate('/messages'); return }
    if (convo.renter_id !== user.id && convo.landlord_id !== user.id) {
      navigate('/messages'); return
    }

    setConversation(convo)

    const { data: msgs } = await supabase
      .from('messages')
      .select('id, content, created_at, read, sender_id, sender:sender_id(id, full_name, avatar_url, email)')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true })

    setMessages(msgs || [])
    if (msgs?.length) lastMessageAtRef.current = msgs[msgs.length - 1].created_at
    setLoading(false)

    // Mark other party's messages as read + reset own unread counter
    await supabase
      .from('messages')
      .update({ read: true })
      .eq('conversation_id', id)
      .neq('sender_id', user.id)
      .eq('read', false)

    const unreadField = user.id === convo.renter_id ? 'renter_unread' : 'landlord_unread'
    await supabase.from('conversations').update({ [unreadField]: 0 }).eq('id', id)
  }, [id, navigate, user])

  // Initialize: either fetch existing conversation or set up from router state
  useEffect(() => {
    if (isNew) {
      if (!newConvoState?.listingId) { navigate('/messages'); return }
      setConversation({
        id: null,
        renter_id: user.id,
        landlord_id: newConvoState.landlordId,
        listing: newConvoState.listing,
        landlord: newConvoState.landlord,
        renter: user?.profile,
      })
      if (newConvoState.unitName) {
        const roomPart = newConvoState.roomName
          ? ` (${newConvoState.roomName})`
          : ''
        setNewMessage(`Hi, I'm interested in ${newConvoState.unitName}${roomPart} — is it still available?`)
      }
      setLoading(false)
      return
    }
    if (user) fetchConversation()
  }, [fetchConversation, id, isNew, navigate, newConvoState, user])

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Real-time subscription for new messages from the other party
  useEffect(() => {
    if (!id || isNew || !user) return
    const channel = supabase
      .channel(`messages-${id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` },
        async (payload) => {
          if (payload.new.sender_id === user.id) return
          const { data: msg } = await supabase
            .from('messages')
            .select('id, content, created_at, read, sender_id, sender:sender_id(id, full_name, avatar_url, email)')
            .eq('id', payload.new.id)
            .single()
          if (msg) {
            setMessages(prev => {
              if (prev.some(m => m.id === msg.id)) return prev
              lastMessageAtRef.current = msg.created_at
              return [...prev, msg]
            })
            supabase.from('messages').update({ read: true }).eq('id', msg.id)
            const convo = conversationRef.current
            if (convo) {
              const myUnreadField = user.id === convo.renter_id ? 'renter_unread' : 'landlord_unread'
              supabase.from('conversations').update({ [myUnreadField]: 0 }).eq('id', convo.id)
              setConversation(prev => prev ? { ...prev, [myUnreadField]: 0 } : prev)
            }
          }
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [id, isNew, user])

  // Polling fallback — catches messages real-time misses (e.g. replication not enabled)
  useEffect(() => {
    if (!id || isNew || !user) return
    const poll = setInterval(async () => {
      const since = lastMessageAtRef.current
      if (!since) return
      const { data } = await supabase
        .from('messages')
        .select('id, content, created_at, read, sender_id, sender:sender_id(id, full_name, avatar_url, email)')
        .eq('conversation_id', id)
        .gt('created_at', since)
        .order('created_at', { ascending: true })
      if (!data?.length) return
      setMessages(prev => {
        const existingIds = new Set(prev.map(m => m.id))
        const incoming = data.filter(m => !existingIds.has(m.id))
        if (!incoming.length) return prev
        lastMessageAtRef.current = data[data.length - 1].created_at
        // Mark other party's new messages as read
        const others = incoming.filter(m => m.sender_id !== user.id)
        if (others.length) {
          supabase.from('messages').update({ read: true }).in('id', others.map(m => m.id))
        }
        return [...prev, ...incoming]
      })
    }, 5000)
    return () => clearInterval(poll)
  }, [id, isNew, user])

  const handleSend = async (e) => {
    e.preventDefault()
    const content = newMessage.trim()
    if (!content || sending || !conversation) return

    setSending(true)
    setNewMessage('')
    setError(null)

    // New conversation: create the conversation row first, then insert the message
    if (isNew) {
      const { data: convo, error: convoErr } = await supabase
        .from('conversations')
        .insert({
          listing_id: newConvoState.listingId,
          renter_id: user.id,
          landlord_id: newConvoState.landlordId,
          unit_id: newConvoState.unitId || null,
          room_id: newConvoState.roomId || null,
        })
        .select('id')
        .single()

      if (convoErr) {
        // Conversation may already exist (race condition) — fall through to existing
        const { data: existing } = await supabase
          .from('conversations')
          .select('id')
          .eq('listing_id', newConvoState.listingId)
          .eq('renter_id', user.id)
          .maybeSingle()
        if (existing) {
          setSending(false)
          setNewMessage(content)
          navigate(`/messages/${existing.id}`, { replace: true })
          return
        }
        setError('Could not start conversation. Please try again.')
        setNewMessage(content)
        setSending(false)
        return
      }

      const { error: sendErr } = await supabase
        .from('messages')
        .insert({ conversation_id: convo.id, sender_id: user.id, content })

      if (sendErr) {
        setError('Failed to send message. Please try again.')
        setNewMessage(content)
        setSending(false)
        return
      }

      await supabase.from('conversations').update({
        last_message: content,
        last_message_at: new Date().toISOString(),
        landlord_unread: 1,
      }).eq('id', convo.id)

      // Navigate to the real conversation — component remounts and fetches cleanly
      navigate(`/messages/${convo.id}`, { replace: true })
      setSending(false)
      return
    }

    // Existing conversation
    const { data: msg, error: sendErr } = await supabase
      .from('messages')
      .insert({ conversation_id: id, sender_id: user.id, content })
      .select('id, content, created_at, read, sender_id, sender:sender_id(id, full_name, avatar_url, email)')
      .single()

    if (sendErr) {
      setError('Failed to send message. Please try again.')
      setNewMessage(content)
      setSending(false)
      return
    }

    setMessages(prev => [...prev, msg])
    if (msg) lastMessageAtRef.current = msg.created_at

    const otherUnreadField = user.id === conversation.renter_id ? 'landlord_unread' : 'renter_unread'
    const currentOtherUnread = user.id === conversation.renter_id
      ? (conversation.landlord_unread || 0)
      : (conversation.renter_unread || 0)

    await supabase.from('conversations').update({
      last_message: content,
      last_message_at: new Date().toISOString(),
      [otherUnreadField]: currentOtherUnread + 1,
    }).eq('id', id)

    setConversation(prev => prev ? { ...prev, [otherUnreadField]: currentOtherUnread + 1 } : prev)

    setSending(false)
    inputRef.current?.focus()
  }

  if (loading) return (
    <div className="max-w-2xl mx-auto px-4 py-10 animate-pulse space-y-4">
      <div className="h-14 bg-gray-200 rounded-xl" />
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className={`flex ${i % 2 === 0 ? '' : 'justify-end'}`}>
            <div className="h-10 bg-gray-200 rounded-xl w-48" />
          </div>
        ))}
      </div>
    </div>
  )

  const listingImage = conversation?.listing?.listing_images?.find(i => i.is_primary)
    || conversation?.listing?.listing_images?.[0]
  const other = user.id === conversation?.renter_id ? conversation?.landlord : conversation?.renter

  return (
    <div className="max-w-2xl mx-auto flex flex-col" style={{ height: 'calc(100vh - 64px)' }}>
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <Link to="/messages" className="text-gray-400 hover:text-gray-600 text-lg leading-none">←</Link>
        {listingImage && (
          <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
            <img src={listingImage.url} alt="" className="w-full h-full object-cover" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <Link
            to={conversation?.listing?.id ? `/listings/${conversation.listing.id}` : '#'}
            className="font-semibold text-sm text-gray-900 hover:text-red-700 truncate block transition"
          >
            {conversation?.listing?.title || 'Listing'}
          </Link>
          <p className="text-xs text-gray-500 truncate">
            {other?.full_name || other?.email || 'User'}
            {conversation?.unit?.unit_name ? ` · ${conversation.unit.unit_name}` : ''}
            {conversation?.unit?.unit_name && conversation?.room?.room_name ? ` / ${conversation.room.room_name}` : ''}
            {conversation?.listing?.city ? ` · ${conversation.listing.city}` : ''}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-center text-sm text-gray-400 py-8">
            {isNew ? 'Send a message to start the conversation.' : 'No messages yet. Say hello!'}
          </p>
        )}
        {messages.map(msg => {
          const isOwn = msg.sender_id === user.id
          return (
            <div key={msg.id} className={`flex items-end gap-2 ${isOwn ? 'justify-end' : 'justify-start'}`}>
              {!isOwn && <Avatar profile={msg.sender} />}
              <div className={`max-w-xs lg:max-w-sm flex flex-col gap-1 ${isOwn ? 'items-end' : 'items-start'}`}>
                <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  isOwn
                    ? 'bg-red-700 text-white rounded-br-md'
                    : 'bg-gray-100 text-gray-800 rounded-bl-md'
                }`}>
                  {msg.content}
                </div>
                <span className="text-xs text-gray-400 px-1">{formatTime(msg.created_at)}</span>
              </div>
              {isOwn && <Avatar profile={user.profile} />}
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Send input */}
      <div className="border-t border-gray-200 bg-white px-4 py-3 flex-shrink-0">
        {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
        <form onSubmit={handleSend} className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={newMessage}
            onChange={e => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 border border-gray-200 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
            maxLength={2000}
            disabled={sending}
          />
          <button
            type="submit"
            disabled={!newMessage.trim() || sending}
            className="bg-red-700 text-white px-5 py-2.5 rounded-full text-sm font-medium hover:bg-red-800 transition disabled:opacity-40"
          >
            {sending ? '...' : 'Send'}
          </button>
        </form>
      </div>
    </div>
  )
}
