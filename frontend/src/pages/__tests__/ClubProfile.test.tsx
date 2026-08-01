import type { ComponentProps, ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import ClubDetail from '../ClubDetail'
import ClubSettings from '../ClubSettings'
import { clubsApi, type Club, type ClubOpeningHours } from '../../api/clubs'
import { useAuthStore } from '../../store/auth'

vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router')
  return {
    ...actual,
    useParams: () => ({ id: 'club-1' }),
    useNavigate: () => vi.fn(),
    // `params` is consumed here so it never lands on the DOM node as an
    // unknown attribute.
    Link: ({ to, children, params, ...props }: { to: string; children: ReactNode; params?: unknown } & Omit<ComponentProps<'a'>, 'href'>) => (
      <a href={to} data-params={params ? '' : undefined} {...props}>{children}</a>
    ),
  }
})

const CLUB_PERMISSIONS = [
  { key: 'manage_members', label: 'Manage members', description: '', default: true },
  { key: 'moderate_content', label: 'Moderate content', description: '', default: true },
  { key: 'manage_events', label: 'Manage events', description: '', default: false },
  { key: 'manage_leagues', label: 'Manage leagues', description: '', default: false },
  { key: 'manage_settings', label: 'Manage settings', description: '', default: false },
  { key: 'manage_support', label: 'Handle support', description: '', default: false },
  { key: 'manage_moderators', label: 'Manage moderators', description: '', default: false },
]

function makeClub(partial: Partial<Club> = {}): Club {
  // The API derives the viewer's standing server-side; mirror that here so a
  // fixture only has to say whether the viewer runs the club.
  const isModerator = partial.is_moderator ?? partial.is_admin ?? false
  const viewerRole = {
    is_admin: isModerator,
    is_moderator: isModerator,
    is_owner: isModerator,
    permissions: isModerator ? CLUB_PERMISSIONS.map(p => p.key) : [],
  }
  return {
    id: 'club-1',
    name: 'Riverside Rifle Club',
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
    member_count: 12,
    league_count: 2,
    is_member: true,
    disciplines: [],
    distances: [],
    facilities: [],
    ...viewerRole,
    ...partial,
    is_moderator: viewerRole.is_moderator,
    is_owner: viewerRole.is_owner,
    permissions: viewerRole.permissions,
  }
}

function makeHours(partial: Partial<ClubOpeningHours> = {}): ClubOpeningHours {
  return {
    id: 'hours-1',
    club_id: 'club-1',
    day_of_week: 5,
    opens_at: '10:00',
    closes_at: '15:00',
    is_closed: false,
    ...partial,
  }
}

function renderWithQuery(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

beforeEach(() => {
  useAuthStore.setState({ user: { id: 'user-1', email: 'a@b.co', display_name: 'Admin' } as never })
  vi.spyOn(clubsApi, 'listMembers').mockResolvedValue({ items: [] })
  vi.spyOn(clubsApi, 'getStandings').mockResolvedValue({ items: [] })
  vi.spyOn(clubsApi, 'listLeagues').mockResolvedValue({ items: [] })
  vi.spyOn(clubsApi, 'listJoinRequests').mockResolvedValue({ items: [] })
  vi.spyOn(clubsApi, 'getOpeningHours').mockResolvedValue({ items: [] })
  // Every club API the pages call must be stubbed: an unmocked call reaches the
  // real client, 401s, and clears the auth store mid-test.
  vi.spyOn(clubsApi, 'listDisciplines').mockResolvedValue({ items: ['air rifle', 'benchrest'] })
  vi.spyOn(clubsApi, 'getModeratorPermissions').mockResolvedValue({
    catalogue: CLUB_PERMISSIONS,
    role: {
      is_member: true,
      is_moderator: true,
      is_owner: true,
      permissions: CLUB_PERMISSIONS.map(p => p.key),
    },
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ClubDetail about panel', () => {
  it('shows location, contact, disciplines and opening times', async () => {
    vi.spyOn(clubsApi, 'get').mockResolvedValue(makeClub({
      address_line1: 'Hill Lane',
      city: 'Huddersfield',
      postcode: 'HD3 3FR',
      latitude: 53.6458,
      longitude: -1.8412,
      website_url: 'https://example.test',
      contact_phone: '07700 900000',
      disciplines: ['air rifle', 'benchrest'],
      facilities: ['Covered firing line'],
      membership_info: 'Annual membership runs from 1 July.',
      established_year: 1978,
    }))
    vi.spyOn(clubsApi, 'getOpeningHours').mockResolvedValue({
      items: [
        makeHours({ id: 'h1', day_of_week: 0, is_closed: true, opens_at: undefined, closes_at: undefined, note: 'Pre-booking only' }),
        makeHours({ id: 'h2', day_of_week: 5 }),
      ],
    })

    renderWithQuery(<ClubDetail />)

    await waitFor(() => expect(screen.getByText('About')).toBeInTheDocument())
    // The town appears both in the header sub-line and in the About block.
    expect(screen.getAllByText(/Huddersfield/).length).toBeGreaterThan(0)
    expect(screen.getByText('air rifle')).toBeInTheDocument()
    expect(screen.getByText('benchrest')).toBeInTheDocument()
    expect(screen.getByText('Covered firing line')).toBeInTheDocument()
    expect(screen.getByText('Annual membership runs from 1 July.')).toBeInTheDocument()
    expect(screen.getByText('1978')).toBeInTheDocument()
    expect(screen.getByText('https://example.test')).toBeInTheDocument()
    expect(screen.getByText('07700 900000')).toBeInTheDocument()

    // Opening times render Monday-first with an explicit closed day.
    expect(screen.getByText('Monday')).toBeInTheDocument()
    expect(screen.getByText('Closed')).toBeInTheDocument()
    expect(screen.getByText('10:00 – 15:00')).toBeInTheDocument()

    // A published pin links out to a map.
    expect(screen.getByText('View on map ↗').closest('a')).toHaveAttribute(
      'href',
      expect.stringContaining('mlat=53.6458'),
    )
  })

  it('omits the about panel entirely for a club with no profile', async () => {
    vi.spyOn(clubsApi, 'get').mockResolvedValue(makeClub())

    renderWithQuery(<ClubDetail />)

    await waitFor(() => expect(screen.getByText('Riverside Rifle Club')).toBeInTheDocument())
    expect(screen.queryByText('About')).not.toBeInTheDocument()
  })

  it('prompts a moderator to fill in a blank profile', async () => {
    vi.spyOn(clubsApi, 'get').mockResolvedValue(makeClub({ is_admin: true }))

    renderWithQuery(<ClubDetail />)

    await waitFor(() => expect(screen.getByText('No club details yet')).toBeInTheDocument())
  })

  it('surfaces pending join requests to moderators of approval-gated clubs', async () => {
    vi.spyOn(clubsApi, 'get').mockResolvedValue(makeClub({ is_admin: true, join_policy: 'approval' }))
    vi.spyOn(clubsApi, 'listJoinRequests').mockResolvedValue({
      items: [
        { id: 'r1', club_id: 'club-1', user_id: 'u2', status: 'pending', created_at: '2026-01-02T00:00:00Z' },
        { id: 'r2', club_id: 'club-1', user_id: 'u3', status: 'pending', created_at: '2026-01-03T00:00:00Z' },
      ],
    })

    renderWithQuery(<ClubDetail />)

    await waitFor(() =>
      expect(screen.getByText('2 join requests waiting for review')).toBeInTheDocument(),
    )
  })
})

describe('ClubSettings profile editing', () => {
  it('clears a description by sending an empty string rather than omitting it', async () => {
    vi.spyOn(clubsApi, 'get').mockResolvedValue(makeClub({ is_admin: true, description: 'Old blurb' }))
    const update = vi.spyOn(clubsApi, 'update').mockResolvedValue(makeClub({ is_admin: true }))

    renderWithQuery(<ClubSettings />)

    const description = await screen.findByPlaceholderText('A short description of the club')
    fireEvent.change(description, { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save general details' }))

    await waitFor(() => expect(update).toHaveBeenCalled())
    expect(update.mock.calls[0][1]).toMatchObject({ description: '' })
  })

  it('saves location and coordinates together', async () => {
    vi.spyOn(clubsApi, 'get').mockResolvedValue(makeClub({ is_admin: true, latitude: 53.6, longitude: -1.8 }))
    const update = vi.spyOn(clubsApi, 'update').mockResolvedValue(makeClub({ is_admin: true }))

    renderWithQuery(<ClubSettings />)

    const city = await screen.findByLabelText('Town / City')
    fireEvent.change(city, { target: { value: 'Huddersfield' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save location and contact' }))

    await waitFor(() => expect(update).toHaveBeenCalled())
    expect(update.mock.calls[0][1]).toMatchObject({ city: 'Huddersfield', latitude: 53.6, longitude: -1.8 })
  })

  it('clears the pin explicitly when a moderator removes it', async () => {
    vi.spyOn(clubsApi, 'get').mockResolvedValue(makeClub({ is_admin: true, latitude: 53.6, longitude: -1.8 }))
    const update = vi.spyOn(clubsApi, 'update').mockResolvedValue(makeClub({ is_admin: true }))

    renderWithQuery(<ClubSettings />)

    fireEvent.click(await screen.findByRole('button', { name: /Remove pin/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Save location and contact' }))

    await waitFor(() => expect(update).toHaveBeenCalled())
    expect(update.mock.calls[0][1]).toMatchObject({ clear_coordinates: true })
    expect(update.mock.calls[0][1]).not.toHaveProperty('latitude')
  })

  it('submits the whole week when opening times change', async () => {
    vi.spyOn(clubsApi, 'get').mockResolvedValue(makeClub({ is_admin: true }))
    vi.spyOn(clubsApi, 'getOpeningHours').mockResolvedValue({
      items: [makeHours({ day_of_week: 5, opens_at: '10:00', closes_at: '15:00' })],
    })
    const replace = vi.spyOn(clubsApi, 'replaceOpeningHours').mockResolvedValue({ items: [] })

    renderWithQuery(<ClubSettings />)

    // Wait for the saved slot to seed the editor before adding a second one.
    await waitFor(() => expect(screen.getByLabelText('Opens at')).toHaveValue('10:00'))
    fireEvent.click(screen.getByRole('button', { name: /Add slot/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Save opening times' }))

    await waitFor(() => expect(replace).toHaveBeenCalled())
    const sent = replace.mock.calls[0][1]
    expect(sent).toHaveLength(2)
    expect(sent[0]).toMatchObject({ day_of_week: 5, opens_at: '10:00', closes_at: '15:00', is_closed: false })
    expect(sent[1]).toMatchObject({ day_of_week: 0, is_closed: false })
  })
})
