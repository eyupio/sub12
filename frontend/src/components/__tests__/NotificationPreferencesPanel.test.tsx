import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

const SRC = join(__dirname, '..', '..')

/**
 * Every preference the API serves must have a toggle, and there must be exactly
 * one place that draws them. The profile tab and the settings page used to keep
 * a row list each; the profile copy fell behind and leagues, clubs and events
 * were unreachable for anyone who never went via the bell menu. Nothing failed
 * — the rows were simply absent — so these two checks stand in for the eye that
 * would otherwise have to notice.
 *
 * The coverage check renders the panel rather than scanning its source: a key
 * named in a comment, a type, or a catalogue entry that is never mapped over
 * satisfies a source scan while leaving the user with no switch at all.
 */

function preferenceKeys(): string[] {
  const source = readFileSync(join(SRC, 'api', 'notifications.ts'), 'utf8')
  const body = source.match(/export interface NotificationPreferences \{([\s\S]*?)\n\}/)
  if (!body) throw new Error('could not find the NotificationPreferences interface')
  return [...body[1].matchAll(/^\s*(\w+):\s*boolean$/gm)].map((m) => m[1])
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(path)
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })
}

const preferences = Object.fromEntries(preferenceKeys().map((key) => [key, false]))

vi.mock('../../api/notifications', () => ({
  notificationsApi: {
    getPreferences: () => Promise.resolve({ ...preferences, user_id: 'u1', updated_at: '' }),
    updatePreferences: (patch: unknown) => Promise.resolve(patch),
  },
}))

// Imported after the mock so the panel picks it up.
const { NotificationPreferencesPanel } = await import('../NotificationPreferencesPanel')

async function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <NotificationPreferencesPanel />
    </QueryClientProvider>,
  )
  await waitFor(() => expect(document.querySelectorAll('[data-pref]').length).toBeGreaterThan(0))
}

describe('notification preferences', () => {
  it('draws a toggle for every preference the API serves', async () => {
    await renderPanel()
    const drawn = new Set(
      [...document.querySelectorAll('[data-pref]')].map((el) => el.getAttribute('data-pref')),
    )
    expect(preferenceKeys().filter((key) => !drawn.has(key))).toEqual([])
  })

  it('offers the verification-request opt-ins with score validation', async () => {
    await renderPanel()
    // The three sources a card to check can come from. They are what somebody
    // hunting for "who sends me cards to verify" is looking for, so they belong
    // beside score validation and not at the foot of the page.
    const heading = screen.getByRole('heading', { name: 'Score card verification requests' })
    const group = heading.parentElement as HTMLElement
    const drawn = [...group.querySelectorAll('[data-pref]')].map((el) => el.getAttribute('data-pref'))
    expect(drawn).toEqual([
      'review_requests_public',
      'review_requests_leagues',
      'review_requests_club_leagues',
    ])
  })

  it('is drawn in exactly one place', () => {
    const panel = join(SRC, 'components', 'NotificationPreferencesPanel.tsx')
    const others = sourceFiles(SRC)
      .filter((path) => path !== panel)
      .filter((path) => /notificationsApi\.(get|update)Preferences/.test(readFileSync(path, 'utf8')))
    expect(others).toEqual([])
  })
})
