import type { ComponentProps, ReactNode } from 'react'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import LandingPage from '../LandingPage'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...props }: { to: string; children: ReactNode } & Omit<ComponentProps<'a'>, 'href'>) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

describe('LandingPage', () => {
  it('shows the header sign in link for mobile layouts', () => {
    render(<LandingPage />)

    const header = screen.getByRole('banner')
    const signInLink = within(header).getByRole('link', { name: /sign in/i })
    const classTokens = signInLink.className.split(/\s+/)

    expect(signInLink).toHaveAttribute('href', '/login')
    expect(classTokens).toContain('inline-flex')
    expect(classTokens).not.toContain('hidden')
    expect(classTokens.some((token) => token.endsWith(':hidden'))).toBe(false)
  })
})
