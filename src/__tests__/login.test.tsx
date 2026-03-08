import { render, screen } from '@testing-library/react'
import LoginPage from '@/app/login/page'

describe('LoginPage', () => {
  it('renders email and password fields', () => {
    render(<LoginPage searchParams={Promise.resolve({})} />)
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument()
  })
})
