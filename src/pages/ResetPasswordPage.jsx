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
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Password updated!</h2>
          <p className="text-gray-500 text-sm mb-4">
            Your password has been changed successfully. Redirecting you to login...
          </p>
          <Link to="/login" className="text-red-700 text-sm font-medium hover:underline">
            Go to login now
          </Link>
        </div>
      </div>
    )
  }

  if (!validSession) {
    if (linkExpired) {
      return (
        <div className="min-h-screen flex items-center justify-center px-4">
          <div className="text-center max-w-sm">
            <div className="text-5xl mb-4">⚠️</div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">Reset link expired or invalid</h2>
            <p className="text-gray-500 text-sm mb-4">
              We couldn&apos;t verify your reset link. It may have expired or already been used.
            </p>
            <Link to="/forgot-password" className="text-red-700 text-sm font-medium hover:underline">
              Request a new reset link
            </Link>
          </div>
        </div>
      )
    }

    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">⏳</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Verifying your link...</h2>
          <p className="text-gray-500 text-sm">
            If this takes too long, your reset link may have expired.{' '}
            <Link to="/forgot-password" className="text-red-700 hover:underline">Request a new one</Link>.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <span className="text-4xl">🍁</span>
          <h1 className="text-2xl font-bold text-gray-800 mt-2">Set a new password</h1>
          <p className="text-gray-500 text-sm mt-1">Choose a strong password for your account</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Min. 6 characters"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
              <input
                type="password"
                required
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Repeat your new password"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
              />
              {confirm && password !== confirm && (
                <p className="text-xs text-red-600 mt-1">Passwords don&apos;t match</p>
              )}
              {confirm && password === confirm && confirm.length >= 6 && (
                <p className="text-xs text-green-600 mt-1">✓ Passwords match</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || password !== confirm || password.length < 6}
              className="w-full bg-red-700 text-white py-2.5 rounded-lg font-semibold text-sm hover:bg-red-800 transition disabled:opacity-50">
              {loading ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
