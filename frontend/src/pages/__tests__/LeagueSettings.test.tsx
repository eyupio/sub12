import type { ComponentProps, ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import LeagueSettings from '../LeagueSettings'
import { leagueApi, type League, type LeagueConfig, type LeagueMember } from '../../api/leagues'
import { useAuthStore } from '../../store/auth'

vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router')
  return {
    ...actual,
    useParams: () => ({ id: 'league-1' }),
    useNavigate: () => vi.fn(),
    Link: ({ to, children, ...props }: { to: string; children: ReactNode } & Omit<ComponentProps<'a'>, 'href'>) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
  }
})

function makeLeague(partial: Partial<League> = {}): League {
  return {
    id: 'league-1',
    name: 'Range Rats',
    description: 'Weekly league',
    type: 'public',
    post_visibility: 'members',
    member_count: 2,
    date_format: 'DD/MM/YYYY',
    time_format: '24h',
    timezone: 'UTC',
    created_by: 'user-1',
    created_at: '2026-01-01T00:00:00Z',
    ...partial,
  }
}

function makeConfig(partial: Partial<LeagueConfig> = {}): LeagueConfig {
  return {
    league_id: 'league-1',
    starts_on: '2026-01-01',
    ends_on: '2026-06-01',
    max_submissions_per_round: 1,
    scoring_rule: 'highest',
    join_policy: 'open',
    require_score_verification: false,
    required_confirmations: 1,
    require_image_upload: false,
    lock_edits_after_verification: false,
    updated_at: '2026-01-01T00:00:00Z',
    ...partial,
  }
}

function makeMember(partial: Partial<LeagueMember> = {}): LeagueMember {
  return {
    user_id: 'user-1',
    display_name: 'Admin User',
    is_admin: true,
    joined_at: '2026-01-01T00:00:00Z',
    ...partial,
  } as LeagueMember
}

describe('LeagueSettings rules save flow', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: {
        id: 'user-1',
        email: 'admin@example.com',
        display_name: 'Admin User',
      },
      accessToken: 'token',
      refreshToken: 'refresh',
    })

    vi.spyOn(leagueApi, 'get').mockResolvedValue(makeLeague())
    vi.spyOn(leagueApi, 'getConfig').mockResolvedValue(makeConfig())
    vi.spyOn(leagueApi, 'listMembers').mockResolvedValue({ items: [makeMember()] })
    vi.spyOn(leagueApi, 'updateConfig').mockResolvedValue(makeConfig({ ends_on: '2026-12-01' }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    useAuthStore.setState({ user: null, accessToken: null, refreshToken: null })
  })

  it('invalidates the cached my-leagues list after saving league rules', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    // Simulate the Dashboard/Leagues 'my-leagues' widget already sitting in
    // cache (as it would after a normal app session) before the save.
    queryClient.setQueryData(['my-leagues'], { items: [makeLeague()] })

    render(
      <QueryClientProvider client={queryClient}>
        <LeagueSettings />
      </QueryClientProvider>,
    )

    fireEvent.click(await screen.findByRole('button', { name: /save rules/i }))

    await waitFor(() => expect(leagueApi.updateConfig).toHaveBeenCalled())

    // Regression guard: saving league rules (e.g. season start/end dates) must
    // not leave the Dashboard/Leagues 'my-leagues' query stale in cache, or
    // the updated dates silently fail to appear until the 5-minute staleTime
    // lapses.
    await waitFor(() => {
      expect(queryClient.getQueryState(['my-leagues'])?.isInvalidated).toBe(true)
    })
  })
})
