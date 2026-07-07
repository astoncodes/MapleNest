import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (error) {
        setError(error.message)
      } else {
        setSent(true)
      }
    } catch (err) {
      setError(err?.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-6">📬</div>
          <h2 className="font-serif font-light text-3xl text-ink mb-3">Check your email</h2>
          <p className="text-sm text-steel leading-relaxed mb-4">
            We sent a password reset link to <strong className="text-charcoal font-medium">{email}</strong>.
            Click the link in the email to set a new password.
          </p>
          <p className="text-xs text-stone mb-6">Didn&apos;t get it? Check your spam folder.</p>
          <button onClick={() => setSent(false)}
            className="text-[11px] tracking-widest uppercase text-maple hover:text-maple-dark transition-colors">
            Try a different email
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <Link to="/" className="font-serif text-lg tracking-widest uppercase text-ink">
            Maple<span className="text-maple">·</span>Nest
          </Link>
          <h1 className="font-serif font-light text-3xl text-ink mt-5 mb-2">Forgot your password?</h1>
          <p className="text-sm text-steel">
            Enter your email and we&apos;ll send you a reset link
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-maple-light border border-maple-muted text-maple-dark text-sm px-4 py-3" role="alert">
              {error}
            </div>
          )}

          <div className="space-y-1">
            <label className="block text-[10px] tracking-widest uppercase text-stone">Email address</label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full bg-transparent border-b border-hairline py-3 text-sm text-charcoal placeholder:text-stone focus:outline-none focus:border-maple transition-colors font-light"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-ink text-canvas text-[11px] tracking-widest uppercase py-4 hover:bg-maple transition-colors duration-200 disabled:opacity-40 mt-2">
            {loading ? 'Sending...' : 'Send Reset Link'}
          </button>
        </form>

        <p className="text-center text-xs text-steel mt-6 pt-6 border-t border-hairline">
          Remember your password?{' '}
          <Link to="/login" className="text-maple hover:text-maple-dark transition-colors">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
