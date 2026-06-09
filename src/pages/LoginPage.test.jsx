import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import LoginPage from './LoginPage'

const mockSignIn = vi.fn()
const mockNavigate = vi.fn()

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ signIn: mockSignIn }),
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useNavigate: () => mockNavigate }
})

function renderPage() {
  return render(<MemoryRouter><LoginPage /></MemoryRouter>)
}

beforeEach(() => {
  mockSignIn.mockReset()
  mockNavigate.mockReset()
})

// ─── rendering ─────────────────────────────────────────────────────────────

describe('LoginPage — rendering', () => {
  it('renders email, password fields and sign-in button', () => {
    renderPage()
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('has links to signup and forgot-password pages', () => {
    renderPage()
    expect(screen.getByRole('link', { name: /sign up free/i })).toHaveAttribute('href', '/signup')
    expect(screen.getByRole('link', { name: /forgot password/i })).toHaveAttribute('href', '/forgot-password')
  })
})

// ─── happy path ────────────────────────────────────────────────────────────

describe('LoginPage — successful login', () => {
  it('navigates to /listings on success', async () => {
    mockSignIn.mockResolvedValue({ data: {}, error: null })
    renderPage()
    await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'user@example.com')
    await userEvent.type(screen.getByPlaceholderText('••••••••'), 'password')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/listings'))
  })

  it('calls signIn with the entered credentials', async () => {
    mockSignIn.mockResolvedValue({ data: {}, error: null })
    renderPage()
    await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'me@example.com')
    await userEvent.type(screen.getByPlaceholderText('••••••••'), 'mypassword')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => expect(mockSignIn).toHaveBeenCalledWith('me@example.com', 'mypassword'))
  })
})

// ─── error handling ────────────────────────────────────────────────────────

describe('LoginPage — error handling', () => {
  it('shows the supabase error message on bad credentials', async () => {
    mockSignIn.mockResolvedValue({ error: { message: 'Invalid login credentials' } })
    renderPage()
    await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'a@b.com')
    await userEvent.type(screen.getByPlaceholderText('••••••••'), 'wrongpass')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => expect(screen.getByText('Invalid login credentials')).toBeInTheDocument())
  })

  it('does not navigate when login fails', async () => {
    mockSignIn.mockResolvedValue({ error: { message: 'Invalid login credentials' } })
    renderPage()
    await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'a@b.com')
    await userEvent.type(screen.getByPlaceholderText('••••••••'), 'wrongpass')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => expect(screen.getByText('Invalid login credentials')).toBeInTheDocument())
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('shows error when signIn throws (network failure)', async () => {
    mockSignIn.mockRejectedValue(new Error('Network error'))
    renderPage()
    await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'a@b.com')
    await userEvent.type(screen.getByPlaceholderText('••••••••'), 'pass')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => expect(screen.getByText('Network error')).toBeInTheDocument())
  })

  it('clears the previous error on the next submit attempt', async () => {
    mockSignIn
      .mockResolvedValueOnce({ error: { message: 'Wrong password' } })
      .mockResolvedValueOnce({ data: {}, error: null })
    renderPage()
    await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'a@b.com')
    await userEvent.type(screen.getByPlaceholderText('••••••••'), 'pass')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => expect(screen.getByText('Wrong password')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => expect(screen.queryByText('Wrong password')).not.toBeInTheDocument())
  })
})

// ─── loading state ─────────────────────────────────────────────────────────

describe('LoginPage — loading state', () => {
  it('disables button and shows "Signing in..." while pending', async () => {
    let resolve
    mockSignIn.mockReturnValue(new Promise(r => { resolve = r }))
    renderPage()
    await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'a@b.com')
    await userEvent.type(screen.getByPlaceholderText('••••••••'), 'pass')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
    expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled()
    resolve({ error: null })
  })

  it('re-enables the button after an error', async () => {
    mockSignIn.mockResolvedValue({ error: { message: 'Bad credentials' } })
    renderPage()
    await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'a@b.com')
    await userEvent.type(screen.getByPlaceholderText('••••••••'), 'pass')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /sign in/i })).not.toBeDisabled())
  })
})
