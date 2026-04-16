import { useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function TenancyBar({ tenancy, onEnded, onAssignClick }) {
  const [confirming, setConfirming] = useState(false)
  const [moveOut, setMoveOut] = useState(new Date().toISOString().split('T')[0])
  const [ending, setEnding] = useState(false)
  const [error, setError] = useState(null)

  // No tenancy and no assign capability — don't render
  if (!tenancy && !onAssignClick) return null

  // No active/ended tenancy — show assign button
  if (!tenancy) {
    return (
      <div className="bg-gray-50 border-b border-gray-200 px-4 py-2.5 flex items-center justify-between">
        <span className="text-xs text-gray-500">No tenant assigned</span>
        <button
          type="button"
          onClick={onAssignClick}
          className="text-xs font-medium text-red-700 hover:text-red-800"
        >
          Assign to unit
        </button>
      </div>
    )
  }

  const handleEndTenancy = async () => {
    if (!moveOut) return
    setEnding(true)
    setError(null)

    const windowCloses = new Date(moveOut)
    windowCloses.setDate(windowCloses.getDate() + 30)

    // Update tenancy
    const { error: tenancyErr } = await supabase
      .from('tenancies')
      .update({
        status: 'ended',
        move_out: moveOut,
        review_window_closes_at: windowCloses.toISOString(),
      })
      .eq('id', tenancy.id)

    if (tenancyErr) { setError(tenancyErr.message); setEnding(false); return }

    // Flip unit/room back to available
    if (tenancy.room_id) {
      await supabase.from('listing_unit_rooms').update({ status: 'available' }).eq('id', tenancy.room_id)
    } else {
      await supabase.from('listing_units').update({ status: 'available' }).eq('id', tenancy.unit_id)
    }

    setEnding(false)
    setConfirming(false)
    onEnded({ ...tenancy, status: 'ended', move_out: moveOut, review_window_closes_at: windowCloses.toISOString() })
  }

  // Active tenancy
  if (tenancy.status === 'active') {
    const moveInDate = new Date(tenancy.move_in).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })

    return (
      <div className="bg-green-50 border-b border-green-200 px-4 py-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-green-800">
            Tenant: <strong>{tenancy.unit?.unit_name || 'Unit'}</strong>
            {tenancy.room?.room_name ? ` / ${tenancy.room.room_name}` : ''}
            {' '}· since {moveInDate}
          </span>
          {!confirming && (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="text-xs font-medium text-green-700 hover:text-green-900"
            >
              End tenancy
            </button>
          )}
        </div>

        {confirming && (
          <div className="mt-2 flex items-center gap-2">
            <label className="text-xs text-gray-500">Move-out date:</label>
            <input
              type="date"
              value={moveOut}
              onChange={e => setMoveOut(e.target.value)}
              className="border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-red-300"
            />
            <button type="button" onClick={handleEndTenancy} disabled={ending}
              className="text-xs font-medium text-red-700 hover:text-red-800 disabled:opacity-50">
              {ending ? 'Ending...' : 'Confirm'}
            </button>
            <button type="button" onClick={() => setConfirming(false)}
              className="text-xs text-gray-400 hover:text-gray-600">
              Cancel
            </button>
            {error && <span className="text-xs text-red-600">{error}</span>}
          </div>
        )}
      </div>
    )
  }

  // Ended tenancy — handled by ReviewPromptBanner
  return null
}
