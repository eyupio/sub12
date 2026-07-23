import type { ComponentProps, ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import ScoreEntry from '../ScoreEntry'
import { scoreCardApi, type ScoreCard } from '../../api/scoreCards'
import { gearApi } from '../../api/gear'
import { locationsApi } from '../../api/locations'

vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router')
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useSearch: () => ({}),
    Link: ({ to, children, ...props }: { to: string; children: ReactNode } & Omit<ComponentProps<'a'>, 'href'>) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
  }
})

function makeCard(partial: Partial<ScoreCard> = {}): ScoreCard {
  return {
    id: 'card-1',
    user_id: 'user-1',
    shot_at: '2026-07-23',
    total_score: 0,
    x_count: 0,
    verification: 'none',
    visibility: 'public',
    is_draft: false,
    shot_scores: Array(25).fill(0),
    shot_xs: Array(25).fill(false),
    created_at: '2026-07-23T00:00:00Z',
    updated_at: '2026-07-23T00:00:00Z',
    like_count: 0,
    comment_count: 0,
    is_liked: false,
    is_pb: false,
    ...partial,
  }
}

describe('ScoreEntry save flow', () => {
  beforeEach(() => {
    vi.spyOn(gearApi, 'listRifles').mockResolvedValue({ items: [] })
    vi.spyOn(gearApi, 'listPellets').mockResolvedValue({ items: [] })
    vi.spyOn(locationsApi, 'list').mockResolvedValue({ items: [] })
    vi.spyOn(scoreCardApi, 'create').mockResolvedValue(makeCard())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('invalidates the cached score-cards list after saving a new card', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    // Simulate the Dashboard/Profile/ScoreHistory lists already sitting in
    // cache (as they would after a normal app session) before the save.
    queryClient.setQueryData(['score-cards', 20], { items: [] })
    queryClient.setQueryData(['score-cards'], { items: [] })

    render(
      <QueryClientProvider client={queryClient}>
        <ScoreEntry />
      </QueryClientProvider>,
    )

    fireEvent.click(await screen.findByRole('button', { name: /save card/i }))

    await waitFor(() => expect(scoreCardApi.create).toHaveBeenCalled())

    // Regression guard: saving a score card must not leave the Dashboard /
    // Profile / ScoreHistory 'score-cards' queries stale in cache, or the
    // new card silently fails to appear until the 5-minute staleTime lapses.
    await waitFor(() => {
      expect(queryClient.getQueryState(['score-cards', 20])?.isInvalidated).toBe(true)
      expect(queryClient.getQueryState(['score-cards'])?.isInvalidated).toBe(true)
    })
  })
})
