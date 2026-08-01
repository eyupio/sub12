import type { ComponentProps, ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { GettingStarted, type GettingStartedProgress } from '../GettingStarted'

vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router')
  return {
    ...actual,
    Link: ({ to, children, ...props }: { to: string; children: ReactNode } & Omit<ComponentProps<'a'>, 'href'>) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
  }
})

const nothingDone: GettingStartedProgress = {
  profileComplete: false,
  hasRifle: false,
  hasScoreCard: false,
  hasCommunity: false,
  hasPelletTest: false,
}

const allDone: GettingStartedProgress = {
  profileComplete: true,
  hasRifle: true,
  hasScoreCard: true,
  hasCommunity: true,
  hasPelletTest: true,
}

describe('GettingStarted', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('lists every setup step for a brand new account', () => {
    render(<GettingStarted progress={nothingDone} cardsLogged={0} />)

    expect(screen.getByRole('heading', { name: /getting started/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add your first rifle' })).toHaveAttribute('href', '/gear')
    expect(screen.getByRole('link', { name: 'Log a score card' })).toHaveAttribute('href', '/scores/new')
    expect(screen.getByRole('link', { name: 'Finish your profile' })).toHaveAttribute('href', '/profile')
    expect(screen.getByRole('link', { name: 'Join a club or league' })).toHaveAttribute('href', '/clubs')
    expect(screen.getByRole('link', { name: 'Run a pellet test' })).toHaveAttribute('href', '/pellet-testing/new')
  })

  it('reports progress and names the next step', () => {
    render(
      <GettingStarted
        progress={{ ...nothingDone, hasRifle: true, hasScoreCard: true }}
        cardsLogged={2}
      />,
    )

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2')
    expect(screen.getByText(/2 of 5 done. Next up: finish your profile/i)).toBeInTheDocument()
    // Completed steps are marked done rather than repeating their CTA.
    expect(screen.getByRole('link', { name: 'Add your first rifle — done' })).toBeInTheDocument()
  })

  it('hides itself once every step is complete', () => {
    const { container } = render(<GettingStarted progress={allDone} cardsLogged={3} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('hides itself for an experienced shooter with steps outstanding', () => {
    const { container } = render(<GettingStarted progress={nothingDone} cardsLogged={10} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('stays dismissed across mounts', () => {
    const { unmount } = render(<GettingStarted progress={nothingDone} cardsLogged={0} />)

    fireEvent.click(screen.getByRole('button', { name: /hide the getting started checklist/i }))
    expect(screen.queryByRole('heading', { name: /getting started/i })).not.toBeInTheDocument()
    unmount()

    const { container } = render(<GettingStarted progress={nothingDone} cardsLogged={0} />)
    expect(container).toBeEmptyDOMElement()
  })
})
