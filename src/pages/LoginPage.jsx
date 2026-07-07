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

        {/* Header */}
        <div className="text-center mb-10">
          <Link to="/" className="font-serif text-lg tracking-widest uppercase text-ink">
            Maple<span className="text-maple">·</span>Nest
          </Link>
          <h1 className="font-serif font-light text-3xl text-ink mt-5 mb-2">Welcome back</h1>
          <p className="text-sm text-steel">Sign in to your MapleNest account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-maple-light border border-maple-muted text-maple-dark text-sm px-4 py-3">
              {error}
            </div>
          )}

          <div className="space-y-1">
            <label className="block text-[10px] tracking-widest uppercase text-stone">Email</label>
            <input
              type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full bg-transparent border-b border-hairline py-3 text-sm text-charcoal placeholder:text-stone focus:outline-none focus:border-maple transition-colors font-light"
              placeholder="you@example.com"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[10px] tracking-widest uppercase text-stone">Password</label>
            <input
              type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)}
              className="w-full bg-transparent border-b border-hairline py-3 text-sm text-charcoal placeholder:text-stone focus:outline-none focus:border-maple transition-colors font-light"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit" disabled={loading}
            className="w-full bg-ink text-canvas text-[11px] tracking-widest uppercase py-4 hover:bg-maple transition-colors duration-200 disabled:opacity-40 mt-2"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="flex items-center justify-between mt-6 pt-6 border-t border-hairline">
          <p className="text-xs text-steel">
            No account?{' '}
            <Link to="/signup" className="text-maple hover:text-maple-dark transition-colors">Sign up free</Link>
          </p>
          <Link to="/forgot-password" className="text-[10px] tracking-widest uppercase text-stone hover:text-steel transition-colors">
            Forgot password?
          </Link>
        </div>
      </div>
    </div>
  )
}
