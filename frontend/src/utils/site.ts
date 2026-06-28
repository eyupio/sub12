import { Capacitor } from '@capacitor/core'

// Canonical public web origin used to build user-facing, shareable links.
//
// On native the WebView is served from a local origin (capacitor://localhost on
// iOS, https://localhost on Android), so window.location.origin yields a URL that
// is meaningless outside the app. Any link a user might copy or send — share
// sheets, "copy link", external channels — must therefore point at the real
// public host instead. VITE_SITE_URL overrides at build time for staging/beta
// builds (mirrors VITE_API_URL in api/client.ts).
const CANONICAL_SITE_URL = 'https://sub12.io'

export function siteOrigin(): string {
  const override = import.meta.env.VITE_SITE_URL
  if (override) return override.replace(/\/+$/, '')
  if (Capacitor.isNativePlatform()) return CANONICAL_SITE_URL
  if (typeof window !== 'undefined') return window.location.origin
  return CANONICAL_SITE_URL
}
