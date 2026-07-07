import { useState } from 'react'
import { supabase } from '../../lib/supabase'

const todayLocalISO = () => {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export default function TenancyBar({ tenancy, onEnded, onAssignClick }) {
  const [confirming, setConfirming] = useState(false)
  const [moveOut, setMoveOut] = useState(todayLocalISO())
  const [ending, setEnding] = useState(false)
  const [error, setError] = useState(null)

  // No tenancy and no assign capability — don't render
  if (!tenancy && !onAssignClick) return null

  // No active/ended tenancy — show assign button
  if (!tenancy) {
    return (
      <div className="bg-surface border-b border-hairline px-4 py-2.5 flex items-center justify-between">
        <span className="text-xs text-steel">No tenant assigned</span>
        <button
          type="button"
          onClick={onAssignClick}
          className="text-xs font-medium text-maple-dark hover:text-maple-dark"
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

    const { data: updated, error: rpcErr } = await supabase.rpc('end_tenancy', {
      p_tenancy_id: tenancy.id,
      p_move_out: moveOut,
    })

    if (rpcErr) { setError(rpcErr.message); setEnding(false); return }

    setEnding(false)
    setConfirming(false)
    onEnded({ ...tenancy, ...updated })
  }

  // Active tenancy
  if (tenancy.status === 'active') {
    const moveInDate = new Date(tenancy.move_in).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })

    return (
      <div className="bg-maple-light border-b border-maple-muted px-4 py-2.5">
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
              className="text-xs font-medium text-maple-dark hover:text-green-900"
            >
              End tenancy
            </button>
          )}
        </div>

        {confirming && (
          <div className="mt-2 flex items-center gap-2">
            <label className="text-xs text-steel">Move-out date:</label>
            <input
              type="date"
              value={moveOut}
              onChange={e => setMoveOut(e.target.value)}
              className="border border-hairline rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-maple/30"
            />
            <button type="button" onClick={handleEndTenancy} disabled={ending}
              className="text-xs font-medium text-maple-dark hover:text-maple-dark disabled:opacity-50">
              {ending ? 'Ending...' : 'Confirm'}
            </button>
            <button type="button" onClick={() => setConfirming(false)}
              className="text-xs text-stone hover:text-steel">
              Cancel
            </button>
            {error && <span className="text-xs text-maple-dark">{error}</span>}
          </div>
        )}
      </div>
    )
  }

  // Ended tenancy — handled by ReviewPromptBanner
  return null
}
