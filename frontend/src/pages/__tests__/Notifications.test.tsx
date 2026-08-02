import type { ComponentProps, ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import Notifications from '../Notifications'
import { notificationLink } from '../../utils/notificationRouting'
import { notificationsApi, type Notification, type NotificationType } from '../../api/notifications'
import { routeTree } from '../../routeTree'

vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router')
  return {
    ...actual,
    Link: ({
      to,
      search,
      hash,
      children,
      ...props
    }: {
      to: string
      search?: Record<string, string>
      hash?: string
      children: ReactNode
    } & Omit<ComponentProps<'a'>, 'href'>) => (
      <a
        href={`${to}${search ? `?${new URLSearchParams(search).toString()}` : ''}${hash ? `#${hash}` : ''}`}
        {...props}
      >
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

// Does a concrete link land on a route the app actually defines? Route params
// (`$id`) match any single segment; query and hash are stripped first.
function matchesRoute(routePaths: string[], link: string): boolean {
  const path = link.split(/[?#]/, 1)[0]
  const parts = path.split('/').filter(Boolean)
  return routePaths.some((route) => {
    const routeParts = route.split('/').filter(Boolean)
    if (routeParts.length !== parts.length) return false
    return routeParts.every((segment, i) => segment.startsWith('$') || segment === parts[i])
  })
}

describe('Notifications routing', () => {
  beforeEach(() => {
    vi.spyOn(notificationsApi, 'markRead').mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('defines an admin moderation destination route', () => {
    expect(collectRoutePaths(routeTree)).toContain('/admin/reports')
  })

  it('links report notifications without community scope to the admin moderation queue', async () => {
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
    expect(itemLink).toHaveAttribute('href', '/admin/reports')
  })

  it('maps notification types to valid app routes', () => {
    expect(notificationLink(makeNotification({ type: 'report_filed', league_id: 'lg-1', target_id: 'rp-1' }))).toBe('/leagues/lg-1/reports#rp-1')
    expect(notificationLink(makeNotification({ type: 'report_filed', club_id: 'cb-1', target_id: 'rp-2' }))).toBe('/clubs/cb-1/reports#rp-2')
    expect(notificationLink(makeNotification({ type: 'report_filed', target_id: 'rp-3' }))).toBe('/admin/reports#rp-3')
    expect(notificationLink(makeNotification({ type: 'ticket_created', target_id: 't-1' }))).toBe('/support/tickets/t-1')
    expect(notificationLink(makeNotification({ type: 'ticket_replied', target_id: 't-2' }))).toBe('/support/tickets/t-2')
    expect(notificationLink(makeNotification({ type: 'ticket_assigned', target_id: 't-3' }))).toBe('/support/tickets/t-3')
    expect(notificationLink(makeNotification({ type: 'ticket_status_changed', target_id: 't-4' }))).toBe('/support/tickets/t-4')
    expect(notificationLink(makeNotification({ type: 'ticket_created' }))).toBe('/support')
    expect(notificationLink(makeNotification({ type: 'feature_request_state_changed', target_type: 'feature_request', target_id: 'fr-1' }))).toBe('/feature-requests/fr-1')
    expect(notificationLink(makeNotification({ type: 'feature_request_state_changed' }))).toBe('/feature-requests')
    expect(notificationLink(makeNotification({ type: 'score_verified', target_type: 'score_card', target_id: 'sc-1', league_id: 'lg-3' }))).toBe('/scores/sc-1')
    expect(notificationLink(makeNotification({ type: 'score_rejected', target_type: 'score_card', target_id: 'sc-2', league_id: 'lg-3' }))).toBe('/scores/sc-2')
    expect(notificationLink(makeNotification({ type: 'score_amended', target_type: 'score_card', target_id: 'sc-3', league_id: 'lg-3' }))).toBe('/scores/sc-3')
    expect(notificationLink(makeNotification({ type: 'mention', target_type: 'post', target_id: 'post-1' }))).toBe('/posts/post-1')
    expect(notificationLink(makeNotification({ type: 'comment_on_my_card', target_type: 'score_card', target_id: 'sc-4' }))).toBe('/scores/sc-4')
    expect(notificationLink(makeNotification({ type: 'like_on_my_content', target_type: 'post', target_id: 'post-2' }))).toBe('/posts/post-2')
    expect(notificationLink(makeNotification({ type: 'follow_accepted', target_type: 'user', target_id: 'u-2' }))).toBe('/users/u-2')
    expect(notificationLink(makeNotification({ type: 'follow_accepted', actor_id: 'u-3' }))).toBe('/users/u-3')
    expect(notificationLink(makeNotification({ type: 'follow_request', actor_id: 'u-4' }))).toBe('/profile?tab=social')
    expect(notificationLink(makeNotification({ type: 'post_flagged', target_type: 'post', target_id: 'post-3' }))).toBe('/posts/post-3')
    expect(notificationLink(makeNotification({ type: 'league_join_approved', league_id: 'lg-2' }))).toBe('/leagues/lg-2')
    expect(notificationLink(makeNotification({ type: 'club_join_approved', club_id: 'cb-2' }))).toBe('/clubs/cb-2')
  })

  it('sends a community review verdict to the review page rather than the card', () => {
    // Community reviews carry no league; a league moderator's verdict does.
    expect(notificationLink(makeNotification({ type: 'score_verified', target_type: 'score_card', target_id: 'sc-9' }))).toBe('/scores/sc-9/review')
  })

  it('keeps a feature-request update on the ticket when that is what it targets', () => {
    // Status changes raised from the support ticket carry the ticket id, which
    // would 404 if it were read as a feature-request id.
    expect(
      notificationLink(
        makeNotification({ type: 'feature_request_state_changed', target_type: 'support_ticket', target_id: 'tk-1' }),
      ),
    ).toBe('/support/tickets/tk-1')
  })

  it('resolves every notification type to a defined route', () => {
    const routePaths = collectRoutePaths(routeTree)
    const types: NotificationType[] = [
      'follow_request',
      'follow_accepted',
      'comment_on_my_card',
      'reply_to_my_comment',
      'like_on_my_content',
      'score_verified',
      'score_rejected',
      'score_amended',
      'league_join_approved',
      'club_join_approved',
      'mention',
      'post_flagged',
      'report_filed',
      'ticket_created',
      'ticket_replied',
      'ticket_assigned',
      'ticket_status_changed',
      'feature_request_state_changed',
    ]

    // Every type, with and without the identifiers the backend may attach —
    // a notification that resolves nowhere renders as a row that ignores taps.
    const shapes: Partial<Notification>[] = [
      {},
      { actor_id: 'u-1' },
      { target_id: 'x-1', target_type: 'score_card' },
      { target_id: 'x-1', target_type: 'post' },
      { target_id: 'x-1', target_type: 'user' },
      { target_id: 'x-1', target_type: 'support_ticket' },
      { target_id: 'x-1', target_type: 'feature_request' },
      { target_id: 'x-1', league_id: 'lg-1' },
      { target_id: 'x-1', club_id: 'cb-1' },
    ]

    for (const type of types) {
      for (const shape of shapes) {
        const link = notificationLink(makeNotification({ type, ...shape }))
        expect(matchesRoute(routePaths, link), `${type} ${JSON.stringify(shape)} → ${link}`).toBe(true)
      }
    }
  })
})
