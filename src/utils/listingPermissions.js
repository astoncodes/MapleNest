const normalizeRole = (role) => {
  const normalized = String(role || '').trim().toLowerCase()
  return normalized === 'admin' ? 'admin' : normalized === 'landlord' ? 'landlord' : ''
}

export const canModifyListing = (user, listing) => {
  if (!user || !listing) return false

  const role = normalizeRole(
    typeof user.role === 'string'
      ? user.role
      : user.profile?.role
  )

  return user.id === listing.landlord_id && role === 'landlord'
}
