import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { mapSupabaseError } from '../lib/supabaseErrors'
import { useAuth } from '../hooks/useAuth'

const AVATAR_MAX_BYTES = 5 * 1024 * 1024
const AVATAR_MAX_LABEL = '5 MB'

function StarRating({ rating, max = 5 }) {
  return (
    <span className="inline-flex gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <span key={i} className={i < Math.round(rating) ? 'text-maple' : 'text-hairline'} style={{ fontSize: '14px' }}>★</span>
      ))}
    </span>
  )
}

function Avatar({ profile, size = 'md' }) {
  const sizes = { sm: 'w-10 h-10 text-base', md: 'w-16 h-16 text-2xl', lg: 'w-20 h-20 text-3xl' }
  if (profile?.avatar_url) {
    return <img src={profile.avatar_url} alt={profile.full_name} className={`${sizes[size]} object-cover`} />
  }
  const initials = (profile?.full_name || profile?.email || '?').charAt(0).toUpperCase()
  return (
    <div className={`${sizes[size]} bg-maple flex items-center justify-center font-normal text-white`}>
      {initials}
    </div>
  )
}

function VerifiedBadge({ label }) {
  return (
    <span className="inline-flex items-center gap-1 border border-hairline text-[9px] tracking-widest uppercase text-steel px-2 py-0.5">
      <span className="text-maple">✓</span> {label}
    </span>
  )
}

function Section({ title, children, action }) {
  return (
    <div className="border border-hairline bg-canvas overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-hairline">
        <span className="text-[10px] tracking-widest uppercase text-stone">{title}</span>
        {action}
      </div>
      <div className="p-6">{children}</div>
    </div>
  )
}

export default function ProfilePage() {
  const { id: paramId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const viewingId = paramId || user?.id
  const isOwn = !paramId || paramId === user?.id

  const [profile, setProfile] = useState(null)
  const [listings, setListings] = useState([])
  const [reviews, setReviews] = useState([])
  const [savedListings, setSavedListings] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('overview')

  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' })
  const [pwLoading, setPwLoading] = useState(false)
  const [pwError, setPwError] = useState(null)
  const [pwSuccess, setPwSuccess] = useState(false)

  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarError, setAvatarError] = useState(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      await supabase.rpc('expire_pending_reviews', { p_profile_id: viewingId })

      const [{ data: prof }, { data: listData }, { data: revData }, { data: savedData }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', viewingId).single(),
        supabase.from('listings').select('id, title, city, property_type, status, price, created_at, listing_images(url, is_primary)')
          .eq('landlord_id', viewingId).eq('status', 'active').order('created_at', { ascending: false }),
        supabase.from('reviews').select('*, reviewer:reviewer_id(full_name, avatar_url, email), tenancy:tenancy_id(listing:listing_id(title), unit:unit_id(unit_name))')
          .eq('reviewee_id', viewingId).eq('visible', true).order('created_at', { ascending: false }),
        isOwn
          ? supabase.from('saved_listings').select('listing_id, listings(id, title, city, property_type, price, created_at, listing_images(url, is_primary))').eq('user_id', viewingId).order('created_at', { ascending: false })
          : Promise.resolve({ data: [] }),
      ])
      if (prof) {
        setProfile(prof)
        setEditForm({ full_name: prof.full_name || '', phone: prof.phone || '', bio: prof.bio || '' })
      }
      setListings(listData || [])
      setReviews(revData || [])
      setSavedListings((savedData || []).map(r => r.listings).filter(Boolean))
    } finally {
      setLoading(false)
    }
  }, [isOwn, viewingId])

  useEffect(() => { if (viewingId) fetchAll() }, [fetchAll, viewingId])

  const handleSaveProfile = async () => {
    setSaving(true); setSaveError(null); setSaveSuccess(false)
    const { error } = await supabase.from('profiles').update({
      full_name: editForm.full_name, phone: editForm.phone, bio: editForm.bio,
    }).eq('id', user.id)
    setSaving(false)
    if (error) { setSaveError(mapSupabaseError(error, 'Could not save your profile.')) }
    else { setSaveSuccess(true); setEditing(false); setProfile(prev => ({ ...prev, ...editForm })); setTimeout(() => setSaveSuccess(false), 3000) }
  }

  const handleAvatarUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { setAvatarError('Please choose an image file.'); e.target.value = ''; return }
    if (file.size > AVATAR_MAX_BYTES) { setAvatarError(`Image must be under ${AVATAR_MAX_LABEL}.`); e.target.value = ''; return }
    setAvatarUploading(true); setAvatarError(null)
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
      const newPath = `${user.id}/${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage.from('avatars').upload(newPath, file, { cacheControl: '3600', upsert: false, contentType: file.type })
      if (uploadError) throw uploadError
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(newPath)
      const { error: updateError } = await supabase.from('profiles').update({ avatar_url: urlData.publicUrl }).eq('id', user.id)
      if (updateError) { await supabase.storage.from('avatars').remove([newPath]); throw updateError }
      const { data: existingObjects } = await supabase.storage.from('avatars').list(user.id)
      if (existingObjects?.length) {
        const stalePaths = existingObjects.map(obj => `${user.id}/${obj.name}`).filter(p => p !== newPath)
        if (stalePaths.length) await supabase.storage.from('avatars').remove(stalePaths)
      }
      setProfile(prev => ({ ...prev, avatar_url: urlData.publicUrl }))
    } catch (err) {
      setAvatarError(mapSupabaseError(err, 'Could not upload avatar.'))
    } finally { setAvatarUploading(false); e.target.value = '' }
  }

  const handlePasswordChange = async (e) => {
    e.preventDefault()
    setPwError(null); setPwSuccess(false)
    if (pwForm.next.length < 6) { setPwError('Password must be at least 6 characters.'); return }
    if (pwForm.next !== pwForm.confirm) { setPwError('Passwords do not match.'); return }
    setPwLoading(true)
    const { error } = await supabase.auth.updateUser({ password: pwForm.next })
    setPwLoading(false)
    if (error) { setPwError(mapSupabaseError(error, 'Could not update password.')) }
    else { setPwSuccess(true); setPwForm({ current: '', next: '', confirm: '' }); setTimeout(() => setPwSuccess(false), 4000) }
  }

  if (loading) return (
    <div className="max-w-4xl mx-auto px-6 py-12 animate-pulse space-y-4">
      <div className="h-36 bg-hairline" />
      <div className="h-64 bg-hairline" />
    </div>
  )

  if (!profile) return (
    <div className="max-w-4xl mx-auto px-6 py-16 text-center">
      <p className="font-serif font-normal text-xl text-ink mb-3">Profile not found</p>
      <Link to="/" className="text-[11px] tracking-widest uppercase text-maple hover:text-maple-dark">Go home →</Link>
    </div>
  )

  const avgRating = reviews.length ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) : 0
  const isLandlord = profile.role === 'landlord'

  const tagCounts = {}
  reviews.forEach(r => { (r.tags || []).forEach(tag => { tagCounts[tag] = (tagCounts[tag] || 0) + 1 }) })
  const topTags = Object.entries(tagCounts).filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, 3)

  const TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'listings', label: `Listings (${listings.length})`, show: isLandlord },
    { key: 'reviews', label: `Reviews (${reviews.length})` },
    ...(isOwn ? [
      { key: 'saved', label: `Saved (${savedListings.length})` },
      { key: 'settings', label: 'Settings' },
    ] : []),
  ].filter(t => t.show !== false)

  return (
    <div className="bg-canvas min-h-screen">

      {/* Profile hero */}
      <div className="border-b border-hairline">
        {/* Warm banner */}
        <div className="h-16 bg-surface" />

        <div className="max-w-4xl mx-auto px-6 pb-8">
          <div className="flex items-end justify-between -mt-10 mb-5 flex-wrap gap-4">
            {/* Avatar + upload */}
            <div className="relative">
              <Avatar profile={profile} size="lg" />
              {isOwn && (
                <label className="absolute bottom-0 right-0 bg-canvas border border-hairline w-6 h-6 flex items-center justify-center cursor-pointer hover:bg-surface transition-colors">
                  <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                  <span className="text-[10px]">{avatarUploading ? '…' : '+'}</span>
                </label>
              )}
            </div>
            {isOwn && !editing && (
              <button onClick={() => setEditing(true)}
                className="text-[11px] tracking-widest uppercase border border-hairline px-4 py-2 text-steel hover:text-ink hover:border-ink transition-colors">
                Edit Profile
              </button>
            )}
          </div>

          {editing ? (
            <div className="space-y-5 max-w-md">
              {[
                { key: 'full_name', label: 'Full Name', type: 'input', max: 80 },
                { key: 'phone', label: 'Phone', type: 'input', placeholder: '+1 (902) 555-0100' },
                { key: 'bio', label: 'Bio', type: 'textarea', max: 500, placeholder: 'Tell renters or landlords about yourself...' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-[10px] tracking-widest uppercase text-stone mb-2">{f.label}</label>
                  {f.type === 'textarea' ? (
                    <textarea value={editForm[f.key]} rows={3}
                      onChange={e => setEditForm(p => ({ ...p, [f.key]: e.target.value }))}
                      className="w-full bg-transparent border-b border-hairline py-2 text-sm text-charcoal placeholder:text-stone focus:outline-none focus:border-maple transition-colors resize-none font-light"
                      placeholder={f.placeholder} maxLength={f.max} />
                  ) : (
                    <input value={editForm[f.key]}
                      onChange={e => setEditForm(p => ({ ...p, [f.key]: e.target.value }))}
                      className="w-full bg-transparent border-b border-hairline py-2 text-sm text-charcoal placeholder:text-stone focus:outline-none focus:border-maple transition-colors font-light"
                      placeholder={f.placeholder} maxLength={f.max} />
                  )}
                </div>
              ))}
              {saveError && <p className="text-xs text-maple">{saveError}</p>}
              <div className="flex gap-3 pt-1">
                <button onClick={handleSaveProfile} disabled={saving}
                  className="text-[11px] tracking-widest uppercase bg-ink text-canvas px-5 py-2.5 hover:bg-maple transition-colors disabled:opacity-40">
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
                <button onClick={() => setEditing(false)}
                  className="text-[11px] tracking-widest uppercase border border-hairline px-5 py-2.5 text-steel hover:text-ink transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <h1 className="font-serif font-normal text-2xl text-ink mb-1">
                {profile.full_name || 'Anonymous'}
              </h1>
              <p className="text-sm text-stone mb-3">{profile.email}</p>
              <div className="flex items-center gap-2 flex-wrap mb-3">
                <span className={`text-[9px] tracking-widest uppercase border px-2.5 py-1 ${isLandlord ? 'border-maple text-maple' : 'border-hairline text-steel'}`}>
                  {isLandlord ? 'Landlord' : 'Renter'}
                </span>
                {profile.email_verified && <VerifiedBadge label="Email" />}
                {profile.phone_verified && <VerifiedBadge label="Phone" />}
                {profile.id_verified && <VerifiedBadge label="ID" />}
              </div>
              {profile.bio && (
                <p className="text-sm text-steel leading-relaxed max-w-xl mb-3">{profile.bio}</p>
              )}
              {reviews.length > 0 && (
                <div className="flex items-center gap-2 mb-2">
                  <StarRating rating={avgRating} />
                  <span className="font-normal text-sm text-ink">{avgRating.toFixed(1)}</span>
                  <span className="text-xs text-stone">({reviews.length} review{reviews.length !== 1 ? 's' : ''})</span>
                </div>
              )}
              {topTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {topTags.map(([tag, count]) => (
                    <span key={tag} className="border border-hairline text-[9px] tracking-widest uppercase text-steel px-2 py-0.5">
                      {tag} <span className="text-stone">({count})</span>
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
          {saveSuccess && <p className="text-xs text-maple mt-3">✓ Profile updated</p>}
          {avatarError && <p className="text-xs text-maple mt-3">{avatarError}</p>}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-hairline">
        <div className="max-w-4xl mx-auto px-6 flex gap-0 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-5 py-3.5 text-[11px] tracking-widest uppercase whitespace-nowrap flex-shrink-0 border-b-2 transition-colors ${
                tab === t.key
                  ? 'border-maple text-ink font-medium'
                  : 'border-transparent text-stone hover:text-steel'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-5">

        {/* Overview */}
        {tab === 'overview' && (
          <div className="grid sm:grid-cols-3 gap-px bg-hairline border border-hairline">
            {[
              { label: 'Member since', value: new Date(profile.created_at).toLocaleDateString('en-CA', { month: 'short', year: 'numeric' }) },
              { label: 'Avg rating', value: reviews.length ? `${avgRating.toFixed(1)} / 5` : '—' },
              { label: isLandlord ? 'Active listings' : 'Role', value: isLandlord ? listings.length : 'Renter' },
            ].map(s => (
              <div key={s.label} className="bg-canvas p-6 text-center">
                <div className="font-serif font-normal text-3xl text-maple">{s.value}</div>
                <div className="text-[10px] tracking-widest uppercase text-stone mt-2">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Listings */}
        {tab === 'listings' && (
          <Section title={`Active Listings (${listings.length})`}
            action={isOwn && (
              <Link to="/create-listing"
                className="text-[10px] tracking-widest uppercase border border-hairline text-steel hover:text-maple hover:border-maple px-3 py-1.5 transition-colors">
                + New
              </Link>
            )}>
            {listings.length === 0 ? (
              <p className="text-sm text-stone text-center py-6">No active listings yet.</p>
            ) : (
              <div className="space-y-px border border-hairline">
                {listings.map(l => {
                  const img = l.listing_images?.find(i => i.is_primary) || l.listing_images?.[0]
                  return (
                    <Link key={l.id} to={`/listings/${l.id}`}
                      className="flex items-center gap-4 p-4 bg-canvas hover:bg-surface transition-colors">
                      <div className="w-12 h-12 bg-surface overflow-hidden flex-shrink-0">
                        {img ? <img src={img.url} alt="" loading="lazy" className="w-full h-full object-cover" /> :
                          <div className="w-full h-full flex items-center justify-center text-stone text-xs">—</div>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-normal text-sm text-ink truncate">{l.title}</p>
                        <p className="text-[10px] tracking-wide uppercase text-stone mt-0.5">
                          {l.city} · {l.property_type} · ${l.price}/mo
                        </p>
                      </div>
                      <span className="text-[9px] tracking-widest uppercase border border-hairline text-maple px-2 py-1">
                        {l.status}
                      </span>
                    </Link>
                  )
                })}
              </div>
            )}
          </Section>
        )}

        {/* Reviews */}
        {tab === 'reviews' && (
          <Section title={`Reviews (${reviews.length})`}>
            {reviews.length === 0 ? (
              <p className="text-sm text-stone text-center py-6">No reviews yet.</p>
            ) : (
              <div className="space-y-6">
                {reviews.map(r => (
                  <div key={r.id} className="border-b border-hairline pb-6 last:border-0 last:pb-0">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-7 h-7 bg-maple flex items-center justify-center text-xs font-normal text-white">
                        {(r.reviewer?.full_name || r.reviewer?.email || '?').charAt(0).toUpperCase()}
                      </div>
                      <span className="text-sm font-normal text-ink">{r.reviewer?.full_name || 'Anonymous'}</span>
                      <StarRating rating={r.rating} />
                      <span className="text-[10px] tracking-wide uppercase text-stone ml-auto">
                        {new Date(r.created_at).toLocaleDateString('en-CA')}
                      </span>
                    </div>
                    {r.tenancy?.listing?.title && (
                      <p className="text-[10px] tracking-wide uppercase text-stone ml-10 mb-2">
                        {r.tenancy.listing.title}
                        {r.tenancy.unit?.unit_name ? ` · ${r.tenancy.unit.unit_name}` : ''}
                      </p>
                    )}
                    {r.tags?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 ml-10 mb-2">
                        {r.tags.map(tag => (
                          <span key={tag} className="border border-hairline text-[9px] tracking-widest uppercase text-steel px-2 py-0.5">{tag}</span>
                        ))}
                      </div>
                    )}
                    {r.comment && <p className="text-sm text-steel leading-relaxed ml-10">{r.comment}</p>}
                  </div>
                ))}
              </div>
            )}
          </Section>
        )}

        {/* Saved */}
        {tab === 'saved' && isOwn && (
          <Section title={`Saved Listings (${savedListings.length})`}>
            {savedListings.length === 0 ? (
              <p className="text-sm text-stone text-center py-6">
                No saved listings yet. Click ♡ on any listing to save it.
              </p>
            ) : (
              <div className="space-y-px border border-hairline">
                {savedListings.map(l => {
                  const img = l.listing_images?.find(i => i.is_primary) || l.listing_images?.[0]
                  return (
                    <Link key={l.id} to={`/listings/${l.id}`}
                      className="flex items-center gap-4 p-4 bg-canvas hover:bg-surface transition-colors">
                      <div className="w-12 h-12 bg-surface overflow-hidden flex-shrink-0">
                        {img ? <img src={img.url} alt={l.title} loading="lazy" className="w-full h-full object-cover" /> :
                          <div className="w-full h-full flex items-center justify-center text-stone text-xs">—</div>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-normal text-sm text-ink truncate">{l.title}</p>
                        <p className="text-[10px] tracking-wide uppercase text-stone mt-0.5">
                          {l.city} · {l.property_type} · ${Number(l.price).toLocaleString()}/mo
                        </p>
                      </div>
                      <span className="text-maple text-base">♥</span>
                    </Link>
                  )
                })}
              </div>
            )}
          </Section>
        )}

        {/* Settings */}
        {tab === 'settings' && isOwn && (
          <div className="space-y-5">

            <Section title="Account Information">
              <div className="space-y-0 divide-y divide-hairline">
                {[
                  { label: 'Email', value: profile.email },
                  { label: 'Role', value: profile.role?.charAt(0).toUpperCase() + profile.role?.slice(1) },
                  { label: 'Phone', value: profile.phone || '—' },
                  { label: 'Joined', value: new Date(profile.created_at).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' }) },
                ].map(s => (
                  <div key={s.label} className="flex justify-between py-3">
                    <span className="text-[10px] tracking-widest uppercase text-stone">{s.label}</span>
                    <span className="text-sm font-normal text-charcoal">{s.value}</span>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Change Password">
              <form onSubmit={handlePasswordChange} className="space-y-5 max-w-sm">
                {[
                  { key: 'next', label: 'New Password', placeholder: 'Min. 6 characters' },
                  { key: 'confirm', label: 'Confirm New Password', placeholder: 'Repeat new password' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="block text-[10px] tracking-widest uppercase text-stone mb-2">{f.label}</label>
                    <input type="password" value={pwForm[f.key]} placeholder={f.placeholder}
                      onChange={e => setPwForm(p => ({ ...p, [f.key]: e.target.value }))}
                      className="w-full bg-transparent border-b border-hairline py-2 text-sm text-charcoal placeholder:text-stone focus:outline-none focus:border-maple transition-colors font-light" />
                    {f.key === 'confirm' && pwForm.confirm && pwForm.next !== pwForm.confirm && (
                      <p className="text-xs text-maple mt-1">Passwords don&apos;t match</p>
                    )}
                    {f.key === 'confirm' && pwForm.confirm && pwForm.next === pwForm.confirm && pwForm.next.length >= 6 && (
                      <p className="text-xs text-steel mt-1">✓ Passwords match</p>
                    )}
                  </div>
                ))}
                {pwError && <p className="text-xs text-maple">{pwError}</p>}
                {pwSuccess && <p className="text-xs text-steel">✓ Password updated successfully</p>}
                <button type="submit"
                  disabled={pwLoading || pwForm.next !== pwForm.confirm || pwForm.next.length < 6}
                  className="text-[11px] tracking-widest uppercase bg-ink text-canvas px-6 py-2.5 hover:bg-maple transition-colors disabled:opacity-40">
                  {pwLoading ? 'Updating...' : 'Update Password'}
                </button>
              </form>
            </Section>

            <Section title="Verification">
              <div className="space-y-0 divide-y divide-hairline">
                {[
                  { key: 'email_verified', label: 'Email Verified', desc: 'Your email address has been confirmed' },
                  { key: 'phone_verified', label: 'Phone Verified', desc: 'Add phone verification for extra trust' },
                  { key: 'id_verified', label: 'ID Verified', desc: 'Government ID verification (coming soon)' },
                ].map(v => (
                  <div key={v.key} className="flex items-center justify-between py-4">
                    <div>
                      <p className="text-sm font-normal text-ink">{v.label}</p>
                      <p className="text-xs text-stone">{v.desc}</p>
                    </div>
                    <span className={`text-[9px] tracking-widest uppercase border px-2.5 py-1 ${profile[v.key] ? 'border-maple text-maple' : 'border-hairline text-stone'}`}>
                      {profile[v.key] ? '✓ Verified' : 'Unverified'}
                    </span>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Account">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-normal text-ink">Sign out</p>
                  <p className="text-xs text-stone">Sign out of your MapleNest account</p>
                </div>
                <button onClick={async () => { await supabase.auth.signOut(); navigate('/') }}
                  className="text-[11px] tracking-widest uppercase border border-hairline px-4 py-2 text-steel hover:text-ink hover:border-ink transition-colors">
                  Sign Out
                </button>
              </div>
            </Section>

          </div>
        )}
      </div>
    </div>
  )
}
