import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'

export default function Navbar() {
  const { user, signOut, isLandlord } = useAuth()
  const userId = user?.id
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [unreadCount, setUnreadCount] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!userId) { setUnreadCount(0); return }
    // Single cheap aggregate on the server (B10) instead of pulling every
    // conversation row and summing client-side.
    const fetchUnread = () => {
      supabase.rpc('user_unread_total').then(({ data, error }) => {
        if (error) { console.error('Navbar: failed to fetch unread total', error); return }
        setUnreadCount(data ?? 0)
      })
    }
    fetchUnread()
    const interval = setInterval(fetchUnread, 30000)
    const onFocus = () => fetchUnread()
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(interval); window.removeEventListener('focus', onFocus) }
  }, [userId, pathname])

  // Close the mobile menu whenever the route actually changes (B9) —
  // `navigate` is a stable reference, so depending on it never re-fires.
  useEffect(() => { setMenuOpen(false) }, [pathname])

  const handleSignOut = async () => {
    setMenuOpen(false)
    await signOut()
    navigate('/')
  }

  return (
    <nav
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-canvas/90 backdrop-blur-md border-b border-hairline'
          : 'bg-canvas/80 backdrop-blur-sm border-b border-transparent'
      }`}
    >
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">

        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 flex-shrink-0 group">
          <span className="font-serif text-xl font-light tracking-widest text-ink uppercase">
            Maple<span className="text-maple">·</span>Nest
          </span>
          <span className="hidden sm:block text-[10px] tracking-widest uppercase text-stone font-normal mt-0.5">
            PEI
          </span>
        </Link>

        {/* Desktop nav links */}
        <div className="hidden md:flex items-center gap-8">
          {[
            { to: '/listings', label: 'Browse' },
            { to: '/analytics', label: 'Analytics' },
            ...(user ? [{ to: '/messages', label: 'Messages', badge: unreadCount }] : []),
          ].map(({ to, label, badge }) => (
            <Link
              key={to}
              to={to}
              className="relative text-[11px] tracking-widest uppercase text-steel hover:text-ink transition-colors duration-200"
            >
              {label}
              {badge > 0 && (
                <span className="absolute -top-2 -right-3 bg-maple text-white text-[9px] rounded-full w-3.5 h-3.5 flex items-center justify-center font-medium leading-none">
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </Link>
          ))}
        </div>

        {/* Right actions */}
        <div className="hidden md:flex items-center gap-4">
          {user ? (
            <>
              <Link
                to="/create-listing"
                className="text-[11px] tracking-widest uppercase bg-ink text-canvas px-5 py-2 hover:bg-maple transition-colors duration-200"
              >
                {isLandlord ? '+ List' : '+ Sublease'}
              </Link>
              <Link
                to="/profile"
                className="w-8 h-8 flex items-center justify-center border border-hairline text-xs text-charcoal hover:border-maple hover:text-maple transition-colors"
                title="Profile"
              >
                {user.email?.[0]?.toUpperCase() ?? '?'}
              </Link>
              <button
                onClick={handleSignOut}
                className="text-[10px] tracking-widest uppercase text-stone hover:text-steel transition-colors"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="text-[11px] tracking-widest uppercase text-steel hover:text-ink transition-colors"
              >
                Log in
              </Link>
              <Link
                to="/signup"
                className="text-[11px] tracking-widest uppercase bg-ink text-canvas px-5 py-2 hover:bg-maple transition-colors duration-200"
              >
                Sign up
              </Link>
            </>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden relative w-9 h-9 flex items-center justify-center hover:bg-surface transition-colors"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          <svg className="w-4 h-4 text-ink" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            {menuOpen
              ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              : <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M3 12h18M3 18h18" />
            }
          </svg>
          {!menuOpen && unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 bg-maple w-1.5 h-1.5 rounded-full" />
          )}
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-hairline bg-canvas px-6 py-4 space-y-1">
          {[
            { to: '/listings', label: 'Browse Listings' },
            { to: '/analytics', label: 'Analytics' },
          ].map(({ to, label }) => (
            <Link key={to} to={to} onClick={() => setMenuOpen(false)}
              className="flex items-center py-2.5 text-sm text-charcoal hover:text-maple transition-colors">
              {label}
            </Link>
          ))}
          {user && (
            <Link to="/messages" onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2 py-2.5 text-sm text-charcoal hover:text-maple transition-colors">
              Messages
              {unreadCount > 0 && (
                <span className="bg-maple text-white text-xs rounded-full px-1.5 py-0.5 font-medium leading-none">
                  {unreadCount}
                </span>
              )}
            </Link>
          )}
          <div className="pt-3 pb-1 border-t border-hairline-soft mt-2">
            {user ? (
              <>
                <Link to="/create-listing" onClick={() => setMenuOpen(false)}
                  className="flex items-center py-2.5 text-sm font-medium text-maple hover:text-maple-dark transition-colors">
                  {isLandlord ? '+ Post Listing' : '+ Post Sublease'}
                </Link>
                <Link to="/profile" onClick={() => setMenuOpen(false)}
                  className="flex items-center py-2.5 text-sm text-charcoal hover:text-maple transition-colors">
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
                  className="flex items-center py-2.5 text-sm text-charcoal hover:text-maple transition-colors">
                  Log in
                </Link>
                <Link to="/signup" onClick={() => setMenuOpen(false)}
                  className="flex items-center py-2.5 text-sm font-medium text-maple hover:text-maple-dark transition-colors">
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
