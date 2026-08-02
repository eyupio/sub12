import type { ComponentProps, ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import LeagueSettings from '../LeagueSettings'
import { leagueApi, type League, type LeagueConfig, type LeagueMember } from '../../api/leagues'
import { announcementsApi } from '../../api/announcements'
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
  const base = {
    user_id: 'user-1',
    display_name: 'Owner User',
    is_admin: true,
    is_moderator: true,
    // The league's created_by, so user-1 is the owner in every fixture.
    is_owner: true,
    permissions: LEAGUE_PERMISSIONS.map(p => p.key),
    joined_at: '2026-01-01T00:00:00Z',
  }
  const member = { ...base, ...partial } as LeagueMember
  // Fixtures set is_admin for brevity; keep the two spellings consistent.
  if (partial.is_admin !== undefined && partial.is_moderator === undefined) {
    member.is_moderator = partial.is_admin
  }
  if (partial.user_id !== undefined && partial.is_owner === undefined) {
    member.is_owner = partial.user_id === 'user-1'
  }
  if (!member.is_owner && partial.permissions === undefined) {
    member.permissions = member.is_moderator ? ['manage_members'] : []
  }
  return member
}

const LEAGUE_PERMISSIONS = [
  { key: 'manage_members', label: 'Manage members', description: '', default: true },
  { key: 'verify_scores', label: 'Verify scores', description: '', default: true },
  { key: 'moderate_content', label: 'Moderate content', description: '', default: true },
  { key: 'manage_seasons', label: 'Manage seasons', description: '', default: true },
  { key: 'manage_settings', label: 'Manage settings', description: '', default: false },
  { key: 'manage_support', label: 'Handle support', description: '', default: false },
  { key: 'manage_moderators', label: 'Manage moderators', description: '', default: false },
]

/** The owner's view of the delegation catalogue. */
// The settings page's announcement panel lists what has been sent. An
// unmocked call reaches the real client, 401s, and clears the auth store
// mid-test — which renders the page as nothing at all.
function mockAnnouncements() {
  vi.spyOn(announcementsApi, 'list').mockResolvedValue({ items: [] })
}

function mockModeratorPermissions() {
  mockAnnouncements()
  vi.spyOn(leagueApi, 'getModeratorPermissions').mockResolvedValue({
    catalogue: LEAGUE_PERMISSIONS,
    role: {
      is_member: true,
      is_moderator: true,
      is_owner: true,
      permissions: LEAGUE_PERMISSIONS.map(p => p.key),
    },
  })
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
    vi.spyOn(leagueApi, 'listSeasons').mockResolvedValue({ items: [] })
    vi.spyOn(leagueApi, 'listMembers').mockResolvedValue({ items: [makeMember()] })
    vi.spyOn(leagueApi, 'updateConfig').mockResolvedValue(makeConfig({ ends_on: '2026-12-01' }))
    mockModeratorPermissions()
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

describe('LeagueSettings seasons and rounds', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: { id: 'user-1', email: 'admin@example.com', display_name: 'Admin User' },
      accessToken: 'token',
      refreshToken: 'refresh',
    })

    vi.spyOn(leagueApi, 'get').mockResolvedValue(makeLeague())
    vi.spyOn(leagueApi, 'getConfig').mockResolvedValue(makeConfig())
    vi.spyOn(leagueApi, 'listMembers').mockResolvedValue({ items: [makeMember()] })
    mockModeratorPermissions()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    useAuthStore.setState({ user: null, accessToken: null, refreshToken: null })
  })

  it('creates a season with its start date', async () => {
    vi.spyOn(leagueApi, 'listSeasons').mockResolvedValue({ items: [] })
    const createSeason = vi.spyOn(leagueApi, 'createSeason').mockResolvedValue({
      id: 'season-1',
      league_id: 'league-1',
      name: 'Winter 2026',
      starts_on: '2026-10-01',
      is_active: true,
      created_at: '2026-08-01T00:00:00Z',
    })
    vi.spyOn(leagueApi, 'listRounds').mockResolvedValue({ items: [] })

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <LeagueSettings />
      </QueryClientProvider>,
    )

    fireEvent.click(await screen.findByRole('button', { name: /\+ add season/i }))
    fireEvent.change(screen.getByPlaceholderText(/season name/i), { target: { value: 'Winter 2026' } })
    fireEvent.change(screen.getByLabelText(/^starts$/i), { target: { value: '2026-10-01' } })
    fireEvent.click(screen.getByRole('button', { name: /add season/i }))

    await waitFor(() =>
      expect(createSeason).toHaveBeenCalledWith('league-1', {
        name: 'Winter 2026',
        starts_on: '2026-10-01',
        ends_on: undefined,
      }),
    )
  })

  // The backend refuses a season to a moderator without the capability, so
  // offering the control just produces an unexplained 403.
  it('keeps the section read-only without the seasons capability', async () => {
    vi.spyOn(leagueApi, 'listSeasons').mockResolvedValue({ items: [] })
    vi.spyOn(leagueApi, 'getModeratorPermissions').mockResolvedValue({
      catalogue: LEAGUE_PERMISSIONS,
      role: {
        is_member: true,
        is_moderator: true,
        is_owner: false,
        permissions: ['manage_members', 'verify_scores'],
      },
    })

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <LeagueSettings />
      </QueryClientProvider>,
    )

    expect(await screen.findByText(/seasons & rounds/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /\+ add season/i })).not.toBeInTheDocument()
  })

  // Whoever runs the club hosting a league runs the league, and holds no
  // membership row in it — gating the page on the members list shut them out.
  it('admits whoever runs the hosting club, with no membership row', async () => {
    vi.spyOn(leagueApi, 'listSeasons').mockResolvedValue({ items: [] })
    vi.spyOn(leagueApi, 'listMembers').mockResolvedValue({
      items: [makeMember({ user_id: 'user-2', display_name: 'Someone Else' })],
    })
    vi.spyOn(leagueApi, 'getModeratorPermissions').mockResolvedValue({
      catalogue: LEAGUE_PERMISSIONS,
      role: {
        is_member: false,
        is_moderator: true,
        is_owner: false,
        permissions: LEAGUE_PERMISSIONS.map(p => p.key),
      },
    })

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <LeagueSettings />
      </QueryClientProvider>,
    )

    expect(await screen.findByRole('button', { name: /\+ add season/i })).toBeInTheDocument()
  })
})

describe('LeagueSettings member roles', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: { id: 'user-1', email: 'admin@example.com', display_name: 'Admin User' },
      accessToken: 'token',
      refreshToken: 'refresh',
    })

    vi.spyOn(leagueApi, 'get').mockResolvedValue(makeLeague())
    vi.spyOn(leagueApi, 'getConfig').mockResolvedValue(makeConfig())
    vi.spyOn(leagueApi, 'listSeasons').mockResolvedValue({ items: [] })
    vi.spyOn(leagueApi, 'updateMember').mockResolvedValue({ updated: true })
    mockModeratorPermissions()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    useAuthStore.setState({ user: null, accessToken: null, refreshToken: null })
  })

  function renderSettings() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <LeagueSettings />
      </QueryClientProvider>,
    )
  }

  it('promotes another member to moderator', async () => {
    vi.spyOn(leagueApi, 'listMembers').mockResolvedValue({
      items: [makeMember(), makeMember({ user_id: 'user-2', display_name: 'Second Shooter', is_admin: false })],
    })

    renderSettings()

    fireEvent.click(await screen.findByRole('button', { name: /promote second shooter to moderator/i }))
    fireEvent.click(await screen.findByRole('button', { name: /^promote$/i }))

    await waitFor(() =>
      expect(leagueApi.updateMember).toHaveBeenCalledWith('league-1', 'user-2', { is_moderator: true }),
    )
  })

  it('demotes a co-moderator back to member', async () => {
    vi.spyOn(leagueApi, 'listMembers').mockResolvedValue({
      items: [makeMember(), makeMember({ user_id: 'user-2', display_name: 'Second Shooter', is_admin: true })],
    })

    renderSettings()

    fireEvent.click(await screen.findByRole('button', { name: /demote second shooter to member/i }))
    fireEvent.click(await screen.findByRole('button', { name: /^demote$/i }))

    await waitFor(() =>
      expect(leagueApi.updateMember).toHaveBeenCalledWith('league-1', 'user-2', { is_moderator: false }),
    )
  })

  // Removing a member is destructive and must stay behind its own confirm
  // step — never share the role dialog's confirm button.
  it('does not offer a remove control for co-moderators', async () => {
    vi.spyOn(leagueApi, 'listMembers').mockResolvedValue({
      items: [makeMember(), makeMember({ user_id: 'user-2', display_name: 'Second Shooter', is_admin: true })],
    })

    renderSettings()

    await screen.findByRole('button', { name: /demote second shooter to member/i })
    expect(screen.queryByRole('button', { name: /remove second shooter from league/i })).toBeNull()
  })
})
