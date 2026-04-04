import { Link, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'

export default function Navbar() {
  const { user, signOut, isLandlord } = useAuth()
  const navigate = useNavigate()
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    if (!user) { setUnreadCount(0); return }
    supabase
      .from('conversations')
      .select('renter_id, renter_unread, landlord_unread')
      .or(`renter_id.eq.${user.id},landlord_id.eq.${user.id}`)
      .then(({ data }) => {
        if (!data) return
        const total = data.reduce((sum, c) => {
          return sum + (user.id === c.renter_id ? (c.renter_unread || 0) : (c.landlord_unread || 0))
        }, 0)
        setUnreadCount(total)
      })
  }, [user?.id])

  const handleSignOut = async () => {
    await signOut()
    navigate('/')
  }

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <span className="text-2xl">🍁</span>
          <span className="text-xl font-bold text-red-700">MapleNest</span>
          <span className="text-xs text-gray-400 hidden sm:block">PEI Housing</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link to="/listings" className="text-gray-600 hover:text-gray-900 text-sm font-medium">
            Browse Listings
          </Link>
          <Link to="/analytics" className="text-gray-600 hover:text-gray-900 text-sm font-medium">
            Analytics
          </Link>
          {user && (
            <Link to="/messages" className="relative text-gray-600 hover:text-gray-900 text-sm font-medium">
              Messages
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-2.5 bg-red-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold leading-none">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Link>
          )}
          {user ? (
            <>
              {isLandlord ? (
                <Link to="/create-listing"
                  className="bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-800 transition">
                  + Post Listing
                </Link>
              ) : (
                <Link to="/create-listing"
                  className="bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-800 transition">
                  + Post Sublease
                </Link>
              )}
              <Link to="/profile" className="text-gray-600 hover:text-gray-900 text-sm">Profile</Link>
              <button onClick={handleSignOut} className="text-gray-400 hover:text-gray-600 text-sm">Sign Out</button>
            </>
          ) : (
            <>
              <Link to="/login" className="text-gray-600 hover:text-gray-900 text-sm font-medium">Log In</Link>
              <Link to="/signup"
                className="bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-800 transition">
                Sign Up
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}
