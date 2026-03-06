import { useState } from 'react'
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

const PROPERTY_TYPES = [
  { value: 'apartment', label: '🏢 Apartment' },
  { value: 'house', label: '🏠 House' },
  { value: 'room', label: '🛏 Room' },
  { value: 'basement', label: '🏚 Basement Suite' },
  { value: 'condo', label: '🏙 Condo' },
  { value: 'townhouse', label: '🏘 Townhouse' },
]

const LEASE_TERMS = [
  { value: 'monthly', label: 'Month-to-Month' },
  { value: '6_months', label: '6 Months' },
  { value: '1_year', label: '1 Year' },
  { value: 'flexible', label: 'Flexible' },
]

export default function CreateListingPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [photos, setPhotos] = useState([])
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState([])

  const [form, setForm] = useState({
    title: '',
    description: '',
    property_type: '',
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

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  const handlePhotos = (e) => {
    const files = Array.from(e.target.files).slice(0, 8)
    setPhotos(files)
    setPhotoPreviewUrls(files.map(f => URL.createObjectURL(f)))
  }

  const removePhoto = (index) => {
    setPhotos(prev => prev.filter((_, i) => i !== index))
    setPhotoPreviewUrls(prev => prev.filter((_, i) => i !== index))
  }

  const uploadPhotos = async (listingId) => {
    const uploadedUrls = []
    for (let i = 0; i < photos.length; i++) {
      const file = photos[i]
      const ext = file.name.split('.').pop()
      const path = `${user.id}/${listingId}/${Date.now()}_${i}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('listing-images')
        .upload(path, file)
      if (uploadError) continue
      const { data } = supabase.storage.from('listing-images').getPublicUrl(path)
      uploadedUrls.push({ url: data.publicUrl, storage_path: path, is_primary: i === 0, sort_order: i })
    }
    if (uploadedUrls.length > 0) {
      await supabase.from('listing_images').insert(
        uploadedUrls.map(img => ({ ...img, listing_id: listingId }))
      )
    }
  }

  const handleSubmit = async () => {
    setError(null)
    setLoading(true)
    try {
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
      if (photos.length > 0) await uploadPhotos(data.id)
      navigate(`/listings/${data.id}`)
    } catch (err) {
      setError(err.message)
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
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Post a Listing</h1>
        <p className="text-gray-500 text-sm mt-1">Fill in your property details to connect with renters</p>
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
                placeholder="e.g. 123 University Ave (optional — shown after contact)" />
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

            {/* Toggles */}
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
            <h2 className="font-semibold text-gray-800 text-lg mb-1">Photos</h2>
            <p className="text-sm text-gray-500 mb-4">Add up to 8 photos. The first photo will be the main image.</p>

            {/* Upload area */}
            <label className="block border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-red-300 hover:bg-red-50 transition">
              <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotos} />
              <div className="text-3xl mb-2">📷</div>
              <p className="text-sm font-medium text-gray-700">Click to upload photos</p>
              <p className="text-xs text-gray-400 mt-1">JPG, PNG up to 10MB each — max 8 photos</p>
            </label>

            {/* Photo previews */}
            {photoPreviewUrls.length > 0 && (
              <div className="grid grid-cols-4 gap-2">
                {photoPreviewUrls.map((url, i) => (
                  <div key={i} className="relative aspect-square rounded-lg overflow-hidden group">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    {i === 0 && (
                      <div className="absolute top-1 left-1 bg-red-700 text-white text-xs px-1.5 py-0.5 rounded font-medium">Main</div>
                    )}
                    <button type="button" onClick={() => removePhoto(i)}
                      className="absolute top-1 right-1 bg-black bg-opacity-60 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Summary */}
            <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-1.5">
              <p className="font-medium text-gray-700 mb-2">Listing Summary</p>
              <p className="text-gray-500">{form.title}</p>
              <p className="text-gray-500">{form.city}{form.neighbourhood ? `, ${form.neighbourhood}` : ''}</p>
              <p className="text-gray-500">${form.price}/month · {form.bedrooms}BR · {form.bathrooms}BA</p>
              <p className="text-gray-500 capitalize">{form.property_type?.replace('_', ' ')}</p>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-8 pt-6 border-t border-gray-100">
          {step > 1 ? (
            <button onClick={() => setStep(s => s - 1)}
              className="px-5 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition">
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
              className="px-6 py-2.5 text-sm font-semibold bg-red-700 text-white rounded-lg hover:bg-red-800 transition disabled:opacity-50">
              {loading ? 'Publishing...' : '🍁 Publish Listing'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
