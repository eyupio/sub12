import type { ComponentProps, ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import Layout from '../Layout'

vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router')
  return {
    ...actual,
    // `activeProps` is a router concern with no DOM equivalent — drop it rather
    // than spreading it onto the anchor.
    Link: ({ to, children, activeProps, ...props }: {
      to: string
      children: ReactNode
      activeProps?: unknown
    } & Omit<ComponentProps<'a'>, 'href'>) => {
      void activeProps
      return <a href={to} {...props}>{children}</a>
    },
    Outlet: () => null,
    useNavigate: () => vi.fn(),
  }
})

vi.mock('../NavTracker', () => ({ NavTracker: () => null }))
vi.mock('../NotificationBell', () => ({ NotificationBell: () => null }))
vi.mock('../QuickCaptureFab', () => ({ default: () => null }))
vi.mock('../../api/scoreCards', () => ({ scoreCardApi: { draftCount: vi.fn().mockResolvedValue({ count: 0 }) } }))
vi.mock('../../api/pelletTesting', () => ({ pelletTestApi: { draftCount: vi.fn().mockResolvedValue({ count: 0 }) } }))

function renderLayout() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <Layout><p>page body</p></Layout>
    </QueryClientProvider>,
  )
  return document.getElementById('main-content')!
}

describe('Layout', () => {
  it('renders its children', () => {
    renderLayout()
    expect(screen.getByText('page body')).toBeInTheDocument()
  })

  // The shell is `min-h-screen` — a floor, not a height — so <main> always grows
  // to its content and the document is the only scroller. Giving <main> its own
  // `overflow` makes it a scroll container that can never scroll, and an
  // `overscroll-behavior` of `contain`/`none` on that dead container stops a
  // touch gesture starting inside it from chaining out to the document: the
  // swipe is swallowed and the page will not scroll at all on a phone.
  it('does not make <main> a scroll container', () => {
    const main = renderLayout()
    const classes = main.className.split(/\s+/)
    expect(classes.filter(c => /^(overflow|overscroll)/.test(c))).toEqual([])
  })
})
