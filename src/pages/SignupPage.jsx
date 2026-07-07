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
          <div className="text-5xl mb-6">📬</div>
          <h2 className="font-serif font-light text-3xl text-ink mb-3">Check your email!</h2>
          <p className="text-sm text-steel leading-relaxed">
            We sent a verification link to <strong className="text-charcoal font-medium">{email}</strong>.
            Click it to activate your account.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">

        {/* Header */}
        <div className="text-center mb-10">
          <Link to="/" className="font-serif text-lg tracking-widest uppercase text-ink">
            Maple<span className="text-maple">·</span>Nest
          </Link>
          <h1 className="font-serif font-light text-3xl text-ink mt-5 mb-2">Join MapleNest</h1>
          <p className="text-sm text-steel">Find or list housing in PEI — free forever</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-maple-light border border-maple-muted text-maple-dark text-sm px-4 py-3" role="alert">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-[10px] tracking-widest uppercase text-stone">I am a...</label>
            <div className="grid grid-cols-2 gap-2">
              {['renter', 'landlord'].map(r => (
                <button key={r} type="button" onClick={() => setRole(r)}
                  aria-pressed={role === r}
                  className={`py-3 border text-[11px] tracking-widest uppercase transition-colors ${
                    role === r
                      ? 'bg-maple text-white border-maple'
                      : 'border-hairline text-steel hover:border-maple hover:text-charcoal'
                  }`}>
                  {r}
                </button>
              ))}
            </div>
          </div>

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
              type="password" required minLength={6} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)}
              className="w-full bg-transparent border-b border-hairline py-3 text-sm text-charcoal placeholder:text-stone focus:outline-none focus:border-maple transition-colors font-light"
              placeholder="Min. 6 characters"
            />
          </div>

          <button
            type="submit" disabled={loading}
            className="w-full bg-ink text-canvas text-[11px] tracking-widest uppercase py-4 hover:bg-maple transition-colors duration-200 disabled:opacity-40 mt-2"
          >
            {loading ? 'Creating account...' : 'Create Free Account'}
          </button>

          <p className="text-xs text-stone text-center">
            By signing up, you agree to our community guidelines and terms.
          </p>
        </form>

        <p className="text-center text-xs text-steel mt-6 pt-6 border-t border-hairline">
          Already have an account?{' '}
          <Link to="/login" className="text-maple hover:text-maple-dark transition-colors">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
