import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

export default function Navbar() {
  const { user, signOut, isLandlord } = useAuth()
  const navigate = useNavigate()

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
