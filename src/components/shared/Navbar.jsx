import { Link, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'

export default function Navbar() {
  const { user, signOut, isLandlord } = useAuth()
  const navigate = useNavigate()
  const [unreadCount, setUnreadCount] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (!user) { setUnreadCount(0); return }
    supabase
      .from('conversations')
      .select('renter_id, landlord_id, renter_unread, landlord_unread')
      .or(`renter_id.eq.${user.id},landlord_id.eq.${user.id}`)
      .then(({ data, error }) => {
        if (error) { console.error('Navbar: failed to fetch unread counts', error); return }
        if (!data) return
        const total = data.reduce((sum, c) => {
          return sum + (user.id === c.renter_id ? (c.renter_unread || 0) : (c.landlord_unread || 0))
        }, 0)
        setUnreadCount(total)
      })
  }, [user])

  // Close menu on route change
  useEffect(() => { setMenuOpen(false) }, [navigate])

  const handleSignOut = async () => {
    setMenuOpen(false)
    await signOut()
    navigate('/')
  }

  const navLink = "text-gray-600 hover:text-gray-900 text-sm font-medium"

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 flex-shrink-0">
          <span className="text-2xl">🍁</span>
          <span className="text-xl font-bold text-red-700">MapleNest</span>
          <span className="text-xs text-gray-400 hidden sm:block">PEI Housing</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-4">
          <Link to="/listings" className={navLink}>Browse Listings</Link>
          <Link to="/analytics" className={navLink}>Analytics</Link>
          {user && (
            <Link to="/messages" className={`relative ${navLink}`}>
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
              <Link to="/create-listing"
                className="bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-800 transition">
                {isLandlord ? '+ Post Listing' : '+ Post Sublease'}
              </Link>
              <Link to="/profile" className="text-gray-600 hover:text-gray-900 text-sm">Profile</Link>
              <button onClick={handleSignOut} className="text-gray-400 hover:text-gray-600 text-sm">Sign Out</button>
            </>
          ) : (
            <>
              <Link to="/login" className={navLink}>Log In</Link>
              <Link to="/signup"
                className="bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-800 transition">
                Sign Up
              </Link>
            </>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden relative flex items-center justify-center w-9 h-9 rounded-lg hover:bg-gray-100 transition"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            {menuOpen
              ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              : <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            }
          </svg>
          {!menuOpen && unreadCount > 0 && (
            <span className="absolute top-0.5 right-0.5 bg-red-600 w-2 h-2 rounded-full" />
          )}
        </button>
      </div>

      {/* Mobile menu dropdown */}
      {menuOpen && (
        <div className="md:hidden border-t border-gray-100 bg-white px-4 py-3 space-y-1">
          <Link to="/listings" onClick={() => setMenuOpen(false)}
            className="block py-2.5 text-sm font-medium text-gray-700 hover:text-red-700">
            Browse Listings
          </Link>
          <Link to="/analytics" onClick={() => setMenuOpen(false)}
            className="block py-2.5 text-sm font-medium text-gray-700 hover:text-red-700">
            Analytics
          </Link>
          {user && (
            <Link to="/messages" onClick={() => setMenuOpen(false)}
              className="block py-2.5 text-sm font-medium text-gray-700 hover:text-red-700">
              Messages{unreadCount > 0 && <span className="ml-1.5 bg-red-600 text-white text-xs rounded-full px-1.5 py-0.5 font-bold">{unreadCount}</span>}
            </Link>
          )}
          {user ? (
            <>
              <Link to="/create-listing" onClick={() => setMenuOpen(false)}
                className="block py-2.5 text-sm font-medium text-red-700 hover:text-red-800">
                {isLandlord ? '+ Post Listing' : '+ Post Sublease'}
              </Link>
              <Link to="/profile" onClick={() => setMenuOpen(false)}
                className="block py-2.5 text-sm font-medium text-gray-700 hover:text-red-700">
                Profile
              </Link>
              <button onClick={handleSignOut}
                className="block w-full text-left py-2.5 text-sm text-gray-400 hover:text-gray-600">
                Sign Out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" onClick={() => setMenuOpen(false)}
                className="block py-2.5 text-sm font-medium text-gray-700 hover:text-red-700">
                Log In
              </Link>
              <Link to="/signup" onClick={() => setMenuOpen(false)}
                className="block py-2.5 text-sm font-medium text-red-700 hover:text-red-800">
                Sign Up
              </Link>
            </>
          )}
        </div>
      )}
    </nav>
  )
}
