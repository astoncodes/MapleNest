import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest'

// jsdom has no IntersectionObserver (HomePage's fade-up effect needs it)
beforeAll(() => {
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

// Boot-level smoke tests: import the real App (no mocks) under different
// env configurations, the same code path main.jsx runs in a browser.
const bootApp = async (url, key) => {
  vi.resetModules()
  vi.stubEnv('VITE_SUPABASE_URL', url)
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', key)
  const { default: App } = await import('./App')
  return render(<MemoryRouter><App /></MemoryRouter>)
}

const anonJwt = (() => {
  const b64 = (o) => btoa(JSON.stringify(o)).replace(/=+$/, '')
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ iss: 'supabase', role: 'anon' })}.sig`
})()

afterEach(() => vi.unstubAllEnvs())

describe('App boot', () => {
  it('renders the config-error screen when env vars are missing', async () => {
    await bootApp('', '')
    expect(screen.getByText(/isn't configured/i)).toBeInTheDocument()
    expect(screen.getByText(/Missing Supabase environment variables/i)).toBeInTheDocument()
  })

  it('renders the config-error screen when a service_role key is supplied', async () => {
    const b64 = (o) => btoa(JSON.stringify(o)).replace(/=+$/, '')
    const serviceJwt = `${b64({ alg: 'HS256' })}.${b64({ role: 'service_role' })}.sig`
    await bootApp('https://abcdefghij.supabase.co', serviceJwt)
    expect(screen.getByText(/isn't configured/i)).toBeInTheDocument()
    expect(screen.getByText(/service_role/i)).toBeInTheDocument()
  })

  it('boots the real app shell with a valid-format anon key', async () => {
    await bootApp('https://abcdefghij.supabase.co', anonJwt)
    // Navbar brand + homepage hero prove routes and providers mounted
    expect((await screen.findAllByText(/Maple/)).length).toBeGreaterThan(0)
    expect(screen.queryByText(/isn't configured/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument()
  })
})
