import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

const KEY = 'sub12_refresh_token'

// Native builds can't rely on the SameSite=Lax refresh cookie (the WebView
// doesn't send it cross-site to the API host), so the refresh token must live on
// the device. Keep it in native app storage (Capacitor Preferences) rather than
// the WebView's localStorage, so it isn't persisted under the web origin. All
// functions no-op on web, where the httpOnly cookie remains the source of truth.

export async function loadStoredRefreshToken(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null
  try {
    const { value } = await Preferences.get({ key: KEY })
    return value ?? null
  } catch {
    return null
  }
}

export function saveStoredRefreshToken(token: string): void {
  if (!Capacitor.isNativePlatform()) return
  if (!token) {
    clearStoredRefreshToken()
    return
  }
  void Preferences.set({ key: KEY, value: token }).catch(() => {})
}

export function clearStoredRefreshToken(): void {
  if (!Capacitor.isNativePlatform()) return
  void Preferences.remove({ key: KEY }).catch(() => {})
}
