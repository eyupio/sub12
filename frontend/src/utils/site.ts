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

// Direct download for the Android build. The Android APK workflow keeps the
// `android-latest` pre-release pointed at the newest `main` build under a fixed
// asset name, so this URL never has to change. VITE_ANDROID_APK_URL retargets it
// for forks and staging builds.
const CANONICAL_ANDROID_APK_URL =
  'https://github.com/eyupio/sub12/releases/download/android-latest/sub12.apk'

export function androidApkUrl(): string {
  return import.meta.env.VITE_ANDROID_APK_URL || CANONICAL_ANDROID_APK_URL
}

export function siteOrigin(): string {
  const override = import.meta.env.VITE_SITE_URL
  if (override) return override.replace(/\/+$/, '')
  if (Capacitor.isNativePlatform()) return CANONICAL_SITE_URL
  if (typeof window !== 'undefined') return window.location.origin
  return CANONICAL_SITE_URL
}
