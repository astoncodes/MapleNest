// Computes the lowest available price across units and their rooms.
// Falls back to the listing's base price when a unit/room has no price set.
export function resolveLowestPrice(units, basePrice) {
  if (!units?.length) return basePrice
  let lowest = null
  for (const unit of units) {
    if (unit.room_rental) {
      for (const room of unit.listing_unit_rooms || []) {
        if (room.status === 'available') {
          const p = room.price ?? unit.price ?? basePrice
          if (lowest === null || p < lowest) lowest = p
        }
      }
    } else {
      if (unit.status === 'available') {
        const p = unit.price ?? basePrice
        if (lowest === null || p < lowest) lowest = p
      }
    }
  }
  return lowest ?? basePrice
}

// Returns count of available units (whole-unit) or units with ≥1 available room
export function countAvailable(units) {
  if (!units?.length) return 0
  return units.filter(u => {
    if (u.room_rental) {
      return (u.listing_unit_rooms || []).some(r => r.status === 'available')
    }
    return u.status === 'available'
  }).length
}

export default function UnitStrip({ units }) {
  if (!units || units.length === 0) return null

  const available = units.filter(u =>
    u.room_rental
      ? (u.listing_unit_rooms || []).some(r => r.status === 'available')
      : u.status === 'available'
  )

  if (available.length === 0) {
    return (
      <p className="text-xs text-gray-400 mt-1">No units currently available</p>
    )
  }

  const preview = available.slice(0, 3)
  const overflow = available.length - preview.length

  return (
    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
      {preview.map(u => (
        <span
          key={u.id}
          className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full"
        >
          {u.unit_name}
        </span>
      ))}
      {overflow > 0 && (
        <span className="text-xs text-red-700 font-medium">+{overflow} more →</span>
      )}
    </div>
  )
}
