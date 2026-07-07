import { describe, it, expect } from 'vitest'
import { canModifyListing } from './listingPermissions'

const landlord = { id: 'u1', role: 'landlord' }
const renter = { id: 'u2', role: 'renter' }
const admin = { id: 'u3', role: 'admin' }

describe('canModifyListing', () => {
  it('rejects missing user or listing', () => {
    expect(canModifyListing(null, { landlord_id: 'u1' })).toBe(false)
    expect(canModifyListing(landlord, null)).toBe(false)
  })

  it('never allows modifying someone else\'s listing, regardless of role', () => {
    expect(canModifyListing(landlord, { landlord_id: 'other', property_type: 'apartment' })).toBe(false)
    expect(canModifyListing(admin, { landlord_id: 'other', property_type: 'apartment' })).toBe(false)
    expect(canModifyListing(renter, { landlord_id: 'other', property_type: 'sublease' })).toBe(false)
  })

  it('allows landlords to modify their own listings', () => {
    expect(canModifyListing(landlord, { landlord_id: 'u1', property_type: 'apartment' })).toBe(true)
  })

  it('allows renters to modify only their own subleases', () => {
    expect(canModifyListing(renter, { landlord_id: 'u2', property_type: 'sublease' })).toBe(true)
    expect(canModifyListing(renter, { landlord_id: 'u2', property_type: 'apartment' })).toBe(false)
  })

  it('reads role from profile when top-level role is absent', () => {
    const nested = { id: 'u5', profile: { role: 'landlord' } }
    expect(canModifyListing(nested, { landlord_id: 'u5', property_type: 'house' })).toBe(true)
  })

  it('treats unknown / spoofed roles as renter', () => {
    const weird = { id: 'u6', role: 'ADMIN ' } // trims + lowercases to admin — allowed
    expect(canModifyListing(weird, { landlord_id: 'u6', property_type: 'house' })).toBe(true)
    const junk = { id: 'u7', role: 'superuser' }
    expect(canModifyListing(junk, { landlord_id: 'u7', property_type: 'house' })).toBe(false)
  })
})
