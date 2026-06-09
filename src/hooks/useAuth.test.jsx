import { render, screen, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AuthProvider, useAuth } from './useAuth'

const { mockSignUp, mockSignIn, mockSignOut, mockOnAuthStateChange, mockFrom } = vi.hoisted(() => {
  const mockFrom = vi.fn()
  return {
    mockSignUp: vi.fn(),
    mockSignIn: vi.fn(),
    mockSignOut: vi.fn(),
    mockOnAuthStateChange: vi.fn(),
    mockFrom,
  }
})

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      signUp: mockSignUp,
      signInWithPassword: mockSignIn,
      signOut: mockSignOut,
      onAuthStateChange: mockOnAuthStateChange,
    },
    from: mockFrom,
  },
}))

const defaultSubscription = { data: { subscription: { unsubscribe: vi.fn() } } }

function profileChain(profileData, profileError = null) {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: profileData, error: profileError }),
      }),
    }),
    insert: () => Promise.resolve({ data: null, error: null }),
  }
}

function TestConsumer() {
  const { signUp, signIn, signOut, user, loading, role, isLandlord } = useAuth()
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="role">{role}</span>
      <span data-testid="isLandlord">{String(isLandlord)}</span>
      <span data-testid="user">{user ? user.email : 'none'}</span>
      <button onClick={() => signUp('a@b.com', 'pass', 'renter')}>signup</button>
      <button onClick={() => signIn('a@b.com', 'pass')}>signin</button>
      <button onClick={() => signOut()}>signout</button>
    </div>
  )
}

function renderWithAuth() {
  return render(<AuthProvider><TestConsumer /></AuthProvider>)
}

beforeEach(() => {
  vi.resetAllMocks()
  mockOnAuthStateChange.mockReturnValue(defaultSubscription)
  mockFrom.mockImplementation(() => profileChain(null))
})

// ─── normalizeRole (exercised through signUp options) ───────────────────────

describe('normalizeRole', () => {
  const cases = [
    ['renter', 'renter'],
    ['landlord', 'landlord'],
    ['LANDLORD', 'landlord'],
    ['Landlord', 'landlord'],
    ['admin', 'admin'],
    ['ADMIN', 'admin'],         // admin is case-normalised
    ['superuser', 'renter'],    // unknown → renter
    ['', 'renter'],             // empty → renter
  ]

  it.each(cases)('role %j normalises to %j', async (input, expected) => {
    mockSignUp.mockResolvedValue({ data: { user: null, session: null }, error: null })

    function RoleConsumer() {
      const { signUp } = useAuth()
      return <button onClick={() => signUp('a@b.com', 'pass', input)}>go</button>
    }
    render(<AuthProvider><RoleConsumer /></AuthProvider>)

    await act(async () => { screen.getByText('go').click() })

    expect(mockSignUp.mock.calls[0][0].options.data.role).toBe(expected)
  })
})

// ─── signUp ────────────────────────────────────────────────────────────────

describe('signUp', () => {
  it('passes emailRedirectTo ending with /login', async () => {
    mockSignUp.mockResolvedValue({ data: { user: null, session: null }, error: null })
    renderWithAuth()

    await act(async () => { screen.getByText('signup').click() })

    const opts = mockSignUp.mock.calls[0][0].options
    expect(opts.emailRedirectTo).toMatch(/\/login$/)
  })

  it('returns the supabase error to the caller', async () => {
    const err = { message: 'Email already registered' }
    mockSignUp.mockResolvedValue({ data: { user: null, session: null }, error: err })

    let result
    function CaptureConsumer() {
      const { signUp } = useAuth()
      return <button onClick={async () => { result = await signUp('a@b.com', 'pass', 'renter') }}>go</button>
    }
    render(<AuthProvider><CaptureConsumer /></AuthProvider>)

    await act(async () => { screen.getByText('go').click() })

    expect(result.error).toEqual(err)
  })
})

// ─── enrichUser / onAuthStateChange ────────────────────────────────────────

describe('enrichUser — profile resolution', () => {
  function fireAuthEvent(sessionUser) {
    const cb = mockOnAuthStateChange.mock.calls[0][0]
    act(() => cb('SIGNED_IN', sessionUser ? { user: sessionUser } : null))
  }

  it('sets role from existing profile', async () => {
    mockFrom.mockImplementation(() =>
      profileChain({ id: '1', email: 'a@b.com', role: 'landlord' })
    )
    renderWithAuth()

    fireAuthEvent({ id: '1', email: 'a@b.com', user_metadata: { role: 'renter' } })

    await screen.findByText('landlord', { selector: '[data-testid="role"]' })
    expect(screen.getByTestId('isLandlord').textContent).toBe('true')
  })

  it('falls back to metadata role when profile has no record (inserts new row)', async () => {
    const insertFn = vi.fn().mockResolvedValue({ data: null, error: null })
    mockFrom.mockImplementation(() => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
      }),
      insert: insertFn,
    }))
    renderWithAuth()

    fireAuthEvent({ id: '2', email: 'new@b.com', user_metadata: { role: 'landlord' } })

    await screen.findByText('landlord', { selector: '[data-testid="role"]' })
    expect(insertFn).toHaveBeenCalledWith(
      expect.objectContaining({ id: '2', email: 'new@b.com', role: 'landlord' })
    )
  })

  it('ignores PGRST116 (no rows) and treats it as no profile', async () => {
    mockFrom.mockImplementation(() =>
      profileChain(null, { code: 'PGRST116', message: 'no rows' })
    )
    renderWithAuth()

    fireAuthEvent({ id: '3', email: 'c@b.com', user_metadata: { role: 'renter' } })

    await screen.findByText('renter', { selector: '[data-testid="role"]' })
  })

  it('recovers gracefully when the profiles query throws an unexpected error', async () => {
    mockFrom.mockImplementation(() =>
      profileChain(null, { code: '42P01', message: 'table missing' })
    )
    renderWithAuth()

    fireAuthEvent({ id: '4', email: 'd@b.com', user_metadata: { role: 'landlord' } })

    // falls back to metadata role — does not crash
    await screen.findByText('landlord', { selector: '[data-testid="role"]' })
  })

  it('sets user to null and role to renter when session is null', async () => {
    renderWithAuth()
    fireAuthEvent(null)

    await screen.findByText('renter', { selector: '[data-testid="role"]' })
    expect(screen.getByTestId('user').textContent).toBe('none')
  })
})

// ─── signIn / signOut ──────────────────────────────────────────────────────

describe('signIn', () => {
  it('calls signInWithPassword with email and password', async () => {
    mockSignIn.mockResolvedValue({ data: {}, error: null })
    renderWithAuth()

    await act(async () => { screen.getByText('signin').click() })

    expect(mockSignIn).toHaveBeenCalledWith({ email: 'a@b.com', password: 'pass' })
  })
})

describe('signOut', () => {
  it('calls supabase.auth.signOut', async () => {
    mockSignOut.mockResolvedValue({ error: null })
    renderWithAuth()

    await act(async () => { screen.getByText('signout').click() })

    expect(mockSignOut).toHaveBeenCalledTimes(1)
  })
})

// ─── subscription cleanup ──────────────────────────────────────────────────

describe('AuthProvider', () => {
  it('unsubscribes from auth changes on unmount', () => {
    const unsubscribe = vi.fn()
    mockOnAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe } } })

    const { unmount } = renderWithAuth()
    unmount()

    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('throws when useAuth is called outside AuthProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<TestConsumer />)).toThrow('useAuth must be used within AuthProvider')
    spy.mockRestore()
  })
})
