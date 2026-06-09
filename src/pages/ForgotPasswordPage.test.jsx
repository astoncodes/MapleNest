import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import ForgotPasswordPage from './ForgotPasswordPage'

const { mockResetPasswordForEmail } = vi.hoisted(() => ({
  mockResetPasswordForEmail: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { resetPasswordForEmail: mockResetPasswordForEmail },
  },
}))

function renderPage() {
  return render(<MemoryRouter><ForgotPasswordPage /></MemoryRouter>)
}

beforeEach(() => mockResetPasswordForEmail.mockReset())

// ─── rendering ─────────────────────────────────────────────────────────────

describe('ForgotPasswordPage — rendering', () => {
  it('renders the email field and send button', () => {
    renderPage()
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument()
  })

  it('has a link back to the login page', () => {
    renderPage()
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login')
  })
})

// ─── happy path ────────────────────────────────────────────────────────────

describe('ForgotPasswordPage — successful send', () => {
  it('shows success state after email is sent', async () => {
    mockResetPasswordForEmail.mockResolvedValue({ error: null })
    renderPage()
    await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'me@example.com')
    await userEvent.click(screen.getByRole('button', { name: /send reset link/i }))
    await waitFor(() => expect(screen.getByText(/check your email/i)).toBeInTheDocument())
  })

  it('shows the submitted email in the success message', async () => {
    mockResetPasswordForEmail.mockResolvedValue({ error: null })
    renderPage()
    await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'specific@example.com')
    await userEvent.click(screen.getByRole('button', { name: /send reset link/i }))
    await waitFor(() => expect(screen.getByText('specific@example.com')).toBeInTheDocument())
  })

  it('passes redirectTo pointing to /reset-password', async () => {
    mockResetPasswordForEmail.mockResolvedValue({ error: null })
    renderPage()
    await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'me@example.com')
    await userEvent.click(screen.getByRole('button', { name: /send reset link/i }))
    await waitFor(() => expect(mockResetPasswordForEmail).toHaveBeenCalledWith(
      'me@example.com',
      expect.objectContaining({ redirectTo: expect.stringContaining('/reset-password') })
    ))
  })

  it('"Try a different email" button resets back to the form', async () => {
    mockResetPasswordForEmail.mockResolvedValue({ error: null })
    renderPage()
    await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'me@example.com')
    await userEvent.click(screen.getByRole('button', { name: /send reset link/i }))
    await waitFor(() => screen.getByText(/check your email/i))

    await userEvent.click(screen.getByRole('button', { name: /try a different email/i }))
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument()
  })
})

// ─── error handling ────────────────────────────────────────────────────────

describe('ForgotPasswordPage — error handling', () => {
  it('shows the supabase error message', async () => {
    mockResetPasswordForEmail.mockResolvedValue({ error: { message: 'Email not found' } })
    renderPage()
    await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'unknown@example.com')
    await userEvent.click(screen.getByRole('button', { name: /send reset link/i }))
    await waitFor(() => expect(screen.getByText('Email not found')).toBeInTheDocument())
  })

  it('shows rate-limit error from Supabase', async () => {
    mockResetPasswordForEmail.mockResolvedValue({ error: { message: 'For security purposes, you can only request this after 54 seconds.' } })
    renderPage()
    await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'a@b.com')
    await userEvent.click(screen.getByRole('button', { name: /send reset link/i }))
    await waitFor(() => expect(screen.getByText(/security purposes/i)).toBeInTheDocument())
  })

  it('does not show success state when an error occurs', async () => {
    mockResetPasswordForEmail.mockResolvedValue({ error: { message: 'Rate limited' } })
    renderPage()
    await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'a@b.com')
    await userEvent.click(screen.getByRole('button', { name: /send reset link/i }))
    await waitFor(() => expect(screen.getByText('Rate limited')).toBeInTheDocument())
    expect(screen.queryByText(/check your email/i)).not.toBeInTheDocument()
  })
})

// ─── loading state ─────────────────────────────────────────────────────────

describe('ForgotPasswordPage — loading state', () => {
  it('disables the button and shows "Sending..." while pending', async () => {
    let resolve
    mockResetPasswordForEmail.mockReturnValue(new Promise(r => { resolve = r }))
    renderPage()
    await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'a@b.com')
    await userEvent.click(screen.getByRole('button', { name: /send reset link/i }))
    expect(screen.getByRole('button', { name: /sending/i })).toBeDisabled()
    resolve({ error: null })
  })

  it('re-enables the button after an error', async () => {
    mockResetPasswordForEmail.mockResolvedValue({ error: { message: 'Oops' } })
    renderPage()
    await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'a@b.com')
    await userEvent.click(screen.getByRole('button', { name: /send reset link/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /send reset link/i })).not.toBeDisabled())
  })
})
