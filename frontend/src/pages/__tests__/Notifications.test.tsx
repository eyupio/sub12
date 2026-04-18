import type { ComponentProps, ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import Notifications from '../Notifications'
import { notificationLink } from '../notificationRouting'
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
    expect(notificationLink(makeNotification({ type: 'feature_request_state_changed' }))).toBe('/feature-requests')
    expect(notificationLink(makeNotification({ type: 'score_verified', target_type: 'score_card', target_id: 'sc-1' }))).toBe('/scores/sc-1')
    expect(notificationLink(makeNotification({ type: 'mention', target_type: 'post', target_id: 'post-1' }))).toBe('/feed')
    expect(notificationLink(makeNotification({ type: 'follow_accepted', target_type: 'user', target_id: 'u-2' }))).toBe('/users/u-2')
    expect(notificationLink(makeNotification({ type: 'league_join_approved', league_id: 'lg-2' }))).toBe('/leagues/lg-2')
    expect(notificationLink(makeNotification({ type: 'club_join_approved', club_id: 'cb-2' }))).toBe('/clubs/cb-2')
  })
})
