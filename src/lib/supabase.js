import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Don't throw at import time — that blanks the page with an un-styled error.
// App.jsx checks `supabaseConfigError` and renders a friendly config screen.
export const supabaseConfigError = (!supabaseUrl || !supabaseAnonKey)
  ? 'Missing Supabase environment variables. Check your .env file.'
  : null

export const supabase = supabaseConfigError
  ? null
  : createClient(supabaseUrl, supabaseAnonKey)
