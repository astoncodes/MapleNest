import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import SignupPage from './SignupPage'

const mockSignUp = vi.fn()
const mockNavigate = vi.fn()

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ signUp: mockSignUp }),
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useNavigate: () => mockNavigate }
})

beforeEach(() => {
  mockSignUp.mockReset()
  mockNavigate.mockReset()
})

const fillAndSubmit = async () => {
  await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'a@b.com')
  await userEvent.type(screen.getByPlaceholderText('Min. 6 characters'), 'pass123')
  await userEvent.click(screen.getByRole('button', { name: /create free account/i }))
}

// B34: when Supabase email auto-confirm is enabled, signUp returns a live
// session — the user is already logged in, so "check your email" is wrong.
describe('SignupPage — auto-confirm handling', () => {
  it('navigates straight to /listings when signUp returns a session', async () => {
    mockSignUp.mockResolvedValue({ data: { session: { access_token: 'x' } }, error: null })
    render(<MemoryRouter><SignupPage /></MemoryRouter>)
    await fillAndSubmit()
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/listings', { replace: true }))
    expect(screen.queryByText(/check your email/i)).not.toBeInTheDocument()
  })

  it('shows the check-your-email screen when confirmation is required (no session)', async () => {
    mockSignUp.mockResolvedValue({ data: { session: null, user: { id: 'u1' } }, error: null })
    render(<MemoryRouter><SignupPage /></MemoryRouter>)
    await fillAndSubmit()
    await waitFor(() => expect(screen.getByText(/check your email/i)).toBeInTheDocument())
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
