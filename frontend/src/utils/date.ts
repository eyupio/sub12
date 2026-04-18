import { useAuthStore } from '../store/auth'

export type DateFormat = 'dmy_slash' | 'mdy_slash' | 'ymd_dash' | 'dmy_short'
export type TimeFormat = '24h' | '12h'

export interface RegionalPrefs {
  dateFormat: DateFormat
  timeFormat: TimeFormat
  timezone: string
}

export const DEFAULT_PREFS: RegionalPrefs = {
  dateFormat: 'dmy_slash',
  timeFormat: '24h',
  timezone: 'Europe/London',
}

export const DATE_FORMAT_OPTIONS: { value: DateFormat; label: string; preview: string }[] = [
  { value: 'dmy_slash', label: 'DD/MM/YYYY (UK)', preview: '13/04/2026' },
  { value: 'mdy_slash', label: 'MM/DD/YYYY (US)', preview: '04/13/2026' },
  { value: 'ymd_dash', label: 'YYYY-MM-DD (ISO)', preview: '2026-04-13' },
  { value: 'dmy_short', label: '13 Apr 2026', preview: '13 Apr 2026' },
]

function toDate(input: string | Date | null | undefined): Date | null {
  if (input == null) return null
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input
  // Treat bare YYYY-MM-DD as a local calendar date, not UTC midnight, so the
  // displayed day doesn't shift based on timezone.
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const [y, m, d] = input.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  const d = new Date(input)
  return isNaN(d.getTime()) ? null : d
}

function dateFormatOptions(format: DateFormat): {
  locale: string
  opts: Intl.DateTimeFormatOptions
} {
  switch (format) {
    case 'mdy_slash':
      return { locale: 'en-US', opts: { day: '2-digit', month: '2-digit', year: 'numeric' } }
    case 'ymd_dash':
      return { locale: 'sv-SE', opts: { day: '2-digit', month: '2-digit', year: 'numeric' } }
    case 'dmy_short':
      return { locale: 'en-GB', opts: { day: 'numeric', month: 'short', year: 'numeric' } }
    case 'dmy_slash':
    default:
      return { locale: 'en-GB', opts: { day: '2-digit', month: '2-digit', year: 'numeric' } }
  }
}

export function formatDate(input: string | Date | null | undefined, prefs: RegionalPrefs = DEFAULT_PREFS): string {
  const d = toDate(input)
  if (!d) return ''
  const { locale, opts } = dateFormatOptions(prefs.dateFormat)
  return new Intl.DateTimeFormat(locale, { ...opts, timeZone: prefs.timezone }).format(d)
}

// formatDateShort renders a compact day+month label (no year) suitable for
// chart axes and similar tight layouts.
export function formatDateShort(input: string | Date | null | undefined, prefs: RegionalPrefs = DEFAULT_PREFS): string {
  const d = toDate(input)
  if (!d) return ''
  const locale =
    prefs.dateFormat === 'mdy_slash' ? 'en-US' : prefs.dateFormat === 'ymd_dash' ? 'sv-SE' : 'en-GB'
  const opts: Intl.DateTimeFormatOptions =
    prefs.dateFormat === 'dmy_short'
      ? { day: 'numeric', month: 'short' }
      : { day: '2-digit', month: '2-digit' }
  return new Intl.DateTimeFormat(locale, { ...opts, timeZone: prefs.timezone }).format(d)
}

export function formatTime(input: string | Date | null | undefined, prefs: RegionalPrefs = DEFAULT_PREFS): string {
  const d = toDate(input)
  if (!d) return ''
  const locale = prefs.timeFormat === '12h' ? 'en-US' : 'en-GB'
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: prefs.timeFormat === '12h',
    timeZone: prefs.timezone,
  }).format(d)
}

export function formatDateTime(input: string | Date | null | undefined, prefs: RegionalPrefs = DEFAULT_PREFS): string {
  const datePart = formatDate(input, prefs)
  const timePart = formatTime(input, prefs)
  if (!datePart) return ''
  return timePart ? `${datePart} ${timePart}` : datePart
}

function normalizeDateFormat(v: string | undefined): DateFormat {
  return v === 'mdy_slash' || v === 'ymd_dash' || v === 'dmy_short' ? v : 'dmy_slash'
}

function normalizeTimeFormat(v: string | undefined): TimeFormat {
  return v === '12h' ? '12h' : '24h'
}

// useRegionalPrefs reads the authenticated user's regional preferences from
// the auth store, falling back to UK defaults for unauthenticated viewers.
export function useRegionalPrefs(): RegionalPrefs {
  const user = useAuthStore((s) => s.user)
  if (!user) return DEFAULT_PREFS
  return {
    dateFormat: normalizeDateFormat(user.date_format),
    timeFormat: normalizeTimeFormat(user.time_format),
    timezone: user.timezone || DEFAULT_PREFS.timezone,
  }
}
