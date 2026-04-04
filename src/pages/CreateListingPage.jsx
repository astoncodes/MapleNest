import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

const PEI_NEIGHBOURHOODS = {
  Charlottetown: ['Downtown', 'West Royalty', 'Brighton', 'Sherwood', 'Parkdale', 'Belvedere', 'University Avenue', 'East Royalty'],
  Summerside: ['Downtown Summerside', 'Wilmot', 'Central Summerside'],
  Cornwall: ['Cornwall'],
  Stratford: ['Stratford'],
  Other: ['Other'],
}

const ALL_PROPERTY_TYPES = [
  { value: 'apartment', label: '🏢 Apartment' },
  { value: 'house', label: '🏠 House' },
  { value: 'room', label: '🛏 Room' },
  { value: 'basement', label: '🏚 Basement Suite' },
  { value: 'condo', label: '🏙 Condo' },
  { value: 'townhouse', label: '🏘 Townhouse' },
  { value: 'sublease', label: '🔄 Sublease' },
]

const RENTER_PROPERTY_TYPES = [
  { value: 'sublease', label: '🔄 Sublease' },
]

const LEASE_TERMS = [
  { value: 'monthly', label: 'Month-to-Month' },
  { value: '6_months', label: '6 Months' },
  { value: '1_year', label: '1 Year' },
  { value: 'flexible', label: 'Flexible' },
]

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

  const [photos, setPhotos] = useState([])           // File objects
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState([])

  const [form, setForm] = useState({
    title: '',
    description: '',
    property_type: role === 'renter' ? 'sublease' : '',
    city: 'Charlottetown',
    neighbourhood: '',
    address: '',
    price: '',
    utilities_included: false,
    bedrooms: 1,
    bathrooms: 1,
    square_feet: '',
    available_from: '',
    lease_term: '1_year',
    pet_friendly: false,
    parking_available: false,
    laundry: 'none',
    furnished: false,
  })

  useEffect(() => {
    if (mode === 'edit' && listing) {
      setForm({
        title: listing.title || '',
        description: listing.description || '',
        property_type: listing.property_type || '',
        city: listing.city || 'Charlottetown',
        neighbourhood: listing.neighbourhood || '',
        address: listing.address || '',
        price: listing.price ? String(listing.price) : '',
        utilities_included: listing.utilities_included || false,
        bedrooms: listing.bedrooms || 1,
        bathrooms: listing.bathrooms || 1,
        square_feet: listing.square_feet ? String(listing.square_feet) : '',
        available_from: listing.available_from || '',
        lease_term: listing.lease_term || '1_year',
        pet_friendly: listing.pet_friendly || false,
        parking_available: listing.parking_available || false,
        laundry: listing.laundry || 'none',
        furnished: listing.furnished || false,
      })
      setExistingImages(
        [...(listing.listing_images || [])].sort((a, b) => {
          if (a.is_primary && !b.is_primary) return -1
          if (!a.is_primary && b.is_primary) return 1
          return a.sort_order - b.sort_order
        })
      )
    }
  }, [mode, listing])

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  const handlePhotos = (e) => {
    const newFiles = Array.from(e.target.files)
    const combined = [...photos, ...newFiles].slice(0, 8)
    setPhotos(combined)
    setPhotoPreviewUrls(combined.map(f => URL.createObjectURL(f)))
    // Reset input so same file can be re-added if needed
    e.target.value = ''
  }

  const removePhoto = (index) => {
    const updatedPhotos = photos.filter((_, i) => i !== index)
    const updatedUrls = photoPreviewUrls.filter((_, i) => i !== index)
    setPhotos(updatedPhotos)
    setPhotoPreviewUrls(updatedUrls)
  }

  const movePhoto = (index, direction) => {
    const newPhotos = [...photos]
    const newUrls = [...photoPreviewUrls]
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= newPhotos.length) return
    ;[newPhotos[index], newPhotos[targetIndex]] = [newPhotos[targetIndex], newPhotos[index]]
    ;[newUrls[index], newUrls[targetIndex]] = [newUrls[targetIndex], newUrls[index]]
    setPhotos(newPhotos)
    setPhotoPreviewUrls(newUrls)
  }

  const removeExistingImage = (imgId) => {
    setRemovedImageIds(prev => [...prev, imgId])
    setExistingImages(prev => prev.filter(img => img.id !== imgId))
  }

  const uploadPhotos = async (listingId, sortOffset = 0) => {
    const uploadedImages = []
    for (let i = 0; i < photos.length; i++) {
      const file = photos[i]
      setUploadProgress(`Uploading photo ${i + 1} of ${photos.length}...`)

      // Validate file type
      if (!file.type.startsWith('image/')) {
        console.warn(`Skipping non-image file: ${file.name}`)
        continue
      }

      // Validate file size (10MB max)
      if (file.size > 10 * 1024 * 1024) {
        console.warn(`Skipping oversized file: ${file.name}`)
        continue
      }

      const ext = file.name.split('.').pop().toLowerCase()
      const safeName = `${Date.now()}_${i}.${ext}`
      const path = `${user.id}/${listingId}/${safeName}`

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('listing-images')
        .upload(path, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type,
        })

      if (uploadError) {
        console.error(`Upload failed for photo ${i + 1}:`, uploadError.message)
        // Don't throw — keep uploading remaining photos
        continue
      }

      const { data: urlData } = supabase.storage
        .from('listing-images')
        .getPublicUrl(uploadData.path)

      uploadedImages.push({
        listing_id: listingId,
        url: urlData.publicUrl,
        storage_path: uploadData.path,
        is_primary: sortOffset === 0 && i === 0,
        sort_order: sortOffset + i,
      })
    }

    if (uploadedImages.length > 0) {
      const { error: insertError } = await supabase
        .from('listing_images')
        .insert(uploadedImages)

      if (insertError) {
        console.error('Failed to save image records:', insertError.message)
      }
    }

    setUploadProgress(null)
    return uploadedImages.length
  }

  const handleSubmit = async () => {
    setError(null)
    setLoading(true)

    try {
      let listingId

      if (mode === 'edit') {
        const { error: updateError } = await supabase
          .from('listings')
          .update({
            title: form.title,
            description: form.description,
            property_type: form.property_type,
            city: form.city,
            neighbourhood: form.neighbourhood,
            address: form.address,
            price: parseInt(form.price),
            utilities_included: form.utilities_included,
            bedrooms: parseInt(form.bedrooms),
            bathrooms: parseFloat(form.bathrooms),
            square_feet: form.square_feet ? parseInt(form.square_feet) : null,
            available_from: form.available_from || null,
            lease_term: form.lease_term,
            pet_friendly: form.pet_friendly,
            parking_available: form.parking_available,
            laundry: form.laundry,
            furnished: form.furnished,
          })
          .eq('id', listing.id)

        if (updateError) throw updateError
        listingId = listing.id

        // Delete any images the user removed
        if (removedImageIds.length > 0) {
          await supabase.from('listing_images').delete().in('id', removedImageIds)
        }
      } else {
        const { data, error: insertError } = await supabase
          .from('listings')
          .insert({
            landlord_id: user.id,
            title: form.title,
            description: form.description,
            property_type: form.property_type,
            city: form.city,
            neighbourhood: form.neighbourhood,
            address: form.address,
            price: parseInt(form.price),
            utilities_included: form.utilities_included,
            bedrooms: parseInt(form.bedrooms),
            bathrooms: parseFloat(form.bathrooms),
            square_feet: form.square_feet ? parseInt(form.square_feet) : null,
            available_from: form.available_from || null,
            lease_term: form.lease_term,
            pet_friendly: form.pet_friendly,
            parking_available: form.parking_available,
            laundry: form.laundry,
            furnished: form.furnished,
            status: 'active',
          })
          .select()
          .single()

        if (insertError) throw insertError
        listingId = data.id
      }

      // Upload any new photos
      if (photos.length > 0) {
        const sortOffset = existingImages.length
        const uploaded = await uploadPhotos(listingId, sortOffset)
        if (uploaded === 0 && photos.length > 0) {
          setError('Listing saved but new photos failed to upload. You can try again from Edit.')
          setTimeout(() => {
            if (onSubmitSuccess) onSubmitSuccess()
            else navigate(`/listings/${listingId}`)
          }, 2500)
          return
        }
      }

      if (onSubmitSuccess) {
        onSubmitSuccess()
      } else {
        navigate(`/listings/${listingId}`)
      }
    } catch (err) {
      console.error('Listing submit failed:', err)
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const canProceed = () => {
    if (step === 1) return form.title && form.property_type && form.city
    if (step === 2) return form.price && form.bedrooms && form.bathrooms
    return true
  }

  const inputClass = "w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-transparent bg-white"
  const labelClass = "block text-sm font-medium text-gray-700 mb-1.5"

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          {mode === 'edit' ? 'Edit Listing' : isRenter ? 'Post a Sublease' : 'Post a Listing'}
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          {mode === 'edit'
            ? 'Update your property details'
            : isRenter
            ? 'List your space for sublet and find someone to take over your lease'
            : 'Fill in your property details to connect with renters'}
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {[1, 2, 3].map(s => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
              s < step ? 'bg-green-500 text-white' :
              s === step ? 'bg-red-700 text-white' :
              'bg-gray-100 text-gray-400'
            }`}>
              {s < step ? '✓' : s}
            </div>
            <span className={`text-sm ${s === step ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>
              {s === 1 ? 'Property' : s === 2 ? 'Details' : 'Photos'}
            </span>
            {s < 3 && <div className={`w-8 h-px ${s < step ? 'bg-green-400' : 'bg-gray-200'}`} />}
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-5">
            {error}
          </div>
        )}

        {/* Step 1: Property basics */}
        {step === 1 && (
          <div className="space-y-5">
            <h2 className="font-semibold text-gray-800 text-lg mb-4">Property Information</h2>

            <div>
              <label className={labelClass}>Listing Title *</label>
              <input type="text" className={inputClass} value={form.title}
                onChange={e => update('title', e.target.value)}
                placeholder="e.g. Bright 2BR near UPEI, utilities included" />
            </div>

            <div>
              <label className={labelClass}>Property Type *</label>
              <div className="grid grid-cols-3 gap-2">
                {PROPERTY_TYPES.map(t => (
                  <button key={t.value} type="button"
                    onClick={() => update('property_type', t.value)}
                    className={`py-2.5 px-3 rounded-lg border text-sm font-medium transition text-left ${
                      form.property_type === t.value
                        ? 'bg-red-700 text-white border-red-700'
                        : 'border-gray-200 text-gray-600 hover:border-red-200 hover:bg-red-50'
                    }`}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>City *</label>
                <select className={inputClass} value={form.city}
                  onChange={e => { update('city', e.target.value); update('neighbourhood', '') }}>
                  {Object.keys(PEI_NEIGHBOURHOODS).map(c => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Neighbourhood</label>
                <select className={inputClass} value={form.neighbourhood}
                  onChange={e => update('neighbourhood', e.target.value)}>
                  <option value="">Select neighbourhood</option>
                  {(PEI_NEIGHBOURHOODS[form.city] || []).map(n => (
                    <option key={n}>{n}</option>
                  ))}
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
              <textarea className={inputClass} rows={4} value={form.description}
                onChange={e => update('description', e.target.value)}
                placeholder="Describe your property — highlights, nearby transit, what's included..." />
            </div>
          </div>
        )}

        {/* Step 2: Pricing & Details */}
        {step === 2 && (
          <div className="space-y-5">
            <h2 className="font-semibold text-gray-800 text-lg mb-4">Pricing & Details</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Monthly Rent (CAD) *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">$</span>
                  <input type="number" className={`${inputClass} pl-7`} value={form.price}
                    onChange={e => update('price', e.target.value)} placeholder="1200" min="0" />
                </div>
              </div>
              <div>
                <label className={labelClass}>Square Feet</label>
                <input type="number" className={inputClass} value={form.square_feet}
                  onChange={e => update('square_feet', e.target.value)} placeholder="750" min="0" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Bedrooms *</label>
                <select className={inputClass} value={form.bedrooms}
                  onChange={e => update('bedrooms', e.target.value)}>
                  {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n} bedroom{n > 1 ? 's' : ''}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Bathrooms *</label>
                <select className={inputClass} value={form.bathrooms}
                  onChange={e => update('bathrooms', e.target.value)}>
                  {[1, 1.5, 2, 2.5, 3].map(n => <option key={n} value={n}>{n} bathroom{n > 1 ? 's' : ''}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Available From</label>
                <input type="date" className={inputClass} value={form.available_from}
                  onChange={e => update('available_from', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Lease Term</label>
                <select className={inputClass} value={form.lease_term}
                  onChange={e => update('lease_term', e.target.value)}>
                  {LEASE_TERMS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className={labelClass}>Laundry</label>
              <select className={inputClass} value={form.laundry}
                onChange={e => update('laundry', e.target.value)}>
                <option value="in_unit">In-Unit</option>
                <option value="shared">Shared</option>
                <option value="none">None</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              {[
                { field: 'utilities_included', label: '💡 Utilities Included' },
                { field: 'pet_friendly', label: '🐾 Pet Friendly' },
                { field: 'parking_available', label: '🚗 Parking Available' },
                { field: 'furnished', label: '🛋 Furnished' },
              ].map(({ field, label }) => (
                <button key={field} type="button"
                  onClick={() => update(field, !form[field])}
                  className={`flex items-center gap-2 py-2.5 px-4 rounded-lg border text-sm font-medium transition ${
                    form[field]
                      ? 'bg-green-50 border-green-400 text-green-700'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}>
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                    form[field] ? 'bg-green-500 border-green-500' : 'border-gray-300'
                  }`}>
                    {form[field] && <span className="text-white text-xs">✓</span>}
                  </div>
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Photos */}
        {step === 3 && (
          <div className="space-y-5">
            <div>
              <h2 className="font-semibold text-gray-800 text-lg mb-1">Photos</h2>
              <p className="text-sm text-gray-500">
                Add up to 8 photos. The first photo is your main image — drag to reorder.
              </p>
            </div>

            {existingImages.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                  Current Photos ({existingImages.length})
                </p>
                <div className="grid grid-cols-4 gap-2 mb-4">
                  {existingImages.map((img, i) => (
                    <div key={img.id} className="relative group">
                      <div className="aspect-square rounded-lg overflow-hidden bg-gray-100">
                        <img src={img.url} alt={`Existing ${i + 1}`} className="w-full h-full object-cover" />
                      </div>
                      {img.is_primary && (
                        <div className="absolute top-1 left-1 bg-red-700 text-white text-xs px-1.5 py-0.5 rounded font-medium">
                          Main
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => removeExistingImage(img.id)}
                        className="absolute top-1 right-1 bg-red-600 text-white rounded text-xs w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition hover:bg-red-700"
                        title="Remove photo"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Upload area */}
            <label className={`block border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition ${
              photos.length >= 8
                ? 'border-gray-100 bg-gray-50 cursor-not-allowed'
                : 'border-gray-200 hover:border-red-300 hover:bg-red-50'
            }`}>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic"
                multiple
                className="hidden"
                disabled={photos.length >= 8}
                onChange={handlePhotos}
              />
              <div className="text-3xl mb-2">📷</div>
              <p className="text-sm font-medium text-gray-700">
                {photos.length >= 8 ? 'Maximum 8 photos reached' : 'Click to add photos'}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                JPG, PNG, WebP — max 10MB each · {photos.length}/8 added
              </p>
            </label>

            {/* Photo grid with reorder controls */}
            {photos.length > 0 && (
              <div className="grid grid-cols-4 gap-2">
                {photoPreviewUrls.map((url, i) => (
                  <div key={i} className="relative group">
                    <div className="aspect-square rounded-lg overflow-hidden bg-gray-100">
                      <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                    </div>

                    {/* Primary badge */}
                    {i === 0 && (
                      <div className="absolute top-1 left-1 bg-red-700 text-white text-xs px-1.5 py-0.5 rounded font-medium">
                        Main
                      </div>
                    )}

                    {/* Controls overlay */}
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 rounded-lg transition-all flex items-center justify-center opacity-0 group-hover:opacity-100 gap-1">
                      {i > 0 && (
                        <button type="button" onClick={() => movePhoto(i, -1)}
                          className="bg-white text-gray-700 rounded text-xs px-1.5 py-1 font-bold hover:bg-gray-100"
                          title="Move left">←</button>
                      )}
                      <button type="button" onClick={() => removePhoto(i)}
                        className="bg-red-600 text-white rounded text-xs px-1.5 py-1 font-bold hover:bg-red-700"
                        title="Remove">✕</button>
                      {i < photos.length - 1 && (
                        <button type="button" onClick={() => movePhoto(i, 1)}
                          className="bg-white text-gray-700 rounded text-xs px-1.5 py-1 font-bold hover:bg-gray-100"
                          title="Move right">→</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Upload progress */}
            {uploadProgress && (
              <div className="bg-blue-50 border border-blue-200 text-blue-700 text-sm px-4 py-3 rounded-lg flex items-center gap-2">
                <span className="animate-spin">⏳</span>
                {uploadProgress}
              </div>
            )}

            {/* Listing summary */}
            <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-1.5 border border-gray-100">
              <p className="font-medium text-gray-700 mb-2">Listing Summary</p>
              <p className="text-gray-600 font-medium">{form.title}</p>
              <p className="text-gray-500">{form.city}{form.neighbourhood ? `, ${form.neighbourhood}` : ''}</p>
              <p className="text-gray-500">${form.price}/month · {form.bedrooms} bed · {form.bathrooms} bath</p>
              <p className="text-gray-500 capitalize">{form.property_type?.replace('_', ' ')}</p>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-8 pt-6 border-t border-gray-100">
          {step > 1 ? (
            <button onClick={() => setStep(s => s - 1)} disabled={loading}
              className="px-5 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition disabled:opacity-50">
              ← Back
            </button>
          ) : <div />}

          {step < 3 ? (
            <button onClick={() => setStep(s => s + 1)} disabled={!canProceed()}
              className="px-6 py-2.5 text-sm font-semibold bg-red-700 text-white rounded-lg hover:bg-red-800 transition disabled:opacity-40 disabled:cursor-not-allowed">
              Continue →
            </button>
          ) : (
            <button onClick={handleSubmit} disabled={loading}
              className="px-6 py-2.5 text-sm font-semibold bg-red-700 text-white rounded-lg hover:bg-red-800 transition disabled:opacity-50 flex items-center gap-2">
              {loading ? (
                <><span className="animate-spin">⏳</span> {uploadProgress || 'Publishing...'}</>
              ) : (
                mode === 'edit' ? '✓ Save Changes' : '🍁 Publish Listing'
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
