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
