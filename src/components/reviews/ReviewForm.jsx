import { useState } from 'react'
import { supabase } from '../../lib/supabase'

const LANDLORD_TAGS = {
  positive: ['Responsive', 'Fair', 'Well-maintained property', 'Easy to deal with', 'Respectful'],
  negative: ['Slow to respond', 'Unclear expectations', 'Poor maintenance', 'Difficult'],
}

const RENTER_TAGS = {
  positive: ['Pays on time', 'Respectful', 'Clean', 'Easy to deal with', 'Great communicator'],
  negative: ['Late payments', 'Unresponsive', 'Left property in poor condition', 'Difficult'],
}

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

export default function ReviewForm({ tenancyId, reviewerId, revieweeId, listingId, reviewingRole, onSubmitted, onCancel }) {
  // reviewingRole: 'landlord' means we're reviewing a landlord (renter writes), 'renter' means reviewing a renter
  const tags = reviewingRole === 'landlord' ? LANDLORD_TAGS : RENTER_TAGS
  const [rating, setRating] = useState(0)
  const [selectedTags, setSelectedTags] = useState([])
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const toggleTag = (tag) => {
    setSelectedTags(prev => {
      if (prev.includes(tag)) return prev.filter(t => t !== tag)
      if (prev.length >= 4) return prev // max 4
      return [...prev, tag]
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!rating) { setError('Please select a star rating.'); return }

    setSaving(true)
    setError(null)

    const { error: insertErr } = await supabase
      .from('reviews')
      .insert({
        tenancy_id: tenancyId,
        reviewer_id: reviewerId,
        reviewee_id: revieweeId,
        listing_id: listingId,
        rating,
        tags: selectedTags,
        comment: comment.trim() || null,
        visible: false,
      })

    if (insertErr) {
      setError(insertErr.code === '23505' ? 'You have already submitted a review for this tenancy.' : insertErr.message)
      setSaving(false)
      return
    }

    // Try to reveal (if both reviews now exist)
    await supabase.rpc('reveal_reviews', { p_tenancy_id: tenancyId })

    setSaving(false)
    onSubmitted()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-2">Rating</label>
        <StarPicker value={rating} onChange={setRating} />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-2">
          Tags <span className="text-gray-400">(optional, up to 4)</span>
        </label>
        <div className="flex flex-wrap gap-1.5">
          {tags.positive.map(tag => (
            <button key={tag} type="button" onClick={() => toggleTag(tag)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${
                selectedTags.includes(tag)
                  ? 'bg-green-100 text-green-800 border border-green-300'
                  : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
              }`}>
              {tag}
            </button>
          ))}
          {tags.negative.map(tag => (
            <button key={tag} type="button" onClick={() => toggleTag(tag)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${
                selectedTags.includes(tag)
                  ? 'bg-red-100 text-red-800 border border-red-300'
                  : 'bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100'
              }`}>
              {tag}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Comment <span className="text-gray-400">(optional)</span></label>
        <textarea
          rows={3}
          value={comment}
          onChange={e => setComment(e.target.value)}
          maxLength={300}
          placeholder="Anything else you'd like to share?"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
        />
        <p className="text-xs text-gray-400 text-right mt-0.5">{comment.length}/300</p>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex gap-2 justify-end">
        {onCancel && (
          <button type="button" onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
            Cancel
          </button>
        )}
        <button type="submit" disabled={saving || !rating}
          className="px-5 py-2 bg-red-700 text-white text-sm font-medium rounded-lg hover:bg-red-800 transition disabled:opacity-50">
          {saving ? 'Submitting...' : 'Submit Review'}
        </button>
      </div>
    </form>
  )
}
