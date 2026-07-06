import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import SignupPage from './SignupPage'

const mockSignUp = vi.fn()

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ signUp: mockSignUp }),
}))

function renderPage() {
  return render(<MemoryRouter><SignupPage /></MemoryRouter>)
}

beforeEach(() => mockSignUp.mockReset())

// ─── rendering ─────────────────────────────────────────────────────────────

describe('SignupPage — rendering', () => {
  it('renders all form fields and the submit button', () => {
    renderPage()
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Min. 6 characters')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create free account/i })).toBeInTheDocument()
  })

  it('defaults to renter role selected', () => {
    renderPage()
    const renterBtn = screen.getByRole('button', { name: /renter/i })
    expect(renterBtn).toHaveClass('bg-maple-red')
    expect(screen.getByRole('button', { name: /landlord/i })).not.toHaveClass('bg-maple-red')
  })
})

// ─── role selection ────────────────────────────────────────────────────────

describe('SignupPage — role selection', () => {
  it('switching to landlord highlights the landlord button', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: /landlord/i }))
    expect(screen.getByRole('button', { name: /landlord/i })).toHaveClass('bg-maple-red')
    expect(screen.getByRole('button', { name: /renter/i })).not.toHaveClass('bg-maple-red')
  })

  it('sends selected role to signUp', async () => {
    mockSignUp.mockResolvedValue({ error: null })
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: /landlord/i }))
    await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'a@b.com')
    await userEvent.type(screen.getByPlaceholderText('Min. 6 characters'), 'pass123')
    await userEvent.click(screen.getByRole('button', { name: /create free account/i }))
    await waitFor(() => expect(mockSignUp).toHaveBeenCalledWith('a@b.com', 'pass123', 'landlord'))
  })
})

// ─── happy path ────────────────────────────────────────────────────────────

describe('SignupPage — successful signup', () => {
  it('shows the success screen', async () => {
    mockSignUp.mockResolvedValue({ error: null })
    renderPage()
    await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'test@example.com')
    await userEvent.type(screen.getByPlaceholderText('Min. 6 characters'), 'pass123')
    await userEvent.click(screen.getByRole('button', { name: /create free account/i }))
    await waitFor(() => expect(screen.getByText(/check your email/i)).toBeInTheDocument())
  })

  it('shows the submitted email address in the success message', async () => {
    mockSignUp.mockResolvedValue({ error: null })
    renderPage()
    await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'myemail@example.com')
    await userEvent.type(screen.getByPlaceholderText('Min. 6 characters'), 'pass123')
    await userEvent.click(screen.getByRole('button', { name: /create free account/i }))
    await waitFor(() => expect(screen.getByText('myemail@example.com')).toBeInTheDocument())
  })
})

// ─── error handling ────────────────────────────────────────────────────────

describe('SignupPage — error handling', () => {
  it('displays the supabase error message', async () => {
    mockSignUp.mockResolvedValue({ error: { message: 'Email already registered' } })
    renderPage()
    await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'dup@example.com')
    await userEvent.type(screen.getByPlaceholderText('Min. 6 characters'), 'pass123')
    await userEvent.click(screen.getByRole('button', { name: /create free account/i }))
    await waitFor(() => expect(screen.getByText('Email already registered')).toBeInTheDocument())
  })

  it('displays the rate-limit error (60s cooldown) from Supabase', async () => {
    mockSignUp.mockResolvedValue({ error: { message: 'For security purposes, you can only request this after 54 seconds.' } })
    renderPage()
    await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'a@b.com')
    await userEvent.type(screen.getByPlaceholderText('Min. 6 characters'), 'pass123')
    await userEvent.click(screen.getByRole('button', { name: /create free account/i }))
    await waitFor(() => expect(screen.getByText(/security purposes/i)).toBeInTheDocument())
  })

  it('displays an email-invalid error from Supabase', async () => {
    mockSignUp.mockResolvedValue({ error: { message: 'Email address "test@notreal.invalid" is invalid' } })
    renderPage()
    await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'test@notreal.invalid')
    await userEvent.type(screen.getByPlaceholderText('Min. 6 characters'), 'pass123')
    await userEvent.click(screen.getByRole('button', { name: /create free account/i }))
    await waitFor(() => expect(screen.getByText(/is invalid/i)).toBeInTheDocument())
  })

  it('clears the previous error message on the next submit attempt', async () => {
    mockSignUp
      .mockResolvedValueOnce({ error: { message: 'First error' } })
      .mockResolvedValueOnce({ error: null })
    renderPage()
    await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'a@b.com')
    await userEvent.type(screen.getByPlaceholderText('Min. 6 characters'), 'pass123')
    await userEvent.click(screen.getByRole('button', { name: /create free account/i }))
    await waitFor(() => expect(screen.getByText('First error')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: /create free account/i }))
    await waitFor(() => expect(screen.queryByText('First error')).not.toBeInTheDocument())
  })

  it('displays rate limit error from supabase', async () => {
    mockSignUp.mockResolvedValue({ error: { message: 'For security purposes, you can only request this after 39 seconds.' } })
    renderPage()
    await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'a@b.com')
    await userEvent.type(screen.getByPlaceholderText('Min. 6 characters'), 'pass123')
    await userEvent.click(screen.getByRole('button', { name: /create free account/i }))
    await waitFor(() => expect(screen.getByText(/security purposes/i)).toBeInTheDocument())
  })
})

// ─── loading state ─────────────────────────────────────────────────────────

describe('SignupPage — loading state', () => {
  it('disables the button and shows loading text while submitting', async () => {
    let resolve
    mockSignUp.mockReturnValue(new Promise(r => { resolve = r }))
    renderPage()
    await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'a@b.com')
    await userEvent.type(screen.getByPlaceholderText('Min. 6 characters'), 'pass123')
    await userEvent.click(screen.getByRole('button', { name: /create free account/i }))
    expect(screen.getByRole('button', { name: /creating account/i })).toBeDisabled()
    resolve({ error: null })
  })

  it('re-enables the button after an error', async () => {
    mockSignUp.mockResolvedValue({ error: { message: 'Oops' } })
    renderPage()
    await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'a@b.com')
    await userEvent.type(screen.getByPlaceholderText('Min. 6 characters'), 'pass123')
    await userEvent.click(screen.getByRole('button', { name: /create free account/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /create free account/i })).not.toBeDisabled())
  })
})
