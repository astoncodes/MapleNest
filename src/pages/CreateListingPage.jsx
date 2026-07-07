import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import UnitEditorModal from '../components/listings/UnitEditorModal'
import BulkAddModal from '../components/listings/BulkAddModal'

const PEI_NEIGHBOURHOODS = {
  Charlottetown: ['Downtown', 'West Royalty', 'Brighton', 'Sherwood', 'Parkdale', 'Belvedere', 'University Avenue', 'East Royalty'],
  Summerside: ['Downtown Summerside', 'Wilmot', 'Central Summerside'],
  Cornwall: ['Cornwall'],
  Stratford: ['Stratford'],
  Other: ['Other'],
}

const ALL_PROPERTY_TYPES = [
  { value: 'apartment', label: 'Apartment' },
  { value: 'house',     label: 'House' },
  { value: 'room',      label: 'Room' },
  { value: 'basement',  label: 'Basement Suite' },
  { value: 'condo',     label: 'Condo' },
  { value: 'townhouse', label: 'Townhouse' },
  { value: 'sublease',  label: 'Sublease' },
]

const RENTER_PROPERTY_TYPES = [
  { value: 'sublease', label: 'Sublease' },
]

const LEASE_TERMS = [
  { value: 'monthly',  label: 'Month-to-Month' },
  { value: '6_months', label: '6 Months' },
  { value: '1_year',   label: '1 Year' },
  { value: 'flexible', label: 'Flexible' },
]

const STEP_LABELS = { 1: 'Property', 2: 'Details', 3: 'Photos', 4: 'Units' }

export default function CreateListingPage({ mode = 'create', listing = null, onSubmitSuccess }) {
  const { user, role } = useAuth()
  const isRenter = role === 'renter'
  const PROPERTY_TYPES = isRenter ? RENTER_PROPERTY_TYPES : ALL_PROPERTY_TYPES
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [uploadProgress, setUploadProgress] = useState(null)
  const [existingImages, setExistingImages] = useState([])
  const [removedImageIds, setRemovedImageIds] = useState([])
  const [removedImagePaths, setRemovedImagePaths] = useState([])
  const [units, setUnits] = useState([])
  const [unitModalOpen, setUnitModalOpen] = useState(false)
  const [editingUnit, setEditingUnit] = useState(null)
  const [bulkModalOpen, setBulkModalOpen] = useState(false)
  const [tenancies, setTenancies] = useState([])

  const [photos, setPhotos] = useState([])
  const photoUrlMapRef = useRef(new Map())
  const successTimeoutRef = useRef(null)

  const photoPreviewUrls = useMemo(
    () => photos.map(file => {
      let url = photoUrlMapRef.current.get(file)
      if (!url) { url = URL.createObjectURL(file); photoUrlMapRef.current.set(file, url) }
      return url
    }),
    [photos]
  )

  const [form, setForm] = useState({
    title: '', description: '', property_type: role === 'renter' ? 'sublease' : '',
    city: 'Charlottetown', neighbourhood: '', address: '', price: '',
    utilities_included: false, bedrooms: '1', bathrooms: '1', square_feet: '',
    available_from: '', lease_term: '1_year', pet_friendly: false,
    parking_available: false, laundry: 'none', furnished: false,
  })

  useEffect(() => {
    const live = new Set(photos)
    for (const [file, url] of photoUrlMapRef.current) {
      if (!live.has(file)) { URL.revokeObjectURL(url); photoUrlMapRef.current.delete(file) }
    }
  }, [photos])

  useEffect(() => {
    const map = photoUrlMapRef.current
    return () => { for (const url of map.values()) URL.revokeObjectURL(url); map.clear() }
  }, [])

  useEffect(() => {
    return () => { if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current) }
  }, [])

  useEffect(() => {
    if (mode === 'edit' && listing) {
      setForm({
        title: listing.title || '', description: listing.description || '',
        property_type: listing.property_type || '', city: listing.city || 'Charlottetown',
        neighbourhood: listing.neighbourhood || '', address: listing.address || '',
        price: listing.price ? String(listing.price) : '',
        utilities_included: listing.utilities_included || false,
        bedrooms: listing.bedrooms ? String(listing.bedrooms) : '1',
        bathrooms: listing.bathrooms ? String(listing.bathrooms) : '1',
        square_feet: listing.square_feet ? String(listing.square_feet) : '',
        available_from: listing.available_from || '', lease_term: listing.lease_term || '1_year',
        pet_friendly: listing.pet_friendly || false, parking_available: listing.parking_available || false,
        laundry: listing.laundry || 'none', furnished: listing.furnished || false,
      })
      setExistingImages(
        [...(listing.listing_images || [])].sort((a, b) => {
          if (a.is_primary && !b.is_primary) return -1
          if (!a.is_primary && b.is_primary) return 1
          return (a.sort_order ?? 0) - (b.sort_order ?? 0)
        })
      )
      if (listing?.id) {
        supabase.from('listing_units').select('*, listing_unit_rooms(*)').eq('listing_id', listing.id).order('sort_order')
          .then(({ data, error }) => {
            if (!error) setUnits(data || [])
            if (!error && data?.length) {
              supabase.from('tenancies').select('id, unit_id, room_id, renter:renter_id(full_name)')
                .eq('listing_id', listing.id).eq('status', 'active')
                .then(({ data: tenancyData }) => { setTenancies(tenancyData || []) })
            }
          })
      }
    }
  }, [mode, listing])

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  const handleDeleteUnit = async (unitId) => {
    const { error } = await supabase.from('listing_units').delete().eq('id', unitId)
    if (!error) setUnits(prev => prev.filter(u => u.id !== unitId))
  }

  const handlePhotos = (e) => {
    const newFiles = Array.from(e.target.files)
    const maxNew = Math.max(0, 8 - existingImages.length)
    setPhotos([...photos, ...newFiles].slice(0, maxNew))
    e.target.value = ''
  }

  const removePhoto = (index) => setPhotos(photos.filter((_, i) => i !== index))

  const movePhoto = (index, direction) => {
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= photos.length) return
    const newPhotos = [...photos]
    ;[newPhotos[index], newPhotos[targetIndex]] = [newPhotos[targetIndex], newPhotos[index]]
    setPhotos(newPhotos)
  }

  const removeExistingImage = (imgId) => {
    const img = existingImages.find(i => i.id === imgId)
    setRemovedImageIds(prev => [...prev, imgId])
    if (img?.storage_path) setRemovedImagePaths(prev => [...prev, img.storage_path])
    setExistingImages(prev => prev.filter(i => i.id !== imgId))
  }

  const uploadPhotos = async (listingId, sortOffset = 0) => {
    const uploadedImages = [], uploadedPaths = []
    let failedCount = 0, skippedCount = 0
    for (let i = 0; i < photos.length; i++) {
      const file = photos[i]
      setUploadProgress(`Uploading photo ${i + 1} of ${photos.length}...`)
      if (!file.type.startsWith('image/')) { skippedCount += 1; continue }
      if (file.size > 10 * 1024 * 1024) { skippedCount += 1; continue }
      const ext = file.name.split('.').pop().toLowerCase()
      const path = `${user.id}/${listingId}/${Date.now()}_${i}.${ext}`
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('listing-images').upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type })
      if (uploadError) { failedCount += 1; continue }
      const { data: urlData } = supabase.storage.from('listing-images').getPublicUrl(uploadData.path)
      uploadedPaths.push(uploadData.path)
      uploadedImages.push({ listing_id: listingId, url: urlData.publicUrl, storage_path: uploadData.path, is_primary: sortOffset === 0 && i === 0, sort_order: sortOffset + i })
    }
    if (uploadedImages.length > 0) {
      const { error: insertError } = await supabase.from('listing_images').insert(uploadedImages)
      if (insertError) {
        if (uploadedPaths.length > 0) await supabase.storage.from('listing-images').remove(uploadedPaths)
        setUploadProgress(null)
        throw new Error('Photos uploaded, but we could not attach them to the listing. Please try again.')
      }
    }
    setUploadProgress(null)
    return { uploadedCount: uploadedImages.length, failedCount, skippedCount }
  }

  const handleSubmit = async () => {
    setError(null); setLoading(true)
    try {
      let listingId
      const finishSave = (savedListingId, message) => {
        if (message) {
          setError(message)
          if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current)
          successTimeoutRef.current = setTimeout(() => {
            successTimeoutRef.current = null
            if (onSubmitSuccess) onSubmitSuccess(); else navigate(`/listings/${savedListingId}`)
          }, 2500)
          return
        }
        if (onSubmitSuccess) onSubmitSuccess(); else navigate(`/listings/${savedListingId}`)
      }

      const listingData = {
        title: form.title, description: form.description, property_type: form.property_type,
        city: form.city, neighbourhood: form.neighbourhood, address: form.address,
        price: parseInt(form.price), utilities_included: form.utilities_included,
        bedrooms: parseInt(form.bedrooms), bathrooms: parseFloat(form.bathrooms),
        square_feet: form.square_feet ? parseInt(form.square_feet) : null,
        available_from: form.available_from || null, lease_term: form.lease_term,
        pet_friendly: form.pet_friendly, parking_available: form.parking_available,
        laundry: form.laundry, furnished: form.furnished,
      }

      if (mode === 'edit') {
        const { error: updateError } = await supabase.from('listings').update(listingData).eq('id', listing.id)
        if (updateError) throw updateError
        listingId = listing.id
        if (removedImageIds.length > 0) {
          const { error: deleteImagesError } = await supabase.from('listing_images').delete().in('id', removedImageIds)
          if (deleteImagesError) throw new Error('Listing saved, but removed photos could not be updated.')
          if (removedImagePaths.length > 0) {
            const { error: removeStorageError } = await supabase.storage.from('listing-images').remove(removedImagePaths)
            if (removeStorageError) throw new Error('Listing saved, but photos could not be deleted from storage.')
          }
        }
      } else {
        const { data, error: insertError } = await supabase.from('listings')
          .insert({ ...listingData, landlord_id: user.id, status: 'active' }).select().single()
        if (insertError) throw insertError
        listingId = data.id
      }

      let photoMessage = null
      if (photos.length > 0) {
        const { uploadedCount, failedCount, skippedCount } = await uploadPhotos(listingId, existingImages.length)
        const incompleteCount = failedCount + skippedCount
        if (uploadedCount === 0 && incompleteCount > 0) photoMessage = 'Listing saved, but all photo uploads failed. You can retry from Edit.'
        else if (incompleteCount > 0) photoMessage = 'Listing saved, but some photos failed to upload. You can retry from Edit.'
      }
      finishSave(listingId, photoMessage)
    } catch (err) {
      console.error('Listing submit failed:', err)
      setError(err.message || 'Something went wrong. Please try again.')
    } finally { setLoading(false) }
  }

  const canProceed = () => {
    if (step === 1) return form.title && form.property_type && form.city
    if (step === 2) return form.price && form.bedrooms && form.bathrooms
    return true
  }

  // Shared input classes
  const inputClass = "w-full bg-transparent border-b border-hairline py-2.5 text-sm text-charcoal placeholder:text-stone focus:outline-none focus:border-maple transition-colors font-light"
  const selectClass = "w-full bg-canvas border-b border-hairline py-2.5 text-sm text-charcoal focus:outline-none focus:border-maple transition-colors font-light appearance-none"
  const labelClass = "block text-[10px] tracking-widest uppercase text-stone mb-2"

  const totalSteps = isRenter ? 3 : 4

  return (
    <div className="bg-canvas min-h-screen">

      {/* Page header */}
      <div className="border-b border-hairline px-6 md:px-10 py-10">
        <div className="max-w-2xl mx-auto">
          <div className="text-[10px] tracking-widest uppercase text-maple mb-3">
            {mode === 'edit' ? 'Edit Listing' : 'New Listing'}
          </div>
          <h1 className="font-serif font-normal text-ink" style={{ fontSize: 'clamp(28px, 4vw, 44px)', lineHeight: 1.1 }}>
            {mode === 'edit' ? 'Update your listing' : isRenter ? 'Post a sublease' : 'Post a listing'}
          </h1>
          <p className="text-sm text-stone mt-2">
            {mode === 'edit' ? 'Make changes to your property details below.'
              : isRenter ? 'List your space and find someone to take over your lease.'
              : 'Fill in your property details to connect with renters.'}
          </p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 md:px-10 py-10">

        {/* Step indicator */}
        <div className="flex items-center gap-0 mb-10 border border-hairline overflow-hidden">
          {[1, 2, 3, ...(isRenter ? [] : [4])].map((s) => (
            <div key={s} className={`flex-1 flex items-center justify-center gap-2 py-3 text-[10px] tracking-widest uppercase transition-colors border-r border-hairline last:border-r-0 ${
              s < step ? 'bg-maple text-white'
              : s === step ? 'bg-ink text-canvas'
              : 'bg-canvas text-stone'
            }`}>
              <span className="font-normal">{s < step ? '✓' : s}</span>
              <span className="hidden sm:inline">{STEP_LABELS[s]}</span>
            </div>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="border border-maple-muted bg-maple-light text-maple-dark text-sm px-4 py-3 mb-6">
            {error}
          </div>
        )}

        {/* ── Step 1: Property ── */}
        {step === 1 && (
          <div className="space-y-8">
            <div className="text-[10px] tracking-widest uppercase text-stone border-b border-hairline pb-3 mb-6">
              Property Information
            </div>

            <div>
              <label className={labelClass}>Listing Title *</label>
              <input type="text" className={inputClass} value={form.title}
                onChange={e => update('title', e.target.value)}
                placeholder="e.g. Bright 2BR near UPEI, utilities included" maxLength={120} />
            </div>

            <div>
              <label className={labelClass}>Property Type *</label>
              <div className="grid grid-cols-3 gap-px bg-hairline border border-hairline mt-2">
                {PROPERTY_TYPES.map(t => (
                  <button key={t.value} type="button"
                    onClick={() => update('property_type', t.value)}
                    className={`py-3 px-3 text-xs tracking-widest uppercase transition-colors ${
                      form.property_type === t.value
                        ? 'bg-ink text-canvas'
                        : 'bg-canvas text-steel hover:bg-surface hover:text-charcoal'
                    }`}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className={labelClass}>City *</label>
                <select className={selectClass} value={form.city}
                  onChange={e => { update('city', e.target.value); update('neighbourhood', '') }}>
                  {Object.keys(PEI_NEIGHBOURHOODS).map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Neighbourhood</label>
                <select className={selectClass} value={form.neighbourhood}
                  onChange={e => update('neighbourhood', e.target.value)}>
                  <option value="">Select neighbourhood</option>
                  {(PEI_NEIGHBOURHOODS[form.city] || []).map(n => <option key={n}>{n}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className={labelClass}>Street Address</label>
              <input type="text" className={inputClass} value={form.address}
                onChange={e => update('address', e.target.value)}
                placeholder="e.g. 123 University Ave (shown only after contact)" />
            </div>

            <div>
              <label className={labelClass}>Description</label>
              <textarea className={`${inputClass} resize-none`} rows={4} value={form.description}
                onChange={e => update('description', e.target.value)}
                placeholder="Describe your property — highlights, nearby transit, what's included..."
                maxLength={3000} />
            </div>
          </div>
        )}

        {/* ── Step 2: Pricing & Details ── */}
        {step === 2 && (
          <div className="space-y-8">
            <div className="text-[10px] tracking-widest uppercase text-stone border-b border-hairline pb-3 mb-6">
              Pricing & Details
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className={labelClass}>Monthly Rent (CAD) *</label>
                <div className="relative">
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 text-stone text-sm">$</span>
                  <input type="number" className={`${inputClass} pl-4`} value={form.price}
                    onChange={e => update('price', e.target.value)} placeholder="1200" min="0" />
                </div>
              </div>
              <div>
                <label className={labelClass}>Square Feet</label>
                <input type="number" className={inputClass} value={form.square_feet}
                  onChange={e => update('square_feet', e.target.value)} placeholder="750" min="0" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className={labelClass}>Bedrooms *</label>
                <select className={selectClass} value={form.bedrooms}
                  onChange={e => update('bedrooms', e.target.value)}>
                  {['1','2','3','4','5','6'].map(n => <option key={n} value={n}>{n} bedroom{n !== '1' ? 's' : ''}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Bathrooms *</label>
                <select className={selectClass} value={form.bathrooms}
                  onChange={e => update('bathrooms', e.target.value)}>
                  {['1','1.5','2','2.5','3'].map(n => <option key={n} value={n}>{n} bathroom{n !== '1' ? 's' : ''}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className={labelClass}>Available From</label>
                <input type="date" className={inputClass} value={form.available_from}
                  onChange={e => update('available_from', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Lease Term</label>
                <select className={selectClass} value={form.lease_term}
                  onChange={e => update('lease_term', e.target.value)}>
                  {LEASE_TERMS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className={labelClass}>Laundry</label>
              <select className={selectClass} value={form.laundry}
                onChange={e => update('laundry', e.target.value)}>
                <option value="in_unit">In-Unit</option>
                <option value="shared">Shared</option>
                <option value="none">None</option>
              </select>
            </div>

            {/* Toggles */}
            <div>
              <label className={labelClass}>Amenities</label>
              <div className="grid grid-cols-2 gap-px bg-hairline border border-hairline mt-2">
                {[
                  { field: 'utilities_included', label: 'Utilities Included' },
                  { field: 'pet_friendly',        label: 'Pet Friendly' },
                  { field: 'parking_available',   label: 'Parking Available' },
                  { field: 'furnished',           label: 'Furnished' },
                ].map(({ field, label }) => (
                  <button key={field} type="button"
                    onClick={() => update(field, !form[field])}
                    className={`flex items-center gap-3 py-3.5 px-4 text-xs tracking-widest uppercase text-left transition-colors ${
                      form[field] ? 'bg-maple text-white' : 'bg-canvas text-steel hover:bg-surface'
                    }`}>
                    <span className={`w-3.5 h-3.5 border flex items-center justify-center flex-shrink-0 ${form[field] ? 'border-white' : 'border-hairline'}`}>
                      {form[field] && <span className="text-[8px] leading-none">✓</span>}
                    </span>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Step 3: Photos ── */}
        {step === 3 && (
          <div className="space-y-8">
            <div>
              <div className="text-[10px] tracking-widest uppercase text-stone border-b border-hairline pb-3 mb-2">Photos</div>
              <p className="text-sm text-stone mt-3">Up to 8 photos. The first photo is your main image.</p>
            </div>

            {existingImages.length > 0 && (
              <div>
                <div className="text-[9px] tracking-widests uppercase text-stone mb-3">
                  Current Photos ({existingImages.length})
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {existingImages.map((img, i) => (
                    <div key={img.id} className="relative group aspect-square overflow-hidden bg-surface">
                      <img src={img.url} alt={`Existing ${i + 1}`} loading="lazy" className="w-full h-full object-cover" />
                      {img.is_primary && (
                        <div className="absolute top-1 left-1 bg-ink text-canvas text-[8px] tracking-widest uppercase px-1.5 py-0.5">
                          Main
                        </div>
                      )}
                      <button type="button" onClick={() => removeExistingImage(img.id)}
                        className="absolute top-1 right-1 bg-ink/80 text-white w-5 h-5 flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition hover:bg-maple">
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Upload area */}
            <label className={`block border border-dashed p-10 text-center cursor-pointer transition-colors ${
              photos.length + existingImages.length >= 8
                ? 'border-hairline cursor-not-allowed opacity-40'
                : 'border-hairline hover:border-maple hover:bg-surface'
            }`}>
              <input type="file" accept="image/jpeg,image/png,image/webp,image/heic" multiple className="hidden"
                disabled={photos.length + existingImages.length >= 8} onChange={handlePhotos} />
              <div className="text-2xl mb-3 text-stone">+</div>
              <p className="text-sm font-normal text-charcoal">
                {photos.length + existingImages.length >= 8 ? 'Maximum 8 photos reached' : 'Click to add photos'}
              </p>
              <p className="text-[10px] tracking-widests uppercase text-stone mt-1">
                JPG, PNG, WebP · max 10MB · {photos.length + existingImages.length}/8
              </p>
            </label>

            {photos.length > 0 && (
              <div className="grid grid-cols-4 gap-2">
                {photoPreviewUrls.map((url, i) => (
                  <div key={i} className="relative group aspect-square overflow-hidden bg-surface">
                    <img src={url} alt={`Photo ${i + 1}`} loading="lazy" className="w-full h-full object-cover" />
                    {i === 0 && (
                      <div className="absolute top-1 left-1 bg-ink text-canvas text-[8px] tracking-widest uppercase px-1.5 py-0.5">
                        Main
                      </div>
                    )}
                    <div className="absolute inset-0 bg-ink/0 group-hover:bg-ink/30 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100 gap-1">
                      {i > 0 && (
                        <button type="button" onClick={() => movePhoto(i, -1)}
                          className="bg-canvas text-charcoal text-xs px-1.5 py-1 hover:bg-maple hover:text-white transition">←</button>
                      )}
                      <button type="button" onClick={() => removePhoto(i)}
                        className="bg-maple text-white text-xs px-1.5 py-1 hover:bg-maple-dark transition">✕</button>
                      {i < photos.length - 1 && (
                        <button type="button" onClick={() => movePhoto(i, 1)}
                          className="bg-canvas text-charcoal text-xs px-1.5 py-1 hover:bg-maple hover:text-white transition">→</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {uploadProgress && (
              <div className="border border-hairline bg-surface text-charcoal text-sm px-4 py-3 flex items-center gap-2">
                <span className="text-maple">·</span> {uploadProgress}
              </div>
            )}

            {/* Summary */}
            <div className="border border-hairline bg-surface p-5 space-y-1.5">
              <div className="text-[9px] tracking-widests uppercase text-stone mb-3">Listing Summary</div>
              <p className="font-normal text-sm text-ink">{form.title}</p>
              <p className="text-[11px] tracking-wide uppercase text-stone">
                {form.city}{form.neighbourhood ? `, ${form.neighbourhood}` : ''}
              </p>
              <p className="text-[11px] tracking-wide uppercase text-stone">
                ${form.price}/month · {form.bedrooms} bed · {form.bathrooms} bath · {form.property_type?.replace('_', ' ')}
              </p>
            </div>
          </div>
        )}

        {/* ── Step 4: Units (landlords only) ── */}
        {step === 4 && !isRenter && (
          <div className="space-y-6">
            <div>
              <div className="text-[10px] tracking-widest uppercase text-stone border-b border-hairline pb-3 mb-4">Units</div>
              <p className="text-sm text-stone">
                Add individual units if this listing has multiple rentable spaces (e.g. apartments in a building, rooms in a house).
              </p>
            </div>

            {mode === 'create' && (
              <div className="border border-hairline bg-surface px-4 py-3 text-sm text-steel">
                Units can be added after publishing. Click &quot;Publish Listing&quot; then use Edit to add units.
              </div>
            )}

            {mode === 'edit' && (
              <>
                <div className="space-y-px border border-hairline">
                  {units.map(unit => {
                    const isFull = unit.room_rental
                      ? (unit.listing_unit_rooms || []).length > 0 && (unit.listing_unit_rooms || []).every(r => r.status === 'occupied')
                      : unit.status === 'rented'
                    const t = tenancies.find(t => t.unit_id === unit.id)
                    return (
                      <div key={unit.id} className={`flex items-center gap-4 px-4 py-3 ${isFull ? 'bg-surface' : 'bg-canvas'}`}>
                        <div className="flex-1 min-w-0">
                          <span className="font-normal text-sm text-ink">{unit.unit_name}</span>
                          {unit.floor != null && <span className="text-stone text-xs ml-2">· Floor {unit.floor}</span>}
                          {unit.price && <span className="text-stone text-xs ml-2">· ${unit.price}/mo</span>}
                          {t?.renter?.full_name && <span className="text-stone text-xs ml-2">· {t.renter.full_name}</span>}
                        </div>
                        {isFull && (
                          <span className="text-[9px] tracking-widest uppercase border border-hairline text-stone px-2 py-0.5">
                            {unit.room_rental ? 'Full' : 'Rented'}
                          </span>
                        )}
                        <button type="button" onClick={() => { setEditingUnit(unit); setUnitModalOpen(true) }}
                          className="text-[10px] tracking-widest uppercase text-maple hover:text-maple-dark transition-colors">
                          Edit
                        </button>
                        {!isFull && (
                          <button type="button" onClick={() => handleDeleteUnit(unit.id)}
                            className="text-stone hover:text-maple transition-colors text-sm">
                            ✕
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>

                <button type="button" onClick={() => { setEditingUnit(null); setUnitModalOpen(true) }}
                  className="w-full border border-dashed border-hairline py-3 text-[11px] tracking-widest uppercase text-stone hover:border-maple hover:text-maple transition-colors">
                  + Add unit
                </button>
                <div className="text-center">
                  <button type="button" onClick={() => setBulkModalOpen(true)}
                    className="text-[10px] tracking-widest uppercase text-maple hover:text-maple-dark transition-colors">
                    Bulk add multiple units
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-12 pt-6 border-t border-hairline">
          {step > 1 ? (
            <button onClick={() => setStep(s => s - 1)} disabled={loading}
              className="text-[11px] tracking-widest uppercase border border-hairline px-5 py-3 text-steel hover:text-ink hover:border-ink transition-colors disabled:opacity-40">
              ← Back
            </button>
          ) : <div />}

          {step < totalSteps ? (
            <button onClick={() => setStep(s => s + 1)} disabled={!canProceed()}
              className="text-[11px] tracking-widest uppercase bg-ink text-canvas px-7 py-3 hover:bg-maple transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              Continue →
            </button>
          ) : (
            <button onClick={handleSubmit} disabled={loading}
              className="text-[11px] tracking-widest uppercase bg-maple text-white px-7 py-3 hover:bg-maple-dark transition-colors disabled:opacity-50 flex items-center gap-2">
              {loading
                ? <><span className="opacity-60">·</span> {uploadProgress || (mode === 'edit' ? 'Saving...' : 'Publishing...')}</>
                : mode === 'edit' ? '✓ Save Changes' : 'Publish Listing'
              }
            </button>
          )}
        </div>
      </div>

      {unitModalOpen && (
        <UnitEditorModal
          listingId={listing?.id || null}
          basePrice={form.price ? parseInt(form.price) : null}
          unit={editingUnit}
          onSaved={(saved) => {
            setUnits(prev => {
              const idx = prev.findIndex(u => u.id === saved.id)
              if (idx >= 0) { const next = [...prev]; next[idx] = { ...prev[idx], ...saved }; return next }
              return [...prev, saved]
            })
          }}
          onClose={() => { setUnitModalOpen(false); setEditingUnit(null) }}
        />
      )}
      {bulkModalOpen && (
        <BulkAddModal
          listingId={listing?.id || null}
          existingCount={units.length}
          onSaved={(newUnits) => setUnits(prev => [...prev, ...newUnits])}
          onClose={() => setBulkModalOpen(false)}
        />
      )}
    </div>
  )
}
