import { useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

// ── Star rating display ──────────────────────────────────────────────────────
function StarRating({ rating, max = 5, size = 'sm' }) {
  const sz = size === 'lg' ? 'text-xl' : 'text-sm'
  return (
    <span className={`inline-flex gap-0.5 ${sz}`}>
      {Array.from({ length: max }).map((_, i) => (
        <span key={i} className={i < Math.round(rating) ? 'text-amber-400' : 'text-gray-200'}>★</span>
      ))}
    </span>
  )
}

// ── Interactive star picker ──────────────────────────────────────────────────
function StarPicker({ value, onChange }) {
  const [hover, setHover] = useState(0)
  return (
    <span className="inline-flex gap-1">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button"
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(n)}
          className="text-2xl transition-transform hover:scale-110 focus:outline-none">
          <span className={(hover || value) >= n ? 'text-amber-400' : 'text-gray-200'}>★</span>
        </button>
      ))}
    </span>
  )
}

// ── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ profile, size = 'md' }) {
  const sizes = { sm: 'w-10 h-10 text-base', md: 'w-16 h-16 text-2xl', lg: 'w-24 h-24 text-4xl' }
  if (profile?.avatar_url) {
    return <img src={profile.avatar_url} alt={profile.full_name}
      className={`${sizes[size]} rounded-full object-cover ring-2 ring-white shadow`} />
  }
  const initials = (profile?.full_name || profile?.email || '?').charAt(0).toUpperCase()
  return (
    <div className={`${sizes[size]} rounded-full bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center font-bold text-white ring-2 ring-white shadow`}>
      {initials}
    </div>
  )
}

// ── Badge ────────────────────────────────────────────────────────────────────
function VerifiedBadge({ label }) {
  return (
    <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 text-xs font-medium px-2 py-0.5 rounded-full border border-green-200">
      <span>✓</span>{label}
    </span>
  )
}

// ── Section wrapper ──────────────────────────────────────────────────────────
function Section({ title, children, action }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
        <h2 className="font-semibold text-gray-800">{title}</h2>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────
export default function ProfilePage() {
  const { id: paramId } = useParams()          // /profile/:id for public view
  const { user } = useAuth()
  const navigate = useNavigate()

  const viewingId = paramId || user?.id
  const isOwn = !paramId || paramId === user?.id

  const [profile, setProfile] = useState(null)
  const [listings, setListings] = useState([])
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('overview')   // overview | listings | reviews | settings

  // Edit state
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Password change state
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' })
  const [pwLoading, setPwLoading] = useState(false)
  const [pwError, setPwError] = useState(null)
  const [pwSuccess, setPwSuccess] = useState(false)

  // Avatar upload
  const [avatarUploading, setAvatarUploading] = useState(false)

  // Leave review state
  const [reviewForm, setReviewForm] = useState({ rating: 0, comment: '' })
  const [reviewLoading, setReviewLoading] = useState(false)
  const [reviewError, setReviewError] = useState(null)
  const [reviewSuccess, setReviewSuccess] = useState(false)
  const [hasReviewed, setHasReviewed] = useState(false)

  useEffect(() => {
    if (!viewingId) return
    fetchAll()
  }, [viewingId])

  const fetchAll = async () => {
    setLoading(true)
    const [{ data: prof }, { data: listData }, { data: revData }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', viewingId).single(),
      supabase.from('listings').select('id, title, city, property_type, status, price, created_at, listing_images(url, is_primary)')
        .eq('landlord_id', viewingId).eq('status', 'active').order('created_at', { ascending: false }),
      supabase.from('reviews').select('*, reviewer:reviewer_id(full_name, avatar_url, email)')
        .eq('reviewee_id', viewingId).order('created_at', { ascending: false }),
    ])
    if (prof) { setProfile(prof); setEditForm({ full_name: prof.full_name || '', phone: prof.phone || '', bio: prof.bio || '' }) }
    setListings(listData || [])
    setReviews(revData || [])
    if (user && revData) {
      setHasReviewed(revData.some(r => r.reviewer_id === user.id))
    }
    setLoading(false)
  }

  // ── Save profile edits ───────────────────────────────────────────────────
  const handleSaveProfile = async () => {
    setSaving(true); setSaveError(null); setSaveSuccess(false)
    const { error } = await supabase.from('profiles').update({
      full_name: editForm.full_name,
      phone: editForm.phone,
      bio: editForm.bio,
    }).eq('id', user.id)
    setSaving(false)
    if (error) { setSaveError(error.message) } else {
      setSaveSuccess(true); setEditing(false)
      setProfile(prev => ({ ...prev, ...editForm }))
      setTimeout(() => setSaveSuccess(false), 3000)
    }
  }

  // ── Avatar upload ────────────────────────────────────────────────────────
  const handleAvatarUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setAvatarUploading(true)
    const ext = file.name.split('.').pop()
    const path = `avatars/${user.id}.${ext}`
    await supabase.storage.from('listing-images').upload(path, file, { upsert: true })
    const { data } = supabase.storage.from('listing-images').getPublicUrl(path)
    await supabase.from('profiles').update({ avatar_url: data.publicUrl }).eq('id', user.id)
    setProfile(prev => ({ ...prev, avatar_url: data.publicUrl }))
    setAvatarUploading(false)
  }

  // ── Password change ──────────────────────────────────────────────────────
  const handlePasswordChange = async (e) => {
    e.preventDefault()
    setPwError(null); setPwSuccess(false)
    if (pwForm.next.length < 6) { setPwError('Password must be at least 6 characters.'); return }
    if (pwForm.next !== pwForm.confirm) { setPwError('Passwords do not match.'); return }
    setPwLoading(true)
    const { error } = await supabase.auth.updateUser({ password: pwForm.next })
    setPwLoading(false)
    if (error) { setPwError(error.message) } else {
      setPwSuccess(true); setPwForm({ current: '', next: '', confirm: '' })
      setTimeout(() => setPwSuccess(false), 4000)
    }
  }

  // ── Submit review ────────────────────────────────────────────────────────
  const handleSubmitReview = async (e) => {
    e.preventDefault()
    if (!reviewForm.rating) { setReviewError('Please select a star rating.'); return }
    setReviewLoading(true); setReviewError(null)
    const { error } = await supabase.from('reviews').insert({
      reviewer_id: user.id,
      reviewee_id: viewingId,
      rating: reviewForm.rating,
      comment: reviewForm.comment,
    })
    setReviewLoading(false)
    if (error) { setReviewError(error.message) } else {
      setReviewSuccess(true); setHasReviewed(true)
      setReviewForm({ rating: 0, comment: '' })
      fetchAll()
    }
  }

  if (loading) return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="animate-pulse space-y-4">
        <div className="h-32 bg-gray-100 rounded-xl" />
        <div className="h-64 bg-gray-100 rounded-xl" />
      </div>
    </div>
  )

  if (!profile) return (
    <div className="max-w-4xl mx-auto px-4 py-12 text-center text-gray-500">
      Profile not found. <Link to="/" className="text-red-700 hover:underline">Go home</Link>
    </div>
  )

  const avgRating = reviews.length ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) : 0
  const isLandlord = profile.role === 'landlord'

  const TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'listings', label: `Listings (${listings.length})`, show: isLandlord },
    { key: 'reviews', label: `Reviews (${reviews.length})` },
    ...(isOwn ? [{ key: 'settings', label: '⚙️ Settings' }] : []),
  ].filter(t => t.show !== false)

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">

      {/* ── Profile hero ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Banner */}
        <div className="h-20 bg-gradient-to-r from-red-700 to-red-900" />

        <div className="px-6 pb-6">
          <div className="flex items-end justify-between -mt-10 mb-4 flex-wrap gap-3">
            {/* Avatar + upload */}
            <div className="relative">
              <Avatar profile={profile} size="lg" />
              {isOwn && (
                <label className="absolute bottom-0 right-0 bg-white rounded-full p-1 shadow cursor-pointer border border-gray-200 hover:bg-gray-50">
                  <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                  <span className="text-xs">{avatarUploading ? '⏳' : '📷'}</span>
                </label>
              )}
            </div>

            {isOwn && !editing && (
              <button onClick={() => setEditing(true)}
                className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50 transition">
                Edit Profile
              </button>
            )}
          </div>

          {/* Name & role */}
          {editing ? (
            <div className="space-y-3 max-w-md">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Full Name</label>
                <input value={editForm.full_name} onChange={e => setEditForm(p => ({ ...p, full_name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Phone</label>
                <input value={editForm.phone} onChange={e => setEditForm(p => ({ ...p, phone: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                  placeholder="+1 (902) 555-0100" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Bio</label>
                <textarea value={editForm.bio} rows={3} onChange={e => setEditForm(p => ({ ...p, bio: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                  placeholder="Tell renters or landlords a bit about yourself..." />
              </div>
              {saveError && <p className="text-xs text-red-600">{saveError}</p>}
              <div className="flex gap-2">
                <button onClick={handleSaveProfile} disabled={saving}
                  className="px-4 py-2 bg-red-700 text-white text-sm font-medium rounded-lg hover:bg-red-800 transition disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
                <button onClick={() => setEditing(false)}
                  className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-bold text-gray-900">{profile.full_name || 'Anonymous'}</h1>
              <p className="text-sm text-gray-500">{profile.email}</p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${isLandlord ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
                  {isLandlord ? '🏠 Landlord' : '🔍 Renter'}
                </span>
                {profile.email_verified && <VerifiedBadge label="Email" />}
                {profile.phone_verified && <VerifiedBadge label="Phone" />}
                {profile.id_verified && <VerifiedBadge label="ID" />}
              </div>
              {profile.bio && <p className="text-sm text-gray-600 mt-3 max-w-xl leading-relaxed">{profile.bio}</p>}
              {reviews.length > 0 && (
                <div className="flex items-center gap-2 mt-3">
                  <StarRating rating={avgRating} size="lg" />
                  <span className="text-sm font-semibold text-gray-800">{avgRating.toFixed(1)}</span>
                  <span className="text-sm text-gray-400">({reviews.length} review{reviews.length !== 1 ? 's' : ''})</span>
                </div>
              )}
            </>
          )}

          {saveSuccess && <p className="text-xs text-green-600 mt-2">✓ Profile updated successfully</p>}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Overview tab ── */}
      {tab === 'overview' && (
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            { label: 'Member since', value: new Date(profile.created_at).toLocaleDateString('en-CA', { month: 'short', year: 'numeric' }) },
            { label: 'Avg rating', value: reviews.length ? `${avgRating.toFixed(1)} / 5` : 'No reviews yet' },
            { label: isLandlord ? 'Active listings' : 'Role', value: isLandlord ? listings.length : 'Renter' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 text-center">
              <div className="text-2xl font-bold text-gray-900">{s.value}</div>
              <div className="text-xs text-gray-400 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Listings tab ── */}
      {tab === 'listings' && (
        <Section title="Active Listings"
          action={isOwn && <Link to="/create-listing" className="text-xs font-medium text-red-700 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50">+ New Listing</Link>}>
          {listings.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No active listings yet.</p>
          ) : (
            <div className="space-y-3">
              {listings.map(l => {
                const img = l.listing_images?.find(i => i.is_primary) || l.listing_images?.[0]
                return (
                  <Link key={l.id} to={`/listings/${l.id}`}
                    className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition">
                    <div className="w-14 h-14 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
                      {img ? <img src={img.url} alt="" className="w-full h-full object-cover" /> :
                        <div className="w-full h-full flex items-center justify-center text-gray-300 text-xl">🏠</div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-gray-800 truncate">{l.title}</p>
                      <p className="text-xs text-gray-500">{l.city} · {l.property_type} · ${l.price}/mo</p>
                    </div>
                    <span className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded-full">{l.status}</span>
                  </Link>
                )
              })}
            </div>
          )}
        </Section>
      )}

      {/* ── Reviews tab ── */}
      {tab === 'reviews' && (
        <div className="space-y-4">
          <Section title={`Reviews (${reviews.length})`}>
            {reviews.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No reviews yet.</p>
            ) : (
              <div className="space-y-4">
                {reviews.map(r => (
                  <div key={r.id} className="pb-4 border-b border-gray-50 last:border-0">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-500">
                        {(r.reviewer?.full_name || r.reviewer?.email || '?').charAt(0).toUpperCase()}
                      </div>
                      <span className="text-sm font-medium text-gray-700">{r.reviewer?.full_name || 'Anonymous'}</span>
                      <StarRating rating={r.rating} />
                      <span className="text-xs text-gray-400 ml-auto">{new Date(r.created_at).toLocaleDateString('en-CA')}</span>
                    </div>
                    {r.comment && <p className="text-sm text-gray-600 ml-9">{r.comment}</p>}
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Leave a review (only if not own profile and logged in) */}
          {!isOwn && user && !hasReviewed && (
            <Section title="Leave a Review">
              {reviewSuccess ? (
                <p className="text-sm text-green-600 text-center py-4">✓ Thanks for your review!</p>
              ) : (
                <form onSubmit={handleSubmitReview} className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-2">Rating</label>
                    <StarPicker value={reviewForm.rating} onChange={v => setReviewForm(p => ({ ...p, rating: v }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Comment (optional)</label>
                    <textarea rows={3} value={reviewForm.comment}
                      onChange={e => setReviewForm(p => ({ ...p, comment: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                      placeholder="Share your experience with this person..." />
                  </div>
                  {reviewError && <p className="text-xs text-red-600">{reviewError}</p>}
                  <button type="submit" disabled={reviewLoading || !reviewForm.rating}
                    className="px-5 py-2 bg-red-700 text-white text-sm font-medium rounded-lg hover:bg-red-800 transition disabled:opacity-50">
                    {reviewLoading ? 'Submitting...' : 'Submit Review'}
                  </button>
                </form>
              )}
            </Section>
          )}
        </div>
      )}

      {/* ── Settings tab (own profile only) ── */}
      {tab === 'settings' && isOwn && (
        <div className="space-y-4">

          {/* Account info */}
          <Section title="Account Information">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between py-2 border-b border-gray-50">
                <span className="text-gray-500">Email</span>
                <span className="font-medium text-gray-800">{profile.email}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-50">
                <span className="text-gray-500">Role</span>
                <span className="font-medium text-gray-800 capitalize">{profile.role}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-50">
                <span className="text-gray-500">Phone</span>
                <span className="font-medium text-gray-800">{profile.phone || '—'}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-gray-500">Joined</span>
                <span className="font-medium text-gray-800">{new Date(profile.created_at).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
              </div>
            </div>
          </Section>

          {/* Change password */}
          <Section title="Change Password">
            <form onSubmit={handlePasswordChange} className="space-y-4 max-w-sm">
              {[
                { key: 'next', label: 'New Password', placeholder: 'Min. 6 characters' },
                { key: 'confirm', label: 'Confirm New Password', placeholder: 'Repeat new password' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{f.label}</label>
                  <input type="password" value={pwForm[f.key]} placeholder={f.placeholder}
                    onChange={e => setPwForm(p => ({ ...p, [f.key]: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300" />
                  {f.key === 'confirm' && pwForm.confirm && pwForm.next !== pwForm.confirm && (
                    <p className="text-xs text-red-500 mt-1">Passwords don't match</p>
                  )}
                  {f.key === 'confirm' && pwForm.confirm && pwForm.next === pwForm.confirm && pwForm.next.length >= 6 && (
                    <p className="text-xs text-green-600 mt-1">✓ Passwords match</p>
                  )}
                </div>
              ))}
              {pwError && <p className="text-xs text-red-600">{pwError}</p>}
              {pwSuccess && <p className="text-xs text-green-600">✓ Password updated successfully!</p>}
              <button type="submit" disabled={pwLoading || pwForm.next !== pwForm.confirm || pwForm.next.length < 6}
                className="px-5 py-2.5 bg-red-700 text-white text-sm font-semibold rounded-lg hover:bg-red-800 transition disabled:opacity-50">
                {pwLoading ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          </Section>

          {/* Verification status */}
          <Section title="Verification">
            <div className="space-y-3">
              {[
                { key: 'email_verified', label: 'Email Verified', desc: 'Your email address has been confirmed' },
                { key: 'phone_verified', label: 'Phone Verified', desc: 'Add phone verification for extra trust' },
                { key: 'id_verified', label: 'ID Verified', desc: 'Government ID verification (coming soon)' },
              ].map(v => (
                <div key={v.key} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{v.label}</p>
                    <p className="text-xs text-gray-400">{v.desc}</p>
                  </div>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${profile[v.key] ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                    {profile[v.key] ? '✓ Verified' : 'Unverified'}
                  </span>
                </div>
              ))}
            </div>
          </Section>

          {/* Danger zone */}
          <Section title="Account">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-800">Sign out</p>
                <p className="text-xs text-gray-400">Sign out of your MapleNest account</p>
              </div>
              <button onClick={async () => { await supabase.auth.signOut(); navigate('/') }}
                className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50 transition">
                Sign Out
              </button>
            </div>
          </Section>
        </div>
      )}
    </div>
  )
}
