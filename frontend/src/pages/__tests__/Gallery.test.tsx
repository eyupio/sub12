import type { ComponentProps, ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import Gallery from '../Gallery'
import { galleryApi, type GalleryItem } from '../../api/gallery'
import { leagueApi } from '../../api/leagues'
import { eventsApi } from '../../api/events'

vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router')
  return {
    ...actual,
    Link: ({ to, params, children, ...props }: {
      to: string
      params?: Record<string, string>
      search?: Record<string, string>
      children: ReactNode
    } & Omit<ComponentProps<'a'>, 'href'>) => {
      const href = Object.entries(params ?? {}).reduce(
        (acc, [key, value]) => acc.replace(`$${key}`, value),
        to,
      )
      // search is a router-only prop; strip it so it never lands on the anchor.
      delete (props as Record<string, unknown>).search
      return <a href={href} {...props}>{children}</a>
    },
  }
})

function makeItem(partial: Partial<GalleryItem> = {}): GalleryItem {
  return {
    kind: 'score_card',
    id: 'card-1',
    image_url: '/api/v1/images/img-1',
    title: 'Score card',
    shot_at: '2026-07-12',
    total_score: 238,
    x_count: 7,
    is_draft: false,
    verification: 'verified',
    created_at: '2026-07-12T10:00:00Z',
    ...partial,
  }
}

function renderGallery() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <Gallery />
    </QueryClientProvider>,
  )
}

describe('Gallery', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows uploaded items with their submission context', async () => {
    vi.spyOn(galleryApi, 'list').mockResolvedValue({
      items: [
        makeItem({ league_round_id: 'round-1', league_id: 'l1', league_name: 'Sunday League', round_name: 'Round 3' }),
        makeItem({ id: 'card-2', total_score: 245, club_id: 'c1', club_name: 'Leeds ARC' }),
        makeItem({ kind: 'rifle', id: 'rifle-1', title: 'Air Arms S510', total_score: undefined }),
        makeItem({
          kind: 'pellet_test',
          id: 'pti-1',
          title: 'Air Arms S510 · JSB Exact',
          session_id: 'session-1',
          group_size_mm: 11.4,
          total_score: undefined,
        }),
      ],
    })

    renderGallery()

    // League/club badges appear on the grid tiles.
    expect(await screen.findAllByText('Sunday League')).not.toHaveLength(0)
    expect(screen.getAllByText('Leeds ARC')).not.toHaveLength(0)
    expect(screen.getAllByText('Air Arms S510')).not.toHaveLength(0)
    // Kind filter chips carry counts: 4 items, 2 score cards, 1 gear, 1 test.
    expect(screen.getByRole('button', { name: /All\s*4/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Score cards\s*2/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Gear\s*1/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Pellet tests\s*1/ })).toBeInTheDocument()
    // The two finished score cards make the top-shots showcase.
    expect(screen.getByText('Top shots')).toBeInTheDocument()
  })

  it('filters to items not submitted anywhere yet', async () => {
    vi.spyOn(galleryApi, 'list').mockResolvedValue({
      items: [
        makeItem({ league_round_id: 'round-1', league_name: 'Sunday League' }),
        makeItem({ id: 'card-2', total_score: 199 }),
      ],
    })

    renderGallery()
    await screen.findByText('Top shots')

    fireEvent.change(screen.getByLabelText('Filter by submission'), { target: { value: 'unsubmitted' } })

    // Only the unsubmitted card remains in the grid.
    expect(screen.queryAllByText('Sunday League')).toHaveLength(0)
    expect(screen.getAllByText('199')).not.toHaveLength(0)
  })

  it('opens an item and offers league and event submission for a personal card', async () => {
    vi.spyOn(galleryApi, 'list').mockResolvedValue({
      items: [makeItem({ rifle_name: 'Air Arms S510' })],
    })
    vi.spyOn(leagueApi, 'listMine').mockResolvedValue({ items: [] })
    vi.spyOn(eventsApi, 'listMine').mockResolvedValue({ items: [] })

    renderGallery()

    fireEvent.click(await screen.findByRole('button', { name: /Score card: Score card/ }))

    expect(screen.getByRole('button', { name: /Submit to league/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Submit to event/ })).toBeInTheDocument()
    expect(screen.getByText(/Not submitted anywhere yet/)).toBeInTheDocument()

    // The event dialog opens from the overlay action.
    fireEvent.click(screen.getByRole('button', { name: /Submit to event/ }))
    expect(await screen.findByText('Submit to Event')).toBeInTheDocument()
  })

  it('offers withdraw, not submission, for a card already at an event', async () => {
    vi.spyOn(galleryApi, 'list').mockResolvedValue({
      items: [
        makeItem({
          event_participant_id: 'part-1',
          event_slug: 'summer-shoot',
          event_name: 'Summer Shoot',
          verification: 'pending',
        }),
      ],
    })

    renderGallery()

    fireEvent.click(await screen.findByRole('button', { name: /Score card: Score card/ }))

    expect(screen.getByRole('button', { name: /Withdraw from event/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Submit to event/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Submit to league/ })).not.toBeInTheDocument()
  })

  it('shows the capture path when the gallery is empty', async () => {
    vi.spyOn(galleryApi, 'list').mockResolvedValue({ items: [] })

    renderGallery()

    expect(await screen.findByText('Nothing here yet')).toBeInTheDocument()
    const cta = screen.getByRole('link', { name: /Capture your first card/ })
    expect(cta).toHaveAttribute('href', '/quick-capture')
  })
})
