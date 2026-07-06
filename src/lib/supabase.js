import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Best-effort decode of a Supabase JWT's payload. Returns null for anything
// that doesn't look like a JWT (including the newer sb_publishable_... keys,
// which are safe by construction).
const decodeJwtRole = (key) => {
  try {
    const payload = key.split('.')[1]
    if (!payload) return null
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))?.role ?? null
  } catch {
    return null
  }
}

const validateConfig = () => {
  if (!supabaseUrl || !supabaseAnonKey) {
    return 'Missing Supabase environment variables. Check your .env file.'
  }
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(supabaseUrl.replace(/\/$/, ''))) {
    return 'VITE_SUPABASE_URL does not look like a Supabase project URL (expected https://<ref>.supabase.co).'
  }
  // Refuse to boot with a service_role key. It grants full database access
  // and Vite inlines it into the public JS bundle — shipping it would hand
  // every visitor admin rights. Use the anon (public) key here, always.
  if (decodeJwtRole(supabaseAnonKey) === 'service_role') {
    return 'VITE_SUPABASE_ANON_KEY is set to a service_role key. That key must never reach the browser — replace it with the anon public key (Supabase Dashboard → Settings → API) and rotate the leaked service key.'
  }
  return null
}

// Don't throw at import time — that blanks the page with an un-styled error.
// App.jsx checks `supabaseConfigError` and renders a friendly config screen.
export const supabaseConfigError = validateConfig()

export const supabase = supabaseConfigError
  ? null
  : createClient(supabaseUrl, supabaseAnonKey)
