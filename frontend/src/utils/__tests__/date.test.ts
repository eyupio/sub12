import { describe, it, expect } from 'vitest'

import { DEFAULT_PREFS, formatDate, formatDateShort, formatTime, type RegionalPrefs } from '../date'

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
