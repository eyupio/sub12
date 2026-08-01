import type { ComponentProps, ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import FeatureBoard from '../FeatureBoard'
import { featureRequestsApi, type FeatureRequest } from '../../api/featureRequests'
import { leagueApi } from '../../api/leagues'
import { clubsApi } from '../../api/clubs'
import { supportTicketsApi } from '../../api/supportTickets'

vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router')
  return {
    ...actual,
    Link: ({ to, params, children, ...props }: {
      to: string
      params?: Record<string, string>
      children: ReactNode
    } & Omit<ComponentProps<'a'>, 'href'>) => {
      const href = Object.entries(params ?? {}).reduce(
        (acc, [key, value]) => acc.replace(`$${key}`, value),
        to,
      )
      return <a href={href} {...props}>{children}</a>
    },
  }
})

function makeRequest(partial: Partial<FeatureRequest> = {}): FeatureRequest {
  return {
    id: 'fr-1',
    ticket_id: 'ticket-1',
    title: 'Compare two pellet tests side by side',
    refined_description: 'Put two tests next to each other so group sizes can be read together.',
    status: 'submitted',
    priority: 'normal',
    requester_id: 'user-1',
    requester_name: 'Paul Jennings',
    scope_type: 'platform',
    vote_count: 12,
    comment_count: 3,
    viewer_has_voted: false,
    created_at: '2026-07-01T10:00:00Z',
    updated_at: '2026-07-20T10:00:00Z',
    ...partial,
  }
}

function renderBoard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <FeatureBoard />
    </QueryClientProvider>,
  )
}

describe('FeatureBoard', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('lists ideas with their stage, votes and attribution', async () => {
    vi.spyOn(featureRequestsApi, 'ranking').mockResolvedValue({
      items: [makeRequest(), makeRequest({ id: 'fr-2', title: 'Dark mode for score cards', status: 'in_progress', vote_count: 4 })],
    })

    renderBoard()

    expect(await screen.findByText('Compare two pellet tests side by side')).toBeInTheDocument()
    expect(screen.getByText('Dark mode for score cards')).toBeInTheDocument()
    expect(screen.getByText('Submitted')).toBeInTheDocument()
    // Also the label of the "In progress" pulse tile, hence the plural query.
    expect(screen.getAllByText('In progress').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Paul Jennings')).toHaveLength(2)
    // Vote tiles are the primary control on every card.
    expect(screen.getByRole('button', { name: /Upvote — 12 votes/ })).toBeInTheDocument()
  })

  // The old board asked people to paste a league or club UUID they had no way
  // of knowing. Scope is now picked by name.
  it('picks a league by name rather than asking for an ID', async () => {
    const ranking = vi.spyOn(featureRequestsApi, 'ranking').mockResolvedValue({ items: [] })
    vi.spyOn(leagueApi, 'listMine').mockResolvedValue({
      items: [
        { id: 'league-uuid-1', name: 'Sussex Winter League' },
        { id: 'league-uuid-2', name: 'Tuesday Nighters' },
      ] as never,
    })

    renderBoard()

    fireEvent.click(await screen.findByRole('tab', { name: /My leagues/ }))

    const picker = await screen.findByRole('combobox', { name: 'Choose a league' })
    expect(await within(picker).findByRole('option', { name: 'Sussex Winter League' })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/UUID/i)).not.toBeInTheDocument()

    // The first league is selected automatically, so the board loads without a
    // second interaction.
    await waitFor(() => {
      expect(ranking).toHaveBeenCalledWith(expect.objectContaining({ scopeType: 'league', scopeID: 'league-uuid-1' }))
    })

    fireEvent.change(picker, { target: { value: 'league-uuid-2' } })
    await waitFor(() => {
      expect(ranking).toHaveBeenCalledWith(expect.objectContaining({ scopeID: 'league-uuid-2' }))
    })
  })

  it('offers a way forward when the viewer belongs to no clubs', async () => {
    vi.spyOn(featureRequestsApi, 'ranking').mockResolvedValue({ items: [] })
    vi.spyOn(clubsApi, 'listMine').mockResolvedValue({ items: [] })

    renderBoard()

    fireEvent.click(await screen.findByRole('tab', { name: /My clubs/ }))

    expect(await screen.findByText(/You're not in any clubs yet/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Browse clubs/ })).toBeInTheDocument()
  })

  it('filters by stage and search, and reports when nothing matches', async () => {
    vi.spyOn(featureRequestsApi, 'ranking').mockResolvedValue({
      items: [
        makeRequest(),
        makeRequest({ id: 'fr-2', title: 'Dark mode for score cards', status: 'implemented' }),
      ],
    })

    renderBoard()

    fireEvent.click(await screen.findByRole('button', { name: /^Shipped/ }))
    expect(screen.getByText('Dark mode for score cards')).toBeInTheDocument()
    expect(screen.queryByText('Compare two pellet tests side by side')).not.toBeInTheDocument()

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search ideas' }), { target: { value: 'nothing like this' } })
    expect(await screen.findByText('Nothing matches those filters')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(await screen.findByText('Compare two pellet tests side by side')).toBeInTheDocument()
  })

  it('groups ideas into roadmap columns', async () => {
    vi.spyOn(featureRequestsApi, 'ranking').mockResolvedValue({
      items: [
        makeRequest({ id: 'fr-1', title: 'Planned idea', status: 'planned' }),
        makeRequest({ id: 'fr-2', title: 'Shipped idea', status: 'done' }),
      ],
    })

    renderBoard()

    fireEvent.click(await screen.findByRole('button', { name: /Roadmap/ }))

    const plannedColumn = screen.getByRole('region', { name: 'Planned' })
    expect(within(plannedColumn).getByText('Planned idea')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Shipped' })).getByText('Shipped idea')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'In progress' })).getByText('Nothing here yet')).toBeInTheDocument()
  })

  // Suggesting an idea opens a feature-category support ticket for the scope the
  // board is already showing — no scope or category questions asked.
  it('submits a new idea against the current scope', async () => {
    vi.spyOn(featureRequestsApi, 'ranking').mockResolvedValue({ items: [] })
    const create = vi.spyOn(supportTicketsApi, 'create').mockResolvedValue({ id: 'ticket-9' } as never)

    renderBoard()

    fireEvent.click((await screen.findAllByRole('button', { name: /Suggest an idea/ }))[0])

    fireEvent.change(screen.getByPlaceholderText(/Compare two pellet tests/), {
      target: { value: 'Export my season as a PDF' },
    })
    fireEvent.change(screen.getByPlaceholderText(/What are you trying to do today/), {
      target: { value: 'I want to print a season summary for the club noticeboard.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit idea' }))

    await waitFor(() => {
      expect(create).toHaveBeenCalledWith(expect.objectContaining({
        scope_type: 'platform',
        category: 'feature',
        title: 'Export my season as a PDF',
      }))
    })
    expect(await screen.findByText(/Thanks — that's in/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Track your idea/ })).toHaveAttribute('href', '/support/tickets/ticket-9')
  })

  it('surfaces a retry when the board fails to load', async () => {
    vi.spyOn(featureRequestsApi, 'ranking').mockRejectedValue(new Error('boom'))

    renderBoard()

    expect(await screen.findByText("Couldn't load the board")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})
