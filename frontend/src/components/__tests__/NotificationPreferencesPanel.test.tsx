import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

const SRC = join(__dirname, '..', '..')

/**
 * Every preference the API serves must have a toggle, and there must be exactly
 * one place that draws them. The profile tab and the settings page used to keep
 * a row list each; the profile copy fell behind and leagues, clubs and events
 * were unreachable for anyone who never went via the bell menu. Nothing failed
 * — the rows were simply absent — so these two checks stand in for the eye that
 * would otherwise have to notice.
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

describe('notification preferences', () => {
  it('offers a toggle for every preference the API serves', () => {
    const panel = readFileSync(join(SRC, 'components', 'NotificationPreferencesPanel.tsx'), 'utf8')
    const missing = preferenceKeys().filter((key) => !new RegExp(`\\b${key}\\b`).test(panel))
    expect(missing).toEqual([])
  })

  it('is drawn in exactly one place', () => {
    const panel = join(SRC, 'components', 'NotificationPreferencesPanel.tsx')
    const others = sourceFiles(SRC)
      .filter((path) => path !== panel)
      .filter((path) => /notificationsApi\.(get|update)Preferences/.test(readFileSync(path, 'utf8')))
    expect(others).toEqual([])
  })
})
