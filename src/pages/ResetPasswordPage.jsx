import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)
  const [validSession, setValidSession] = useState(false)
  const [linkExpired, setLinkExpired] = useState(false)
  const validSessionRef = useRef(false)
  const navigate = useNavigate()

  useEffect(() => {
    // Supabase puts the access token in the URL hash when user clicks the email link
    // onAuthStateChange fires with PASSWORD_RECOVERY event when the token is valid.
    // If we don't see that event within 5s, treat the link as expired/invalid
    // instead of leaving the user on the "Verifying..." screen forever.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        validSessionRef.current = true
        setValidSession(true)
      }
    })

    const timeout = setTimeout(() => {
      if (!validSessionRef.current) setLinkExpired(true)
    }, 5000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (error) {
      setError(error.message)
    } else {
      setDone(true)
      setTimeout(() => navigate('/login'), 3000)
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="font-serif font-light text-3xl text-ink mb-3">Password updated!</h2>
          <p className="text-sm text-steel leading-relaxed mb-4">
            Your password has been changed successfully. Redirecting you to login...
          </p>
          <Link to="/login" className="text-[11px] tracking-widest uppercase text-maple hover:text-maple-dark transition-colors">
            Go to login now
          </Link>
        </div>
      </div>
    )
  }

  if (!validSession) {
    if (linkExpired) {
      return (
        <div className="min-h-screen bg-canvas flex items-center justify-center px-4">
          <div className="text-center max-w-sm">
            <div className="text-5xl mb-4">⚠️</div>
            <h2 className="font-serif font-light text-3xl text-ink mb-3">Reset link expired or invalid</h2>
            <p className="text-sm text-steel leading-relaxed mb-4">
              We couldn&apos;t verify your reset link. It may have expired or already been used.
            </p>
            <Link to="/forgot-password" className="text-[11px] tracking-widest uppercase text-maple hover:text-maple-dark transition-colors">
              Request a new reset link
            </Link>
          </div>
        </div>
      )
    }

    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">⏳</div>
          <h2 className="font-serif font-light text-3xl text-ink mb-3">Verifying your link...</h2>
          <p className="text-sm text-steel">
            If this takes too long, your reset link may have expired.{' '}
            <Link to="/forgot-password" className="text-maple hover:text-maple-dark transition-colors">Request a new one</Link>.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="text-4xl">🍁</span>
          <h1 className="font-serif font-light text-3xl text-ink mt-5 mb-2">Set a new password</h1>
          <p className="text-sm text-steel">Choose a strong password for your account</p>
        </div>

        <div>
          {error && (
            <div className="bg-maple-light border border-maple-muted text-maple-dark text-sm px-4 py-3 mb-6">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-[10px] tracking-widest uppercase text-stone mb-1">New Password</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Min. 6 characters"
                className="w-full bg-transparent border-b border-hairline py-3 text-sm text-charcoal placeholder:text-stone focus:outline-none focus:border-maple transition-colors font-light"
              />
            </div>

            <div>
              <label className="block text-[10px] tracking-widest uppercase text-stone mb-1">Confirm Password</label>
              <input
                type="password"
                required
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Repeat your new password"
                className="w-full bg-transparent border-b border-hairline py-3 text-sm text-charcoal placeholder:text-stone focus:outline-none focus:border-maple transition-colors font-light"
              />
              {confirm && password !== confirm && (
                <p className="text-xs text-maple-dark mt-1">Passwords don&apos;t match</p>
              )}
              {confirm && password === confirm && confirm.length >= 6 && (
                <p className="text-xs text-steel mt-1">✓ Passwords match</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || password !== confirm || password.length < 6}
              className="w-full bg-ink text-canvas text-[11px] tracking-widest uppercase py-4 hover:bg-maple transition-colors duration-200 disabled:opacity-40">
              {loading ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
