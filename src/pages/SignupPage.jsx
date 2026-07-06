import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function SignupPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('renter')
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const { signUp } = useAuth()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { data, error } = await signUp(email, password, role)
      if (error) {
        setError(error.message)
      } else if (data?.session) {
        // Supabase auto-confirm is on: the user is already signed in, so
        // "check your email" would be misleading — go straight to browsing (B34).
        navigate('/listings', { replace: true })
      } else {
        setSuccess(true)
      }
    } catch (err) {
      setError(err?.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">📬</div>
          <h2 className="text-xl font-semibold text-ink mb-2">Check your email!</h2>
          <p className="text-steel text-sm">We sent a verification link to <strong className="text-charcoal">{email}</strong>. Click it to activate your account.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="text-4xl">🍁</span>
          <h1 className="text-2xl font-semibold text-ink mt-2">Join MapleNest</h1>
          <p className="text-steel text-sm mt-1">Find or list housing in PEI — free forever</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-hairline shadow-card p-6 space-y-4">
          {error && (
            <div className="bg-maple-light border border-maple-muted text-maple-red text-sm px-4 py-3 rounded-lg">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-charcoal mb-2">I am a...</label>
            <div className="grid grid-cols-2 gap-2">
              {['renter', 'landlord'].map(r => (
                <button key={r} type="button" onClick={() => setRole(r)}
                  className={`py-2 rounded-lg border text-sm font-medium capitalize transition-colors ${
                    role === r
                      ? 'bg-maple-red text-white border-maple-red'
                      : 'border-hairline text-steel hover:border-maple-red/40 hover:text-charcoal'
                  }`}>
                  {r === 'renter' ? '🏠 Renter' : '🔑 Landlord'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1">Email</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
              className="w-full border border-hairline rounded-lg px-3 py-2.5 text-sm text-charcoal placeholder:text-stone focus:outline-none focus:ring-2 focus:ring-maple-red/20 focus:border-maple-red/40 transition"
              placeholder="you@example.com" />
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1">Password</label>
            <input type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)}
              className="w-full border border-hairline rounded-lg px-3 py-2.5 text-sm text-charcoal placeholder:text-stone focus:outline-none focus:ring-2 focus:ring-maple-red/20 focus:border-maple-red/40 transition"
              placeholder="Min. 6 characters" />
          </div>

          <button type="submit" disabled={loading}
            className="w-full bg-maple-red text-white py-2.5 rounded-lg font-medium text-sm hover:bg-maple-dark transition-colors disabled:opacity-50">
            {loading ? 'Creating account...' : 'Create Free Account'}
          </button>

          <p className="text-xs text-stone text-center">
            By signing up, you agree to our community guidelines and terms.
          </p>
        </form>

        <p className="text-center text-sm text-steel mt-5">
          Already have an account?{' '}
          <Link to="/login" className="text-maple-red font-medium hover:text-maple-dark transition-colors">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
