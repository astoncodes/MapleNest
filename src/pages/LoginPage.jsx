import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const { signIn } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { error } = await signIn(email, password)
      if (error) {
        setError(error.message)
      } else {
        navigate('/listings')
      }
    } catch (err) {
      setError(err?.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="text-4xl">🍁</span>
          <h1 className="text-2xl font-semibold text-ink mt-2">Welcome back</h1>
          <p className="text-steel text-sm mt-1">Sign in to your MapleNest account</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-hairline shadow-card p-6 space-y-4">
          {error && (
            <div className="bg-maple-light border border-maple-muted text-maple-red text-sm px-4 py-3 rounded-lg">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1">Email</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
              className="w-full border border-hairline rounded-lg px-3 py-2.5 text-sm text-charcoal placeholder:text-stone focus:outline-none focus:ring-2 focus:ring-maple-red/20 focus:border-maple-red/40 transition"
              placeholder="you@example.com" />
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1">Password</label>
            <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
              className="w-full border border-hairline rounded-lg px-3 py-2.5 text-sm text-charcoal placeholder:text-stone focus:outline-none focus:ring-2 focus:ring-maple-red/20 focus:border-maple-red/40 transition"
              placeholder="••••••••" />
          </div>

          <button type="submit" disabled={loading}
            className="w-full bg-maple-red text-white py-2.5 rounded-lg font-medium text-sm hover:bg-maple-dark transition-colors disabled:opacity-50">
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="flex items-center justify-between mt-5 px-1">
          <p className="text-sm text-steel">
            No account?{' '}
            <Link to="/signup" className="text-maple-red font-medium hover:text-maple-dark transition-colors">Sign up free</Link>
          </p>
          <Link to="/forgot-password" className="text-xs text-stone hover:text-steel transition-colors">
            Forgot password?
          </Link>
        </div>
      </div>
    </div>
  )
}
