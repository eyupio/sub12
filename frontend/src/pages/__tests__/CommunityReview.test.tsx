import type { ComponentProps, ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import CommunityReview from '../CommunityReview'
import { scoreCardApi, type ScoreCard } from '../../api/scoreCards'
import { communityReviewApi, type CommunityReviewStatus } from '../../api/communityReview'
import { useAuthStore } from '../../store/auth'

vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router')
  return {
    ...actual,
    useParams: () => ({ id: 'card-1' }),
    useNavigate: () => vi.fn(),
    // `params` is consumed here so it never lands on the DOM node as an
    // unknown attribute.
    Link: ({ to, children, params, ...props }: { to: string; children: ReactNode; params?: unknown } & Omit<ComponentProps<'a'>, 'href'>) => (
      <a href={to} data-params={params ? '' : undefined} {...props}>{children}</a>
    ),
  }
})

function makeCard(partial: Partial<ScoreCard> = {}): ScoreCard {
  return {
    id: 'card-1',
    user_id: 'owner-1',
    shot_at: '2026-07-20',
    total_score: 243,
    x_count: 11,
    location: 'Riverside Range',
    distance_m: 25,
    shot_scores: [],
    shot_xs: [],
    verification: 'pending',
    visibility: 'public',
    like_count: 0,
    comment_count: 0,
    is_liked: false,
    is_draft: false,
    is_pb: false,
    created_at: '2026-07-20T10:00:00Z',
    updated_at: '2026-07-20T10:00:00Z',
    author: { id: 'owner-1', display_name: 'Paul Jennings', star_level: 2 },
    ...partial,
  }
}

function makeReview(partial: Partial<CommunityReviewStatus> = {}): CommunityReviewStatus {
  return {
    request: {
      id: 'req-1',
      score_card_id: 'card-1',
      requested_by: 'owner-1',
      required_confirmations: 3,
      status: 'open',
      created_at: '2026-07-20T11:00:00Z',
    },
    confirmations: [
      { id: 'conf-1', score_card_id: 'card-1', confirmed_by: 'user-2', display_name: 'Dave Blake', created_at: '2026-07-21T09:00:00Z' },
    ],
    confirmation_count: 1,
    viewer_has_confirmed: false,
    ...partial,
  }
}

function renderWithQuery(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

beforeEach(() => {
  useAuthStore.setState({ user: { id: 'user-3', email: 'a@b.co', display_name: 'Viewer' } as never })
  vi.spyOn(scoreCardApi, 'get').mockResolvedValue(makeCard())
  vi.spyOn(scoreCardApi, 'listComments').mockResolvedValue({ items: [] })
  vi.spyOn(communityReviewApi, 'get').mockResolvedValue(makeReview())
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('CommunityReview page', () => {
  it('shows the card under review, its progress and who has confirmed', async () => {
    renderWithQuery(<CommunityReview />)

    await waitFor(() => expect(screen.getByText('243')).toBeInTheDocument())
    expect(screen.getByText('(11X)')).toBeInTheDocument()
    expect(screen.getByText('Paul Jennings')).toBeInTheDocument()
    expect(screen.getByText('1/3 confirmed')).toBeInTheDocument()
    expect(screen.getByText(/2 more confirmations needed/)).toBeInTheDocument()
    expect(screen.getByText('Dave Blake')).toBeInTheDocument()
    // The two outstanding slots are shown so the gap is legible at a glance.
    expect(screen.getAllByText('Awaiting a reviewer')).toHaveLength(2)
  })

  it('links back to the full score card and renders the discussion', async () => {
    renderWithQuery(<CommunityReview />)

    await waitFor(() => expect(screen.getByText('View the full score card')).toBeInTheDocument())
    expect(screen.getByText(/No comments yet/)).toBeInTheDocument()
  })

  it('lets a non-owner confirm the card', async () => {
    const confirm = vi.spyOn(communityReviewApi, 'confirm').mockResolvedValue({ confirmed: true })
    renderWithQuery(<CommunityReview />)

    const button = await screen.findByRole('button', { name: 'Confirm this card' })
    fireEvent.click(button)
    await waitFor(() => expect(confirm).toHaveBeenCalledWith('card-1'))
  })

  it('offers the owner a cancel instead of a confirm', async () => {
    useAuthStore.setState({ user: { id: 'owner-1', email: 'p@b.co', display_name: 'Paul' } as never })
    renderWithQuery(<CommunityReview />)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel review request' })).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Confirm this card' })).not.toBeInTheDocument()
  })

  it('reports a verified card without a confirm action', async () => {
    vi.spyOn(communityReviewApi, 'get').mockResolvedValue(makeReview({
      request: {
        id: 'req-1',
        score_card_id: 'card-1',
        requested_by: 'owner-1',
        required_confirmations: 3,
        status: 'verified',
        created_at: '2026-07-20T11:00:00Z',
        resolved_at: '2026-07-22T08:00:00Z',
      },
      confirmation_count: 3,
    }))
    renderWithQuery(<CommunityReview />)

    await waitFor(() => expect(screen.getByText('Verified')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Confirm this card' })).not.toBeInTheDocument()
  })

  it('invites the owner to open a review when none exists', async () => {
    useAuthStore.setState({ user: { id: 'owner-1', email: 'p@b.co', display_name: 'Paul' } as never })
    vi.spyOn(communityReviewApi, 'get').mockResolvedValue({
      confirmations: [],
      confirmation_count: 0,
      viewer_has_confirmed: false,
    })
    renderWithQuery(<CommunityReview />)

    await waitFor(() => expect(screen.getByRole('button', { name: /Request community review/ })).toBeInTheDocument())
  })
})
