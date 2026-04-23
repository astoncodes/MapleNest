import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const todayLocalISO = () => {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export default function AssignTenantModal({ listingId, renterId, conversationId, onAssigned, onClose }) {
  const [units, setUnits] = useState([])
  const [selectedUnitId, setSelectedUnitId] = useState('')
  const [selectedRoomId, setSelectedRoomId] = useState('')
  const [moveIn, setMoveIn] = useState(todayLocalISO())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const fetchUnits = async () => {
      const { data } = await supabase
        .from('listing_units')
        .select('id, unit_name, status, room_rental, listing_unit_rooms(id, room_name, status)')
        .eq('listing_id', listingId)
        .order('sort_order')
      setUnits(data || [])
    }
    fetchUnits()
  }, [listingId])

  useEffect(() => {
    const handleEscape = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [onClose])

  const selectedUnit = units.find(u => u.id === selectedUnitId)
  const availableRooms = selectedUnit?.room_rental
    ? (selectedUnit.listing_unit_rooms || []).filter(r => r.status === 'available')
    : []

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!selectedUnitId || !moveIn) return
    if (selectedUnit?.room_rental && !selectedRoomId) {
      setError('Please select a room.')
      return
    }

    setSaving(true)
    setError(null)

    const roomId = selectedUnit?.room_rental ? selectedRoomId : null

    const { data: tenancy, error: rpcErr } = await supabase.rpc('assign_tenant', {
      p_listing_id: listingId,
      p_unit_id: selectedUnitId,
      p_room_id: roomId,
      p_renter_id: renterId,
      p_conversation_id: conversationId,
      p_move_in: moveIn,
    })

    if (rpcErr) {
      setError(rpcErr.code === '23505' ? 'This unit/room already has an active tenant.' : rpcErr.message)
      setSaving(false)
      return
    }

    setSaving(false)
    onAssigned(tenancy)
  }

  // Filter to available units (whole-unit) or units with available rooms
  const availableUnits = units.filter(u => {
    if (u.room_rental) {
      return (u.listing_unit_rooms || []).some(r => r.status === 'available')
    }
    return u.status === 'available'
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="assign-tenant-title"
        onClick={e => e.stopPropagation()}
      >
        <h2 id="assign-tenant-title" className="text-lg font-semibold text-gray-900 mb-4">Assign Tenant to Unit</h2>

        {availableUnits.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm text-gray-500">No available units on this listing.</p>
            <button type="button" onClick={onClose}
              className="mt-4 text-sm text-gray-500 hover:text-gray-700">
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Unit</label>
              <select
                value={selectedUnitId}
                onChange={e => { setSelectedUnitId(e.target.value); setSelectedRoomId('') }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                required
              >
                <option value="">Select a unit...</option>
                {availableUnits.map(u => (
                  <option key={u.id} value={u.id}>{u.unit_name}{u.room_rental ? ' (room rental)' : ''}</option>
                ))}
              </select>
            </div>

            {selectedUnit?.room_rental && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Room</label>
                <select
                  value={selectedRoomId}
                  onChange={e => setSelectedRoomId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                  required
                >
                  <option value="">Select a room...</option>
                  {availableRooms.map(r => (
                    <option key={r.id} value={r.id}>{r.room_name}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Move-in date</label>
              <input
                type="date"
                value={moveIn}
                onChange={e => setMoveIn(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                required
              />
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <div className="flex gap-2 justify-end pt-2">
              <button type="button" onClick={onClose}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
                Cancel
              </button>
              <button type="submit" disabled={saving || !selectedUnitId}
                className="px-5 py-2 bg-red-700 text-white text-sm font-medium rounded-lg hover:bg-red-800 transition disabled:opacity-50">
                {saving ? 'Assigning...' : 'Assign Tenant'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
