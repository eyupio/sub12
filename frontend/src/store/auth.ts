import { Capacitor } from '@capacitor/core'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  id: string
  email: string
  display_name: string
  role?: string
  bio?: string
  location?: string
  club?: string
  avatar_url?: string
  profile_visibility?: string
  default_score_visibility?: string
  feed_opt_out?: boolean
  show_follower_counts?: boolean
  star_level?: number
  default_distance_unit?: string
  default_measurement_unit?: string
  date_format?: string
  time_format?: string
  timezone?: string
  totp_enabled?: boolean
  totp_enrolled_at?: string
}

interface AuthState {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  setAuth: (user: User, accessToken: string, refreshToken: string) => void
  updateUser: (partial: Partial<User>) => void
  clearAuth: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      setAuth: (user, accessToken, refreshToken) =>
        set({ user, accessToken, refreshToken }),
      updateUser: (partial) =>
        set((s) => ({ user: s.user ? { ...s.user, ...partial } : s.user })),
      clearAuth: () =>
        set({ user: null, accessToken: null, refreshToken: null }),
    }),
    {
      name: 'sub12-auth',
      // Web/PWA: persist only the user record. Both tokens stay out of
      // localStorage — the access token is in-memory only, and the refresh token
      // lives exclusively in an httpOnly cookie set by the backend
      // (Path=/api/v1/auth). Persisting the user lets us rehydrate identity on
      // reload and trigger a cookie-based refresh; an XSS payload reading
      // localStorage gets nothing it can replay against the API.
      //
      // Native: the SameSite=Lax cookie is not delivered cross-site to the API
      // host, so the refresh token must be persisted to survive an app restart.
      // A native WebView has no shared/scriptable localStorage with the web
      // origin, so this is the standard mobile trade-off.
      partialize: (s) =>
        Capacitor.isNativePlatform()
          ? { user: s.user, refreshToken: s.refreshToken }
          : { user: s.user },
    },
  ),
)
