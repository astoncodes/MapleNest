import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import ResetPasswordPage from './ResetPasswordPage'

const mockNavigate = vi.fn()
let authStateCallback = null

const { mockUpdateUser, mockOnAuthStateChange } = vi.hoisted(() => ({
  mockUpdateUser: vi.fn(),
  mockOnAuthStateChange: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      updateUser: mockUpdateUser,
      onAuthStateChange: mockOnAuthStateChange,
    },
  },
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useNavigate: () => mockNavigate }
})

beforeEach(() => {
  mockUpdateUser.mockReset()
  mockNavigate.mockReset()
  mockOnAuthStateChange.mockImplementation((cb) => {
    authStateCallback = cb
    return { data: { subscription: { unsubscribe: vi.fn() } } }
  })
})

afterEach(() => {
  vi.useRealTimers()
})

function renderPage() {
  return render(<MemoryRouter><ResetPasswordPage /></MemoryRouter>)
}

function firePasswordRecovery() {
  act(() => authStateCallback('PASSWORD_RECOVERY', null))
}

// ─── link verification (need fake timers) ──────────────────────────────────

describe('ResetPasswordPage — link verification', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('shows "Verifying your link..." on initial load', () => {
    renderPage()
    expect(screen.getByText(/verifying your link/i)).toBeInTheDocument()
  })

  it('shows the expired state after the 5s timeout fires', async () => {
    renderPage()
    await act(async () => vi.advanceTimersByTime(5000))
    expect(screen.getByText(/reset link expired or invalid/i)).toBeInTheDocument()
  })

  it('does not show expired state before 5s elapses', async () => {
    renderPage()
    await act(async () => vi.advanceTimersByTime(4999))
    expect(screen.queryByText(/reset link expired or invalid/i)).not.toBeInTheDocument()
    expect(screen.getByText(/verifying your link/i)).toBeInTheDocument()
  })

  it('does not expire if PASSWORD_RECOVERY fires before the timeout', async () => {
    renderPage()
    firePasswordRecovery()
    await act(async () => vi.advanceTimersByTime(5000))
    expect(screen.queryByText(/reset link expired or invalid/i)).not.toBeInTheDocument()
  })

  it('expired screen has a link to request a new reset link', async () => {
    renderPage()
    await act(async () => vi.advanceTimersByTime(5000))
    expect(screen.getByRole('link', { name: /request a new reset link/i }))
      .toHaveAttribute('href', '/forgot-password')
  })
})

// ─── form appears after valid link (real timers) ────────────────────────────

describe('ResetPasswordPage — password form', () => {
  it('shows the form when PASSWORD_RECOVERY event fires', async () => {
    renderPage()
    firePasswordRecovery()
    await screen.findByText(/set a new password/i)
  })
})

// ─── password validation ────────────────────────────────────────────────────

describe('ResetPasswordPage — password validation', () => {
  async function setup() {
    renderPage()
    firePasswordRecovery()
    await screen.findByText(/set a new password/i)
  }

  it('shows error when password is too short', async () => {
    await setup()
    await userEvent.type(screen.getByPlaceholderText('Min. 6 characters'), 'abc')
    await userEvent.type(screen.getByPlaceholderText('Repeat your new password'), 'abc')
    // Submit directly — the button is disabled when < 6 chars, but handleSubmit
    // still contains the guard so we verify it via form submission.
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.submit(screen.getByPlaceholderText('Min. 6 characters').closest('form'))
    await waitFor(() => expect(screen.getByText(/at least 6 characters/i)).toBeInTheDocument())
    expect(mockUpdateUser).not.toHaveBeenCalled()
  })

  it('shows inline mismatch hint and keeps submit disabled when passwords differ', async () => {
    await setup()
    await userEvent.type(screen.getByPlaceholderText('Min. 6 characters'), 'password1')
    await userEvent.type(screen.getByPlaceholderText('Repeat your new password'), 'password2')
    expect(screen.getByText(/don't match/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /update password/i })).toBeDisabled()
    expect(mockUpdateUser).not.toHaveBeenCalled()
  })

  it('shows inline mismatch hint while typing confirm password', async () => {
    await setup()
    await userEvent.type(screen.getByPlaceholderText('Min. 6 characters'), 'password1')
    await userEvent.type(screen.getByPlaceholderText('Repeat your new password'), 'password2')
    expect(screen.getByText(/don't match/i)).toBeInTheDocument()
  })

  it('shows inline match confirmation when passwords match', async () => {
    await setup()
    await userEvent.type(screen.getByPlaceholderText('Min. 6 characters'), 'password1')
    await userEvent.type(screen.getByPlaceholderText('Repeat your new password'), 'password1')
    expect(screen.getByText(/passwords match/i)).toBeInTheDocument()
  })

  it('submit button is disabled when passwords do not match', async () => {
    await setup()
    await userEvent.type(screen.getByPlaceholderText('Min. 6 characters'), 'password1')
    await userEvent.type(screen.getByPlaceholderText('Repeat your new password'), 'different')
    expect(screen.getByRole('button', { name: /update password/i })).toBeDisabled()
  })

  it('submit button is disabled when password is too short', async () => {
    await setup()
    await userEvent.type(screen.getByPlaceholderText('Min. 6 characters'), 'abc')
    await userEvent.type(screen.getByPlaceholderText('Repeat your new password'), 'abc')
    expect(screen.getByRole('button', { name: /update password/i })).toBeDisabled()
  })
})

// ─── successful update ──────────────────────────────────────────────────────

describe('ResetPasswordPage — successful password update', () => {
  // shouldAdvanceTime: true lets waitFor/findByText work while we still
  // control the 3-second redirect timer manually.
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))

  async function setup() {
    renderPage()
    firePasswordRecovery()
    await screen.findByText(/set a new password/i)
    await userEvent.type(screen.getByPlaceholderText('Min. 6 characters'), 'newpass1')
    await userEvent.type(screen.getByPlaceholderText('Repeat your new password'), 'newpass1')
  }

  it('shows the success state', async () => {
    mockUpdateUser.mockResolvedValue({ error: null })
    await setup()
    await userEvent.click(screen.getByRole('button', { name: /update password/i }))
    await waitFor(() => expect(screen.getByText(/password updated/i)).toBeInTheDocument())
  })

  it('redirects to /login after 3s on success', async () => {
    mockUpdateUser.mockResolvedValue({ error: null })
    await setup()
    await userEvent.click(screen.getByRole('button', { name: /update password/i }))
    await waitFor(() => screen.getByText(/password updated/i))
    await act(async () => vi.advanceTimersByTime(3000))
    expect(mockNavigate).toHaveBeenCalledWith('/login')
  })
})

// ─── error handling ────────────────────────────────────────────────────────

describe('ResetPasswordPage — error handling', () => {
  async function setup() {
    renderPage()
    firePasswordRecovery()
    await screen.findByText(/set a new password/i)
    await userEvent.type(screen.getByPlaceholderText('Min. 6 characters'), 'newpass1')
    await userEvent.type(screen.getByPlaceholderText('Repeat your new password'), 'newpass1')
  }

  it('shows supabase error when updateUser fails', async () => {
    mockUpdateUser.mockResolvedValue({ error: { message: 'Token expired' } })
    await setup()
    await userEvent.click(screen.getByRole('button', { name: /update password/i }))
    await waitFor(() => expect(screen.getByText('Token expired')).toBeInTheDocument())
  })

  it('does not navigate when updateUser fails', async () => {
    mockUpdateUser.mockResolvedValue({ error: { message: 'Token expired' } })
    await setup()
    await userEvent.click(screen.getByRole('button', { name: /update password/i }))
    await waitFor(() => screen.getByText('Token expired'))
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
