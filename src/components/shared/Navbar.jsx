import { Link, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'

export default function Navbar() {
  const { user, signOut, isLandlord } = useAuth()
  const userId = user?.id
  const navigate = useNavigate()
  const [unreadCount, setUnreadCount] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (!userId) { setUnreadCount(0); return }
    const fetchUnread = () => {
      supabase
        .from('conversations')
        .select('renter_id, landlord_id, renter_unread, landlord_unread')
        .or(`renter_id.eq.${userId},landlord_id.eq.${userId}`)
        .then(({ data, error }) => {
          if (error) { console.error('Navbar: failed to fetch unread counts', error); return }
          if (!data) return
          const total = data.reduce((sum, c) =>
            sum + (userId === c.renter_id ? (c.renter_unread || 0) : (c.landlord_unread || 0)), 0)
          setUnreadCount(total)
        })
    }
    fetchUnread()
    const interval = setInterval(fetchUnread, 30000)
    return () => clearInterval(interval)
  }, [userId])

  useEffect(() => { setMenuOpen(false) }, [navigate])

  const handleSignOut = async () => {
    setMenuOpen(false)
    await signOut()
    navigate('/')
  }

  return (
    <nav className="bg-white border-b border-hairline sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">

        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 flex-shrink-0 group">
          <span className="text-xl leading-none">🍁</span>
          <span className="text-[15px] font-semibold text-ink tracking-tight">
            MapleNest
          </span>
          <span className="hidden sm:block text-xs text-stone font-normal">PEI</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1">
          <Link to="/listings"
            className="px-3 py-1.5 text-sm text-steel hover:text-ink hover:bg-surface rounded-lg transition-colors">
            Browse
          </Link>
          <Link to="/analytics"
            className="px-3 py-1.5 text-sm text-steel hover:text-ink hover:bg-surface rounded-lg transition-colors">
            Analytics
          </Link>
          {user && (
            <Link to="/messages"
              className="relative px-3 py-1.5 text-sm text-steel hover:text-ink hover:bg-surface rounded-lg transition-colors">
              Messages
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 bg-maple-red text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold leading-none">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Link>
          )}
        </div>

        {/* Right actions */}
        <div className="hidden md:flex items-center gap-2">
          {user ? (
            <>
              <Link to="/create-listing"
                className="bg-maple-red text-white px-4 py-1.5 rounded-full text-sm font-medium hover:bg-maple-dark transition-colors">
                {isLandlord ? '+ List' : '+ Sublease'}
              </Link>
              <Link to="/profile"
                className="w-8 h-8 rounded-full bg-surface border border-hairline flex items-center justify-center text-sm text-charcoal hover:border-steel transition-colors"
                title="Profile">
                {user.email?.[0]?.toUpperCase() ?? '?'}
              </Link>
              <button onClick={handleSignOut}
                className="px-3 py-1.5 text-xs text-stone hover:text-steel transition-colors">
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link to="/login"
                className="px-3 py-1.5 text-sm text-steel hover:text-ink transition-colors">
                Log in
              </Link>
              <Link to="/signup"
                className="bg-maple-red text-white px-4 py-1.5 rounded-full text-sm font-medium hover:bg-maple-dark transition-colors">
                Sign up
              </Link>
            </>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden relative w-9 h-9 flex items-center justify-center rounded-lg hover:bg-surface transition-colors"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          <svg className="w-5 h-5 text-charcoal" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            {menuOpen
              ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              : <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M3 12h18M3 18h18" />
            }
          </svg>
          {!menuOpen && unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 bg-maple-red w-2 h-2 rounded-full" />
          )}
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-hairline bg-white px-4 py-3 space-y-0.5">
          <Link to="/listings" onClick={() => setMenuOpen(false)}
            className="flex items-center py-2.5 text-sm text-charcoal hover:text-maple-red transition-colors">
            Browse Listings
          </Link>
          <Link to="/analytics" onClick={() => setMenuOpen(false)}
            className="flex items-center py-2.5 text-sm text-charcoal hover:text-maple-red transition-colors">
            Analytics
          </Link>
          {user && (
            <Link to="/messages" onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2 py-2.5 text-sm text-charcoal hover:text-maple-red transition-colors">
              Messages
              {unreadCount > 0 && (
                <span className="bg-maple-red text-white text-xs rounded-full px-1.5 py-0.5 font-bold leading-none">
                  {unreadCount}
                </span>
              )}
            </Link>
          )}
          <div className="pt-1 pb-0.5 border-t border-hairline-soft mt-1">
            {user ? (
              <>
                <Link to="/create-listing" onClick={() => setMenuOpen(false)}
                  className="flex items-center py-2.5 text-sm font-medium text-maple-red hover:text-maple-dark transition-colors">
                  {isLandlord ? '+ Post Listing' : '+ Post Sublease'}
                </Link>
                <Link to="/profile" onClick={() => setMenuOpen(false)}
                  className="flex items-center py-2.5 text-sm text-charcoal hover:text-maple-red transition-colors">
                  Profile
                </Link>
                <button onClick={handleSignOut}
                  className="flex items-center py-2.5 text-sm text-stone hover:text-steel transition-colors w-full">
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link to="/login" onClick={() => setMenuOpen(false)}
                  className="flex items-center py-2.5 text-sm text-charcoal hover:text-maple-red transition-colors">
                  Log in
                </Link>
                <Link to="/signup" onClick={() => setMenuOpen(false)}
                  className="flex items-center py-2.5 text-sm font-medium text-maple-red hover:text-maple-dark transition-colors">
                  Sign up free
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  )
}
