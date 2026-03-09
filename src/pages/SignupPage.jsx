import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function SignupPage() {
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
    const { error } = await signUp(email, password, role)
    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      setSuccess(true)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">📬</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Check your email!</h2>
          <p className="text-gray-500 text-sm">We sent a verification link to <strong>{email}</strong>. Click it to activate your account.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <span className="text-4xl">🍁</span>
          <h1 className="text-2xl font-bold text-gray-800 mt-2">Join MapleNest</h1>
          <p className="text-gray-500 text-sm mt-1">Find or list housing in PEI — free forever</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">I am a...</label>
            <div className="grid grid-cols-2 gap-2">
              {['renter', 'landlord'].map(r => (
                <button key={r} type="button" onClick={() => setRole(r)}
                  className={`py-2 rounded-lg border text-sm font-medium capitalize transition ${
                    role === r ? 'bg-red-700 text-white border-red-700' : 'border-gray-300 text-gray-600 hover:border-red-300'
                  }`}>
                  {r === 'renter' ? '🏠 Renter' : '🔑 Landlord'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
              placeholder="you@example.com" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
              placeholder="Min. 6 characters" />
          </div>
          <button type="submit" disabled={loading}
            className="w-full bg-red-700 text-white py-2.5 rounded-lg font-semibold text-sm hover:bg-red-800 transition disabled:opacity-50">
            {loading ? 'Creating account...' : 'Create Free Account'}
          </button>
          <p className="text-xs text-gray-400 text-center">By signing up, you agree to our community guidelines and terms.</p>
        </form>
        <p className="text-center text-sm text-gray-500 mt-4">
          Already have an account?{' '}
          <Link to="/login" className="text-red-700 font-medium hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
