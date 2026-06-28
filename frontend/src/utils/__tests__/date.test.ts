import { describe, it, expect } from 'vitest'

import {
  DEFAULT_PREFS,
  formatDate,
  formatDateShort,
  formatRelativeTime,
  formatTime,
  RELATIVE_TIME_CUTOFF_MS,
  type RegionalPrefs,
} from '../date'

const withFormat = (dateFormat: RegionalPrefs['dateFormat']): RegionalPrefs => ({
  ...DEFAULT_PREFS,
  dateFormat,
})

describe('formatDate', () => {
  it('defaults to DD/MM/YYYY', () => {
    expect(formatDate('2026-04-13')).toBe('13/04/2026')
  })

  it('renders each supported format', () => {
    expect(formatDate('2026-04-13', withFormat('dmy_slash'))).toBe('13/04/2026')
    expect(formatDate('2026-04-13', withFormat('mdy_slash'))).toBe('04/13/2026')
    expect(formatDate('2026-04-13', withFormat('ymd_dash'))).toBe('2026-04-13')
    expect(formatDate('2026-04-13', withFormat('dmy_short'))).toBe('13 Apr 2026')
  })

  it('treats bare date strings as local calendar dates', () => {
    // Without this guard, a UTC-based parse can shift the displayed day by
    // ±1 depending on the host timezone. Europe/London in the preferences
    // gives a stable answer either way.
    const prefs: RegionalPrefs = { ...DEFAULT_PREFS, timezone: 'Europe/London' }
    expect(formatDate('2026-04-13', prefs)).toBe('13/04/2026')
  })

  it('returns empty string on null/invalid input', () => {
    expect(formatDate(null)).toBe('')
    expect(formatDate(undefined)).toBe('')
    expect(formatDate('not a date')).toBe('')
  })
})

describe('formatDateShort', () => {
  it('drops the year in DD/MM', () => {
    expect(formatDateShort('2026-04-13', withFormat('dmy_slash'))).toBe('13/04')
  })

  it('drops the year in MM/DD', () => {
    expect(formatDateShort('2026-04-13', withFormat('mdy_slash'))).toBe('04/13')
  })

  it('uses day + short month for dmy_short', () => {
    expect(formatDateShort('2026-04-13', withFormat('dmy_short'))).toBe('13 Apr')
  })
})

describe('formatTime', () => {
  it('defaults to 24h', () => {
    const d = new Date('2026-04-13T14:05:00Z')
    expect(formatTime(d, { ...DEFAULT_PREFS, timezone: 'UTC' })).toBe('14:05')
  })

  it('switches to 12h when configured', () => {
    const d = new Date('2026-04-13T14:05:00Z')
    const prefs: RegionalPrefs = { ...DEFAULT_PREFS, timeFormat: '12h', timezone: 'UTC' }
    // en-US 12h formatter gives "02:05 PM" with a narrow non-breaking space.
    expect(formatTime(d, prefs).replace(/\s/g, ' ')).toBe('02:05 PM')
  })
})

describe('formatRelativeTime', () => {
  const now = new Date('2026-06-28T12:00:00Z')
  const ago = (ms: number) => new Date(now.getTime() - ms)
  const prefs: RegionalPrefs = { ...DEFAULT_PREFS, timezone: 'UTC' }

  it('shows "Just now" within the first minute', () => {
    expect(formatRelativeTime(ago(0), prefs, now)).toBe('Just now')
    expect(formatRelativeTime(ago(59_000), prefs, now)).toBe('Just now')
  })

  it('treats minor future skew as "Just now"', () => {
    expect(formatRelativeTime(new Date(now.getTime() + 5_000), prefs, now)).toBe('Just now')
  })

  it('renders minutes with pluralisation', () => {
    expect(formatRelativeTime(ago(60_000), prefs, now)).toBe('1 min ago')
    expect(formatRelativeTime(ago(5 * 60_000), prefs, now)).toBe('5 mins ago')
  })

  it('renders hours with pluralisation', () => {
    expect(formatRelativeTime(ago(60 * 60_000), prefs, now)).toBe('1 hour ago')
    expect(formatRelativeTime(ago(3 * 60 * 60_000), prefs, now)).toBe('3 hours ago')
  })

  it('renders days with pluralisation', () => {
    expect(formatRelativeTime(ago(24 * 60 * 60_000), prefs, now)).toBe('1 day ago')
    expect(formatRelativeTime(ago(3 * 24 * 60 * 60_000), prefs, now)).toBe('3 days ago')
  })

  it('switches to an absolute date + time stamp past the cutoff', () => {
    const old = ago(RELATIVE_TIME_CUTOFF_MS)
    // 7 days before 2026-06-28T12:00Z is 2026-06-21T12:00Z.
    expect(formatRelativeTime(old, prefs, now)).toBe('21/06/2026 12:00')
  })

  it('returns empty string on null/invalid input', () => {
    expect(formatRelativeTime(null, prefs, now)).toBe('')
    expect(formatRelativeTime('not a date', prefs, now)).toBe('')
  })
})
