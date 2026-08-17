import type { ComponentProps, ReactNode } from 'react'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import LandingPage from '../LandingPage'
import { availableVideoGuides } from '../../catalog/videoGuides'

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

  it('plays every shipped recording before sign-in', () => {
    // The landing page is the only place a visitor without an account can see
    // the app working. The recordings shipped for /help have to reach here
    // too, or "see it in action" is a claim with nothing behind it.
    const { container } = render(<LandingPage />)

    const players = Array.from(container.querySelectorAll('video'))
    expect(players).toHaveLength(availableVideoGuides.length)

    for (const guide of availableVideoGuides) {
      const player = players.find((v) => v.getAttribute('src') === `/demos/${guide.slug}.webm`)
      expect(player, `no player for ${guide.slug}`).toBeDefined()
      expect(player).toHaveAttribute('poster', `/demos/${guide.slug}.jpg`)
      // Several MB each: nothing is fetched until the visitor presses play.
      expect(player).toHaveAttribute('preload', 'none')
      expect(screen.getByText(guide.title)).toBeInTheDocument()
    }
  })

  it('links the header and hero at the demo section', () => {
    render(<LandingPage />)

    const banner = screen.getByRole('banner')
    expect(within(banner).getByRole('link', { name: /see it in action/i })).toHaveAttribute('href', '#demos')
    expect(screen.getByRole('link', { name: /watch sub12 in action/i })).toHaveAttribute('href', '#demos')
  })

  it('advertises the native apps as coming soon instead of an APK download', () => {
    render(<LandingPage />)

    expect(screen.getAllByText(/coming soon/i).length).toBeGreaterThan(0)
    expect(screen.queryByRole('link', { name: /download apk/i })).not.toBeInTheDocument()
  })
})
