import { describe, it, expect } from 'vitest'
import { mapSupabaseError } from './supabaseErrors'

describe('mapSupabaseError', () => {
  it('returns the fallback for null/undefined errors', () => {
    expect(mapSupabaseError(null)).toBe('Something went wrong. Please try again.')
    expect(mapSupabaseError(undefined, 'Custom fallback')).toBe('Custom fallback')
  })

  it('passes plain strings through unchanged', () => {
    expect(mapSupabaseError('Already readable copy')).toBe('Already readable copy')
  })

  it('maps known Postgres error codes', () => {
    expect(mapSupabaseError({ code: '23505', message: 'duplicate key value violates unique constraint "x"' }))
      .toBe('That already exists. Please try something different.')
    expect(mapSupabaseError({ code: '42501', message: 'permission denied for table listings' }))
      .toBe("You don't have permission to do that.")
  })

  it('never leaks raw RLS violation text', () => {
    const out = mapSupabaseError({ message: 'new row violates row-level security policy for table "profiles"' })
    expect(out).toBe("You don't have permission to do that.")
    expect(out).not.toMatch(/row-level|profiles/)
  })

  it('maps expired-session messages', () => {
    expect(mapSupabaseError({ message: 'JWT expired' }))
      .toBe('Your session has expired. Please log back in.')
  })

  it('maps network failures', () => {
    expect(mapSupabaseError({ message: 'TypeError: Failed to fetch' }))
      .toBe('Network error. Check your connection and try again.')
  })

  it('falls back for unknown errors without leaking internals', () => {
    expect(mapSupabaseError({ message: 'some internal pg detail xyz', code: 'XX000' }, 'Could not save.'))
      .toBe('Could not save.')
  })
})
