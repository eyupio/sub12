import type { ComponentProps, ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import ClubSettings from '../ClubSettings'
import { clubsApi, type Club, type ClubMember } from '../../api/clubs'
import { announcementsApi } from '../../api/announcements'
import { useAuthStore } from '../../store/auth'

vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router')
  return {
    ...actual,
    useParams: () => ({ id: 'club-1' }),
    useNavigate: () => vi.fn(),
    Link: ({ to, children, ...props }: { to: string; children: ReactNode } & Omit<ComponentProps<'a'>, 'href'>) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
  }
})

function makeClub(partial: Partial<Club> = {}): Club {
  return {
    id: 'club-1',
    name: 'Range Rats',
    description: 'A friendly club',
    join_code: 'ABC123',
    type: 'public',
    join_policy: 'open',
    post_visibility: 'members',
    date_format: 'DD/MM/YYYY',
    time_format: '24h',
    timezone: 'UTC',
    created_by: 'user-1',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    member_count: 2,
    league_count: 0,
    is_member: true,
    is_moderator: true,
    is_owner: true,
    permissions: ['manage_settings', 'manage_members', 'manage_moderators'],
    disciplines: [],
    distances: [],
    facilities: [],
    ...partial,
  }
}

function makeMember(partial: Partial<ClubMember> = {}): ClubMember {
  return {
    user_id: 'user-1',
    display_name: 'Owner User',
    is_admin: true,
    is_moderator: true,
    is_owner: true,
    permissions: ['manage_settings', 'manage_members', 'manage_moderators'],
    joined_at: '2026-01-01T00:00:00Z',
    ...partial,
  }
}

const CLUB_PERMISSIONS = [
  { key: 'manage_members', label: 'Manage members', description: '', default: true },
  { key: 'moderate_content', label: 'Moderate content', description: '', default: true },
  { key: 'manage_leagues', label: 'Manage leagues', description: '', default: true },
  { key: 'manage_settings', label: 'Manage settings', description: '', default: false },
  { key: 'manage_moderators', label: 'Manage moderators', description: '', default: false },
]

describe('ClubSettings general info save flow', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: { id: 'user-1', email: 'owner@example.com', display_name: 'Owner User' },
      accessToken: 'token',
      refreshToken: 'refresh',
    })

    vi.spyOn(clubsApi, 'get').mockResolvedValue(makeClub())
    vi.spyOn(clubsApi, 'listMembers').mockResolvedValue({ items: [makeMember()] })
    vi.spyOn(clubsApi, 'listDisciplines').mockResolvedValue({ items: [] })
    vi.spyOn(clubsApi, 'getOpeningHours').mockResolvedValue({ items: [] })
    vi.spyOn(clubsApi, 'getModeratorPermissions').mockResolvedValue({
      catalogue: CLUB_PERMISSIONS,
      role: {
        is_member: true,
        is_moderator: true,
        is_owner: true,
        permissions: CLUB_PERMISSIONS.map(p => p.key),
      },
    })
    vi.spyOn(clubsApi, 'update').mockResolvedValue(makeClub({ name: 'Renamed Range Rats' }))
    // The settings page's announcement panel lists what has been sent. An
    // unmocked call reaches the real client and 401s.
    vi.spyOn(announcementsApi, 'list').mockResolvedValue({ items: [] })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    useAuthStore.setState({ user: null, accessToken: null, refreshToken: null })
  })

  it('invalidates the cached my-clubs list after saving general info', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    // Simulate the Dashboard/Feed 'my-clubs' widget already sitting in cache
    // (as it would after a normal app session) before the save.
    queryClient.setQueryData(['my-clubs'], { items: [makeClub()] })

    render(
      <QueryClientProvider client={queryClient}>
        <ClubSettings />
      </QueryClientProvider>,
    )

    fireEvent.click(await screen.findByRole('button', { name: /save general details/i }))

    await waitFor(() => expect(clubsApi.update).toHaveBeenCalled())

    // Regression guard: saving a club's name/description must not leave the
    // Dashboard/Feed 'my-clubs' query stale in cache, or the rename silently
    // fails to appear until the 5-minute staleTime lapses.
    await waitFor(() => {
      expect(queryClient.getQueryState(['my-clubs'])?.isInvalidated).toBe(true)
    })
  })
})

// Every section here saves through an endpoint gated on manage_settings,
// which the promotion grant deliberately withholds. Rendering them live for
// any moderator meant a delegated one without it could type into the form and
// get an unexplained "Failed to save" back, exactly the bug already fixed for
// LeagueSettings — this pins the same fix for its club counterpart.
describe('ClubSettings capability gating', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: { id: 'user-2', email: 'mod@example.com', display_name: 'Mod User' },
      accessToken: 'token',
      refreshToken: 'refresh',
    })

    vi.spyOn(clubsApi, 'get').mockResolvedValue(makeClub({ is_owner: false }))
    vi.spyOn(clubsApi, 'listMembers').mockResolvedValue({ items: [makeMember()] })
    vi.spyOn(clubsApi, 'listDisciplines').mockResolvedValue({ items: [] })
    vi.spyOn(clubsApi, 'getOpeningHours').mockResolvedValue({ items: [] })
    vi.spyOn(announcementsApi, 'list').mockResolvedValue({ items: [] })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    useAuthStore.setState({ user: null, accessToken: null, refreshToken: null })
  })

  function renderAs(permissions: string[]) {
    vi.spyOn(clubsApi, 'getModeratorPermissions').mockResolvedValue({
      catalogue: CLUB_PERMISSIONS,
      role: { is_member: true, is_moderator: true, is_owner: false, permissions },
    })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <ClubSettings />
      </QueryClientProvider>,
    )
  }

  it('renders the club record read-only without manage_settings', async () => {
    renderAs(['manage_members'])

    // The fields are still shown — a moderator may need to read them — but
    // nothing here can be submitted.
    expect(await screen.findByPlaceholderText(/club name/i)).toBeDisabled()
    expect(screen.queryByRole('button', { name: /save general details/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /save location and contact/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /save disciplines and facilities/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /save membership details/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /save opening times/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /upload club image/i })).toBeDisabled()
    // Privacy and Regional Defaults save on click, so the switches themselves
    // are what has to be disabled.
    screen.getAllByRole('button', { name: /^public$/i }).forEach(b => expect(b).toBeDisabled())
    // ...and every gated section says why, rather than leaving a dead form.
    expect(screen.getAllByText(/manage settings.*permission/i).length).toBeGreaterThan(1)
  })

  it('leaves the club record editable with manage_settings', async () => {
    renderAs(['manage_settings'])

    expect(await screen.findByPlaceholderText(/club name/i)).not.toBeDisabled()
    expect(screen.getByRole('button', { name: /save general details/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save location and contact/i })).toBeInTheDocument()
    expect(screen.queryByText(/manage settings.*permission/i)).not.toBeInTheDocument()
  })
})
