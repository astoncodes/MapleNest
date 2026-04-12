import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const inputClass = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
const labelClass = "block text-xs font-medium text-gray-500 mb-1"

export default function BulkAddModal({ listingId, existingCount, onSaved, onClose }) {
  const [count, setCount] = useState('')
  const [prefix, setPrefix] = useState('Unit')
  const [roomRental, setRoomRental] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const handleSave = async () => {
    const n = parseInt(count)
    if (!n || n < 1 || n > 50) { setError('Enter a number between 1 and 50.'); return }
    setSaving(true)
    setError(null)
    const units = Array.from({ length: n }, (_, i) => ({
      listing_id: listingId,
      unit_name: `${prefix.trim() || 'Unit'} ${existingCount + i + 1}`,
      room_rental: roomRental,
      sort_order: existingCount + i,
    }))
    const { data, error: err } = await supabase.from('listing_units').insert(units).select()
    if (err) { setError(err.message); setSaving(false); return }
    onSaved(data)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center px-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-modal-title"
        className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <h3 id="bulk-modal-title" className="font-semibold text-gray-900">Bulk Add Units</h3>

        <div>
          <label className={labelClass}>How many units?</label>
          <input className={inputClass} type="number" min={1} max={50} placeholder="e.g. 12"
            value={count} onChange={e => setCount(e.target.value)} />
        </div>

        <div>
          <label className={labelClass}>Name prefix</label>
          <input className={inputClass} placeholder="Unit" maxLength={30}
            value={prefix} onChange={e => setPrefix(e.target.value)} />
          <p className="text-xs text-gray-400 mt-1">
            Will generate: {prefix || 'Unit'} {existingCount + 1}, {prefix || 'Unit'} {existingCount + 2}...
          </p>
        </div>

        <div>
          <label className={labelClass}>Rental type</label>
          <div className="flex gap-2">
            {[{ val: false, label: 'Whole unit' }, { val: true, label: 'Individual rooms' }].map(opt => (
              <button key={String(opt.val)} type="button"
                onClick={() => setRoomRental(opt.val)}
                className={`flex-1 py-2 rounded-lg border text-sm font-medium transition ${roomRental === opt.val ? 'bg-red-700 text-white border-red-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex gap-2">
          <button onClick={handleSave} disabled={saving || !count}
            className="flex-1 bg-red-700 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-red-800 transition disabled:opacity-50">
            {saving ? 'Adding...' : 'Add Units'}
          </button>
          <button onClick={onClose}
            className="flex-1 border border-gray-200 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
