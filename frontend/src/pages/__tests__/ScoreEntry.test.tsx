import type { ComponentProps, ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import ScoreEntry from '../ScoreEntry'
import { scoreCardApi, type ScoreCard } from '../../api/scoreCards'
import { ApiError } from '../../api/client'
import { gearApi } from '../../api/gear'
import { leagueApi } from '../../api/leagues'
import { locationsApi } from '../../api/locations'

const { navigateMock, searchParams } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  searchParams: { current: {} as Record<string, string> },
}))

vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router')
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useSearch: () => searchParams.current,
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
    searchParams.current = {}
    navigateMock.mockReset()
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

// A draft captured against a league round whose per-shooter cap is already
// spent used to be a dead end: every save ended on the graduate call being
// refused, with no way to keep the card.
describe('ScoreEntry refining a draft on a full league round', () => {
  const draftCard = () =>
    makeCard({ id: 'draft-1', is_draft: true, league_round_id: 'round-1', verification: 'pending' })

  function renderRefine() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <ScoreEntry />
      </QueryClientProvider>,
    )
    return queryClient
  }

  beforeEach(() => {
    searchParams.current = { draftId: 'draft-1', leagueId: 'league-1', roundId: 'round-1' }
    navigateMock.mockReset()
    vi.spyOn(gearApi, 'listRifles').mockResolvedValue({ items: [] })
    vi.spyOn(gearApi, 'listPellets').mockResolvedValue({ items: [] })
    vi.spyOn(locationsApi, 'list').mockResolvedValue({ items: [] })
    vi.spyOn(scoreCardApi, 'get').mockResolvedValue(draftCard())
    vi.spyOn(scoreCardApi, 'update').mockResolvedValue(draftCard())
    vi.spyOn(scoreCardApi, 'graduate').mockResolvedValue(makeCard({ id: 'draft-1' }))
    vi.spyOn(leagueApi, 'get').mockResolvedValue({
      id: 'league-1', name: 'Test League', type: 'public', post_visibility: 'members',
      created_by: 'user-1', member_count: 2, date_format: 'DD/MM/YYYY', time_format: '24h',
      timezone: 'Europe/London', created_at: '2026-01-01T00:00:00Z',
    })
    vi.spyOn(leagueApi, 'ensureDefaultRound').mockResolvedValue({
      round_id: 'round-1', round_name: 'R1', season_name: 'S1',
    })
    vi.spyOn(leagueApi, 'getConfig').mockResolvedValue({
      league_id: 'league-1', max_submissions_per_round: 1, scoring_rule: 'highest',
      join_policy: 'open', require_score_verification: false, required_confirmations: 0,
      require_image_upload: false, lock_edits_after_verification: false,
      updated_at: '2026-01-01T00:00:00Z',
    })
    // One card already submitted for this round — the cap is spent.
    vi.spyOn(scoreCardApi, 'list').mockResolvedValue({
      items: [makeCard({ id: 'card-earlier', league_round_id: 'round-1' })],
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('warns that the round is full and saves as a personal card when switched', async () => {
    renderRefine()

    expect(await screen.findByText(/this round is full/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /personal card/i }))
    fireEvent.click(await screen.findByRole('button', { name: /save card/i }))

    await waitFor(() => expect(scoreCardApi.update).toHaveBeenCalled())
    // The empty round detaches the draft, so graduating it no longer runs
    // into the league's cap.
    expect(vi.mocked(scoreCardApi.update).mock.calls[0][1]).toMatchObject({ league_round_id: '' })
    await waitFor(() => expect(scoreCardApi.graduate).toHaveBeenCalledWith('draft-1'))
  })

  it('keeps the card as a draft without graduating it', async () => {
    renderRefine()

    fireEvent.click(await screen.findByRole('button', { name: /keep as draft/i }))

    await waitFor(() => expect(scoreCardApi.update).toHaveBeenCalled())
    expect(scoreCardApi.graduate).not.toHaveBeenCalled()
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith({ to: '/drafts' }))
  })

  it('recovers in place when the server refuses the submission', async () => {
    // The cap is authoritative on the server; the client's count can be stale.
    vi.mocked(scoreCardApi.list).mockResolvedValue({ items: [] })
    vi.mocked(scoreCardApi.graduate).mockRejectedValue(
      new ApiError(409, 'maximum submissions per round reached: limit is 1 per round'),
    )
    renderRefine()

    fireEvent.click(await screen.findByRole('button', { name: /submit score/i }))

    await waitFor(() => expect(scoreCardApi.graduate).toHaveBeenCalled())
    // The refinement is already persisted, so the user stays put with the
    // card intact rather than being navigated away or losing the edits.
    expect(navigateMock).not.toHaveBeenCalled()
    expect(await screen.findByText(/this round is full/i)).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /save card/i })).toBeInTheDocument()
  })
})
