const normalizeRole = (role) => {
  const normalized = String(role || '').trim().toLowerCase()
  return normalized === 'admin' ? 'admin' : normalized === 'landlord' ? 'landlord' : 'renter'
}

export const canModifyListing = (user, listing) => {
  if (!user || !listing) return false

  const role = normalizeRole(
    typeof user.role === 'string'
      ? user.role
      : user.profile?.role
  )

  if (user.id !== listing.landlord_id) return false
  if (role === 'landlord' || role === 'admin') return true
  if (role === 'renter' && listing.property_type === 'sublease') return true
  return false
}
