import type { ComponentProps, ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import Notifications from '../Notifications'
import { notificationLink, notificationSentence } from '../notificationRouting'
import { notificationsApi, type Notification } from '../../api/notifications'
import { routeTree } from '../../routeTree'

vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router')
  return {
    ...actual,
    Link: ({ to, children, ...props }: { to: string; children: ReactNode } & Omit<ComponentProps<'a'>, 'href'>) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
  }
})

function makeNotification(partial: Partial<Notification>): Notification {
  return {
    id: 'notif-1',
    recipient_id: 'user-1',
    type: 'report_filed',
    created_at: '2026-04-18T00:00:00Z',
    ...partial,
  }
}

function collectRoutePaths(route: unknown): string[] {
  const queue: unknown[] = [route]
  const paths: string[] = []

  while (queue.length) {
    const current = queue.shift() as {
      options?: { path?: string }
      children?: unknown[]
    }

    if (current?.options?.path) {
      paths.push(current.options.path)
    }

    if (Array.isArray(current?.children)) {
      queue.push(...current.children)
    }
  }

  return paths
}

describe('Notifications routing', () => {
  beforeEach(() => {
    vi.spyOn(notificationsApi, 'markRead').mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('defines an admin support destination route', () => {
    expect(collectRoutePaths(routeTree)).toContain('/admin/support')
  })

  it('links report notifications without community scope to admin support inbox', async () => {
    vi.spyOn(notificationsApi, 'list').mockResolvedValue({
      items: [
        makeNotification({
          actor_display_name: 'Alex',
          metadata: { target_label: 'post' },
        }),
      ],
      cursor: '',
    })

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={queryClient}>
        <Notifications />
      </QueryClientProvider>,
    )

    const itemLink = await screen.findByRole('link', { name: /alex flagged post/i })
    expect(itemLink).toHaveAttribute('href', '/admin/support')
  })

  it('maps notification types to valid app routes', () => {
    expect(notificationLink(makeNotification({ type: 'report_filed', league_id: 'lg-1' }))).toBe('/leagues/lg-1/reports')
    expect(notificationLink(makeNotification({ type: 'report_filed', club_id: 'cb-1' }))).toBe('/clubs/cb-1/reports')
    expect(notificationLink(makeNotification({ type: 'ticket_created', target_id: 't-1' }))).toBe('/support/tickets/t-1')
    expect(notificationLink(makeNotification({ type: 'ticket_replied', target_id: 't-2' }))).toBe('/support/tickets/t-2')
    expect(notificationLink(makeNotification({ type: 'ticket_assigned', target_id: 't-3' }))).toBe('/support/tickets/t-3')
    expect(notificationLink(makeNotification({ type: 'ticket_status_changed', target_id: 't-4' }))).toBe('/support/tickets/t-4')
    expect(notificationLink(makeNotification({ type: 'feature_request_state_changed', target_id: 'fr-1' }))).toBe('/feature-requests/fr-1')
    expect(notificationLink(makeNotification({ type: 'feature_request_state_changed' }))).toBe('/feature-requests')
    expect(notificationLink(makeNotification({ type: 'score_verified', target_type: 'score_card', target_id: 'sc-1' }))).toBe('/scores/sc-1')
    expect(notificationLink(makeNotification({ type: 'mention', target_type: 'post', target_id: 'post-1' }))).toBe('/feed')
    expect(notificationLink(makeNotification({ type: 'follow_accepted', target_type: 'user', target_id: 'u-2' }))).toBe('/users/u-2')
    expect(notificationLink(makeNotification({ type: 'league_join_approved', league_id: 'lg-2' }))).toBe('/leagues/lg-2')
    expect(notificationLink(makeNotification({ type: 'club_join_approved', club_id: 'cb-2' }))).toBe('/clubs/cb-2')
  })

  it('routes league, club and event notifications to where the action is', () => {
    // A personal card is confirmed from its review page; a league card is
    // ruled on from the card itself.
    expect(
      notificationLink(
        makeNotification({
          type: 'score_validation_requested',
          target_type: 'score_card',
          target_id: 'sc-9',
          metadata: { scope: 'personal' },
        }),
      ),
    ).toBe('/scores/sc-9/review')
    expect(
      notificationLink(
        makeNotification({
          type: 'score_validation_requested',
          target_type: 'score_card',
          target_id: 'sc-9',
          league_id: 'lg-3',
          metadata: { scope: 'league' },
        }),
      ),
    ).toBe('/scores/sc-9')

    // Join requests land on the settings page that lists them.
    expect(notificationLink(makeNotification({ type: 'league_join_request', league_id: 'lg-3', target_type: 'league', target_id: 'lg-3' }))).toBe('/leagues/lg-3/settings')
    expect(notificationLink(makeNotification({ type: 'club_join_request', club_id: 'cb-3', target_type: 'club', target_id: 'cb-3' }))).toBe('/clubs/cb-3/settings')

    expect(notificationLink(makeNotification({ type: 'league_join_rejected', league_id: 'lg-3', target_type: 'league', target_id: 'lg-3' }))).toBe('/leagues/lg-3')
    expect(notificationLink(makeNotification({ type: 'league_role_changed', league_id: 'lg-3', target_type: 'league', target_id: 'lg-3' }))).toBe('/leagues/lg-3')
    expect(notificationLink(makeNotification({ type: 'league_round_opened', league_id: 'lg-3', target_type: 'league', target_id: 'lg-3' }))).toBe('/leagues/lg-3')
    expect(notificationLink(makeNotification({ type: 'club_role_changed', club_id: 'cb-3', target_type: 'club', target_id: 'cb-3' }))).toBe('/clubs/cb-3')

    // A club-hosted event resolves to the event, not the club that hosts it.
    for (const type of ['event_invitation', 'event_participant_joined', 'event_went_live', 'event_results_posted'] as const) {
      expect(
        notificationLink(
          makeNotification({ type, club_id: 'cb-3', target_type: 'event', target_id: 'ev-1', metadata: { event_slug: 'winter-open' } }),
        ),
      ).toBe('/events/winter-open')
    }
    expect(notificationLink(makeNotification({ type: 'event_went_live', target_type: 'event', target_id: 'ev-1' }))).toBe('/events')
  })

  it('names the league, club or event in the sentence', () => {
    expect(
      notificationSentence(
        makeNotification({ type: 'league_join_request', actor_display_name: 'Noah', metadata: { league_name: 'Sunday Bench' } }),
      ),
    ).toBe('Noah asked to join Sunday Bench')
    expect(
      notificationSentence(makeNotification({ type: 'league_role_changed', metadata: { is_moderator: true, league_name: 'Sunday Bench' } })),
    ).toBe('You now help run Sunday Bench')
    expect(
      notificationSentence(makeNotification({ type: 'league_role_changed', metadata: { is_moderator: false, league_name: 'Sunday Bench' } })),
    ).toBe('You no longer help run Sunday Bench')
    expect(
      notificationSentence(
        makeNotification({ type: 'score_validation_requested', actor_display_name: 'Mia', metadata: { scope: 'personal' } }),
      ),
    ).toBe('Mia asked the community to validate a score card')
    expect(
      notificationSentence(makeNotification({ type: 'event_results_posted', metadata: { event_name: 'Winter Open' } })),
    ).toBe('Results are in for Winter Open')
    // A missing name still reads as a sentence.
    expect(notificationSentence(makeNotification({ type: 'club_join_rejected' }))).toBe(
      'Your request to join a club was declined',
    )
  })
})
