import { useState } from 'react'
import { Link } from 'react-router-dom'

const formatDate = (d) => d
  ? new Date(d).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
  : null

const formatPrice = (p) => p != null ? `$${Number(p).toLocaleString()}` : '—'

function UnitRow({ unit, basePrice, baseDate, onRequest = () => {}, isOwn }) {
  const price = unit.price ?? basePrice
  const date = unit.available_from ?? baseDate
  const isRented = unit.status === 'rented'

  return (
    <div className={`flex items-center justify-between gap-4 py-3 px-4 rounded-lg border ${
      isRented ? 'bg-gray-50 border-gray-100 opacity-60' : 'bg-white border-gray-100'
    }`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm text-gray-900">{unit.unit_name}</span>
          {unit.floor != null && (
            <span className="text-xs text-gray-500">Floor {unit.floor}</span>
          )}
          {date && !isRented && (
            <span className="text-xs text-gray-500">· Available {formatDate(date)}</span>
          )}
        </div>
        {unit.notes && (
          <p className="text-xs text-gray-400 mt-0.5 truncate">{unit.notes}</p>
        )}
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className="font-bold text-sm text-red-700">{formatPrice(price)}<span className="text-gray-400 font-normal text-xs">/mo</span></span>
        {isRented ? (
          <span className="text-xs text-gray-400 font-medium">Rented</span>
        ) : isOwn ? null : (
          <button
            onClick={() => onRequest({ unitId: unit.id, unitName: unit.unit_name })}
            className="bg-red-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-red-800 transition"
          >
            Request
          </button>
        )}
      </div>
    </div>
  )
}

function RoomRow({ room, unitPrice, basePrice, baseDate, unitId, unitName, onRequest, isOwn }) {
  const price = room.price ?? unitPrice ?? basePrice
  const date = room.available_from ?? baseDate
  const isOccupied = room.status === 'occupied'

  return (
    <div className={`flex items-center justify-between gap-4 py-2.5 px-4 ml-4 rounded-lg border ${
      isOccupied ? 'bg-gray-50 border-gray-100 opacity-60' : 'bg-white border-gray-100'
    }`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm text-gray-800">{room.room_name}</span>
          {date && !isOccupied && (
            <span className="text-xs text-gray-500">· Available {formatDate(date)}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className="font-bold text-sm text-red-700">{formatPrice(price)}<span className="text-gray-400 font-normal text-xs">/mo</span></span>
        {isOccupied ? (
          <span className="text-xs text-gray-400 font-medium">Occupied</span>
        ) : isOwn ? null : (
          <button
            onClick={() => onRequest({ unitId, unitName, roomId: room.id, roomName: room.room_name })}
            className="bg-red-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-red-800 transition"
          >
            Request
          </button>
        )}
      </div>
    </div>
  )
}

function RoomRentalUnit({ unit, basePrice, baseDate, onRequest = () => {}, isOwn }) {
  const [open, setOpen] = useState(true)
  const rooms = [...(unit.listing_unit_rooms || [])].sort((a, b) => a.sort_order - b.sort_order)
  const availableCount = rooms.filter(r => r.status === 'available').length
  const totalCount = rooms.length

  return (
    <div className="space-y-1">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-4 py-3 px-4 rounded-lg border border-gray-100 bg-gray-50 hover:bg-gray-100 transition text-left"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm text-gray-900">{unit.unit_name}</span>
          {unit.floor != null && <span className="text-xs text-gray-500">Floor {unit.floor}</span>}
          <span className="text-xs text-gray-500">
            · {availableCount} of {totalCount} room{totalCount !== 1 ? 's' : ''} available
          </span>
        </div>
        <span className="text-gray-400 text-xs">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="space-y-1">
          {totalCount === 0 && (
            <p className="text-xs text-gray-400 ml-4 py-2">No rooms added yet.</p>
          )}
          {rooms.map(room => (
            <RoomRow
              key={room.id}
              room={room}
              unitPrice={unit.price}
              basePrice={basePrice}
              baseDate={baseDate}
              unitId={unit.id}
              unitName={unit.unit_name}
              onRequest={onRequest}
              isOwn={isOwn}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function UnitSection({ units, basePrice, baseDate, onRequest = () => {}, isOwn, user, listingId }) {
  if (!units || units.length === 0) return null

  const sorted = [...units].sort((a, b) => {
    const aRented = a.room_rental
      ? (a.listing_unit_rooms || []).every(r => r.status === 'occupied')
      : a.status === 'rented'
    const bRented = b.room_rental
      ? (b.listing_unit_rooms || []).every(r => r.status === 'occupied')
      : b.status === 'rented'
    if (aRented !== bRented) return aRented ? 1 : -1
    return a.sort_order - b.sort_order
  })

  const availableCount = units.filter(u => {
    if (u.room_rental) return (u.listing_unit_rooms || []).some(r => r.status === 'available')
    return u.status === 'available'
  }).length

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-800 text-lg">
          Available Units <span className="text-gray-400 font-normal text-base">({availableCount})</span>
        </h2>
        {isOwn && (
          <Link to={`/listings/${listingId}/edit`} className="text-xs text-red-700 font-medium hover:underline">
            Edit units
          </Link>
        )}
      </div>
      <div className="space-y-2">
        {sorted.map(unit => (
          unit.room_rental ? (
            <RoomRentalUnit
              key={unit.id}
              unit={unit}
              basePrice={basePrice}
              baseDate={baseDate}
              onRequest={onRequest}
              isOwn={isOwn}
            />
          ) : (
            <UnitRow
              key={unit.id}
              unit={unit}
              basePrice={basePrice}
              baseDate={baseDate}
              onRequest={onRequest}
              isOwn={isOwn}
            />
          )
        ))}
      </div>
    </div>
  )
}
