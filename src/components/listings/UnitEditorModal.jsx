import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const inputClass = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
const labelClass = "block text-xs font-medium text-gray-500 mb-1"

function RoomEditor({ unitId, basePricePlaceholder }) {
  const [rooms, setRooms] = useState([])
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ room_name: '', price: '', available_from: '', status: 'available' })
  const [editingId, setEditingId] = useState(null)

  useEffect(() => { fetchRooms() }, [unitId])

  const fetchRooms = async () => {
    const { data } = await supabase
      .from('listing_unit_rooms')
      .select('*')
      .eq('unit_id', unitId)
      .order('sort_order')
    setRooms(data || [])
  }

  const resetForm = () => {
    setForm({ room_name: '', price: '', available_from: '', status: 'available' })
    setEditingId(null)
  }

  const handleSave = async () => {
    if (!form.room_name.trim()) return
    setSaving(true)
    const payload = {
      unit_id: unitId,
      room_name: form.room_name.trim(),
      price: form.price ? parseInt(form.price) : null,
      available_from: form.available_from || null,
      status: form.status,
      sort_order: editingId ? undefined : rooms.length,
    }
    if (editingId) {
      await supabase.from('listing_unit_rooms').update(payload).eq('id', editingId)
    } else {
      await supabase.from('listing_unit_rooms').insert(payload)
    }
    await fetchRooms()
    resetForm()
    setSaving(false)
  }

  const handleDelete = async (roomId, status) => {
    if (status === 'occupied') return
    await supabase.from('listing_unit_rooms').delete().eq('id', roomId)
    setRooms(prev => prev.filter(r => r.id !== roomId))
  }

  const handleToggleOccupied = async (room) => {
    const next = room.status === 'occupied' ? 'available' : 'occupied'
    await supabase.from('listing_unit_rooms').update({ status: next }).eq('id', room.id)
    setRooms(prev => prev.map(r => r.id === room.id ? { ...r, status: next } : r))
  }

  const startEdit = (room) => {
    setForm({
      room_name: room.room_name,
      price: room.price ? String(room.price) : '',
      available_from: room.available_from || '',
      status: room.status,
    })
    setEditingId(room.id)
  }

  return (
    <div className="mt-4 border-t border-gray-100 pt-4">
      <p className="text-xs font-semibold text-gray-700 mb-3">Rooms</p>
      <div className="space-y-2 mb-3">
        {rooms.map(room => (
          <div key={room.id} className={`flex items-center justify-between gap-2 p-2 rounded-lg border text-xs ${room.status === 'occupied' ? 'bg-gray-50 border-gray-100' : 'bg-white border-gray-200'}`}>
            <span className="font-medium text-gray-800">{room.room_name}</span>
            {room.price && <span className="text-gray-500">${room.price}/mo</span>}
            <div className="flex items-center gap-2 ml-auto">
              <button onClick={() => handleToggleOccupied(room)} className={`text-xs px-2 py-0.5 rounded-full font-medium ${room.status === 'occupied' ? 'bg-gray-200 text-gray-600' : 'bg-green-100 text-green-700'}`}>
                {room.status === 'occupied' ? 'Occupied' : 'Available'}
              </button>
              <button onClick={() => startEdit(room)} className="text-red-700 font-medium">Edit</button>
              <button onClick={() => handleDelete(room.id, room.status)} disabled={room.status === 'occupied'} className="text-gray-400 disabled:opacity-40">✕</button>
            </div>
          </div>
        ))}
      </div>
      <div className="space-y-2 bg-gray-50 rounded-lg p-3">
        <p className="text-xs font-medium text-gray-600">{editingId ? 'Edit room' : 'Add room'}</p>
        <input className={inputClass} placeholder="Room name e.g. Master, Room 1" maxLength={60}
          value={form.room_name} onChange={e => setForm(p => ({ ...p, room_name: e.target.value }))} />
        <div className="grid grid-cols-2 gap-2">
          <input className={inputClass} placeholder={`Price (blank = ${basePricePlaceholder})`} type="number"
            value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))} />
          <input className={inputClass} type="date"
            value={form.available_from} onChange={e => setForm(p => ({ ...p, available_from: e.target.value }))} />
        </div>
        <div className="flex gap-2">
          <button onClick={handleSave} disabled={saving || !form.room_name.trim()}
            className="bg-red-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-red-800 transition disabled:opacity-50">
            {saving ? 'Saving...' : editingId ? 'Update room' : 'Add room'}
          </button>
          {editingId && (
            <button onClick={resetForm} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function UnitEditorModal({ listingId, basePrice, unit, onSaved, onClose }) {
  const isEdit = !!unit
  const [form, setForm] = useState({
    unit_name: unit?.unit_name || '',
    floor: unit?.floor != null ? String(unit.floor) : '',
    price: unit?.price ? String(unit.price) : '',
    available_from: unit?.available_from || '',
    notes: unit?.notes || '',
    room_rental: unit?.room_rental || false,
    status: unit?.status || 'available',
  })
  const [savedUnit, setSavedUnit] = useState(unit || null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const handleSave = async () => {
    if (!form.unit_name.trim()) { setError('Unit name is required.'); return }
    setSaving(true)
    setError(null)
    const payload = {
      listing_id: listingId,
      unit_name: form.unit_name.trim(),
      floor: form.floor ? parseInt(form.floor) : null,
      price: form.price ? parseInt(form.price) : null,
      available_from: form.available_from || null,
      notes: form.notes.trim() || null,
      room_rental: form.room_rental,
      status: form.status,
    }
    let result
    if (isEdit && savedUnit) {
      const { data, error: err } = await supabase.from('listing_units').update(payload).eq('id', savedUnit.id).select().single()
      if (err) { setError(err.message); setSaving(false); return }
      result = data
    } else {
      const { data, error: err } = await supabase.from('listing_units').insert(payload).select().single()
      if (err) { setError(err.message); setSaving(false); return }
      result = data
    }
    setSavedUnit(result)
    setSaving(false)
    if (!form.room_rental) { onSaved(result); onClose() }
    // If room_rental, stay open so landlord can add rooms
  }

  const handleToggleRented = async () => {
    if (!savedUnit) return
    const next = savedUnit.status === 'rented' ? 'available' : 'rented'
    await supabase.from('listing_units').update({ status: next }).eq('id', savedUnit.id)
    setSavedUnit(prev => ({ ...prev, status: next }))
    onSaved({ ...savedUnit, status: next })
  }

  const basePricePlaceholder = basePrice ? `base $${basePrice}` : 'listing base price'

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <h3 className="font-semibold text-gray-900 mb-4">{isEdit ? 'Edit Unit' : 'Add Unit'}</h3>

        <div className="space-y-3">
          <div>
            <label className={labelClass}>Unit name *</label>
            <input className={inputClass} placeholder="e.g. Unit 2A" maxLength={60}
              value={form.unit_name} onChange={e => setForm(p => ({ ...p, unit_name: e.target.value }))} />
          </div>

          <div>
            <label className={labelClass}>Rental type</label>
            <div className="flex gap-2">
              {[{ val: false, label: 'Whole unit' }, { val: true, label: 'Individual rooms' }].map(opt => (
                <button key={String(opt.val)} type="button"
                  onClick={() => setForm(p => ({ ...p, room_rental: opt.val }))}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium transition ${form.room_rental === opt.val ? 'bg-red-700 text-white border-red-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Floor</label>
              <input className={inputClass} type="number" placeholder="e.g. 2"
                value={form.floor} onChange={e => setForm(p => ({ ...p, floor: e.target.value }))} />
            </div>
            <div>
              <label className={labelClass}>Price/mo</label>
              <input className={inputClass} type="number" placeholder={basePricePlaceholder}
                value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))} />
            </div>
          </div>

          <div>
            <label className={labelClass}>Available from</label>
            <input className={inputClass} type="date"
              value={form.available_from} onChange={e => setForm(p => ({ ...p, available_from: e.target.value }))} />
          </div>

          <div>
            <label className={labelClass}>Notes (optional)</label>
            <input className={inputClass} maxLength={300} placeholder="e.g. Corner unit, extra windows"
              value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
          </div>

          {savedUnit && !form.room_rental && (
            <div className="flex items-center justify-between py-2 border-t border-gray-100">
              <span className="text-sm text-gray-600">Mark as rented</span>
              <button onClick={handleToggleRented}
                className={`w-10 h-6 rounded-full transition-colors ${savedUnit.status === 'rented' ? 'bg-red-700' : 'bg-gray-200'}`}>
                <span className={`block w-4 h-4 bg-white rounded-full shadow transform transition-transform mx-1 ${savedUnit.status === 'rented' ? 'translate-x-4' : ''}`} />
              </button>
            </div>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button onClick={handleSave} disabled={saving}
              className="flex-1 bg-red-700 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-red-800 transition disabled:opacity-50">
              {saving ? 'Saving...' : savedUnit ? 'Update unit' : 'Save unit'}
            </button>
            <button onClick={onClose}
              className="flex-1 border border-gray-200 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
              {savedUnit && form.room_rental ? 'Done' : 'Cancel'}
            </button>
          </div>
        </div>

        {savedUnit && form.room_rental && (
          <RoomEditor unitId={savedUnit.id} basePricePlaceholder={basePricePlaceholder} />
        )}
      </div>
    </div>
  )
}
