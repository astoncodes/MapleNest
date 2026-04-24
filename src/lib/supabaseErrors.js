// Translates Supabase / Postgres / PostgREST / Storage errors into copy that
// is safe to show to end users. Falls back to a generic message so we never
// leak raw details like "new row violates row-level security policy for
// table ..." or internal column names.

const FRIENDLY_MESSAGES = {
  // Postgres error codes
  '23505': 'That already exists. Please try something different.',
  '23503': 'Referenced item no longer exists. Please refresh and try again.',
  '23514': 'One of the fields is not valid.',
  '42501': "You don't have permission to do that.",
  // PostgREST
  'PGRST116': 'We could not find what you were looking for.',
  'PGRST301': 'Your session has expired. Please log back in.',
}

// Match raw Supabase/Postgres message fragments to friendly copy. Keys are
// lowercased substrings; the first match wins.
const MESSAGE_FRAGMENTS = [
  ['row-level security', "You don't have permission to do that."],
  ['jwt expired', 'Your session has expired. Please log back in.'],
  ['invalid jwt', 'Your session has expired. Please log back in.'],
  ['network', 'Network error. Check your connection and try again.'],
  ['failed to fetch', 'Network error. Check your connection and try again.'],
  ['payload too large', 'That file is too large. Please choose a smaller one.'],
  ['exceeded the maximum allowed size', 'That file is too large. Please choose a smaller one.'],
  ['duplicate', 'That already exists. Please try something different.'],
]

export function mapSupabaseError(err, fallback = 'Something went wrong. Please try again.') {
  if (!err) return fallback
  if (typeof err === 'string') return err

  if (err.code && FRIENDLY_MESSAGES[err.code]) return FRIENDLY_MESSAGES[err.code]

  const raw = (err.message || err.error_description || '').toLowerCase()
  for (const [fragment, friendly] of MESSAGE_FRAGMENTS) {
    if (raw.includes(fragment)) return friendly
  }

  return fallback
}
