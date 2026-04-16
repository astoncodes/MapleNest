import { useState } from 'react'
import ReviewForm from './ReviewForm'

export default function ReviewPromptBanner({
  tenancy,
  currentUserId,
  hasSubmittedReview,
  reviewWindowClosesAt,
  listingTitle,
  onReviewSubmitted,
}) {
  const [showForm, setShowForm] = useState(false)

  // Don't show if already reviewed
  if (hasSubmittedReview) {
    const dateStr = reviewWindowClosesAt
      ? new Date(reviewWindowClosesAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
      : null
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-500">
        Your review has been submitted. It will become visible once the other party also submits
        {dateStr ? `, or after the review window closes on ${dateStr}.` : '.'}
      </div>
    )
  }

  // Don't show if window expired
  if (reviewWindowClosesAt && new Date(reviewWindowClosesAt) < new Date()) return null

  // Don't show if tenancy not ended
  if (tenancy.status !== 'ended') return null

  const isRenter = currentUserId === tenancy.renter_id
  const revieweeId = isRenter ? tenancy.landlord_id : tenancy.renter_id
  const reviewingRole = isRenter ? 'landlord' : 'renter'

  if (showForm) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">
          Leave a review{listingTitle ? ` for ${listingTitle}` : ''}
        </h3>
        <ReviewForm
          tenancyId={tenancy.id}
          reviewerId={currentUserId}
          revieweeId={revieweeId}
          listingId={tenancy.listing_id}
          reviewingRole={reviewingRole}
          onSubmitted={() => {
            setShowForm(false)
            onReviewSubmitted()
          }}
          onCancel={() => setShowForm(false)}
        />
      </div>
    )
  }

  const moveOutDate = tenancy.move_out
    ? new Date(tenancy.move_out).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center justify-between">
      <p className="text-sm text-amber-800">
        {isRenter
          ? `Your stay at ${listingTitle || 'this listing'} ended${moveOutDate ? ` on ${moveOutDate}` : ''}. Leave a review.`
          : `Tenancy ended${moveOutDate ? ` ${moveOutDate}` : ''}. Leave a review.`
        }
      </p>
      <button
        type="button"
        onClick={() => setShowForm(true)}
        className="text-sm font-medium text-amber-800 hover:text-amber-900 whitespace-nowrap ml-2"
      >
        Write review
      </button>
    </div>
  )
}
