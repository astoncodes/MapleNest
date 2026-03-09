export const canModifyListing = (user, listing) => {
  return Boolean(user && listing && user.id === listing.landlord_id && user.role === 'landlord')
}

