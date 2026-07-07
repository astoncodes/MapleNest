import { describe, it, expect, vi, afterEach } from 'vitest'

// The module reads import.meta.env at import time, so each case stubs the
// env and re-imports a fresh copy.
const importFresh = async (url, key) => {
  vi.resetModules()
  vi.stubEnv('VITE_SUPABASE_URL', url)
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', key)
  return await import('./supabase')
}

// JWT with payload {"role":"service_role"} / {"role":"anon"} (signature irrelevant)
const makeJwt = (role) => {
  const b64 = (obj) => btoa(JSON.stringify(obj)).replace(/=+$/, '')
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ iss: 'supabase', role })}.sig`
}

afterEach(() => vi.unstubAllEnvs())

describe('supabase client config validation', () => {
  it('flags missing env vars', async () => {
    const mod = await importFresh('', '')
    expect(mod.supabaseConfigError).toMatch(/Missing Supabase environment variables/)
    expect(mod.supabase).toBeNull()
  })

  it('flags a URL that is not a Supabase project URL', async () => {
    const mod = await importFresh('http://localhost:9999', makeJwt('anon'))
    expect(mod.supabaseConfigError).toMatch(/does not look like a Supabase project URL/)
  })

  it('refuses to boot with a service_role key', async () => {
    const mod = await importFresh('https://abcdefghij.supabase.co', makeJwt('service_role'))
    expect(mod.supabaseConfigError).toMatch(/service_role/)
    expect(mod.supabase).toBeNull()
  })

  it('accepts an anon JWT key', async () => {
    const mod = await importFresh('https://abcdefghij.supabase.co', makeJwt('anon'))
    expect(mod.supabaseConfigError).toBeNull()
    expect(mod.supabase).not.toBeNull()
  })

  it('accepts the newer sb_publishable_ keys (non-JWT)', async () => {
    const mod = await importFresh('https://abcdefghij.supabase.co', 'sb_publishable_abc123')
    expect(mod.supabaseConfigError).toBeNull()
    expect(mod.supabase).not.toBeNull()
  })
})
