import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { saveStoredRefreshToken, clearStoredRefreshToken } from './nativeToken'

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
      setAuth: (user, accessToken, refreshToken) => {
        // Native keeps the refresh token in device storage (Capacitor
        // Preferences), not localStorage — see nativeToken.ts. No-op on web.
        saveStoredRefreshToken(refreshToken)
        set({ user, accessToken, refreshToken })
      },
      updateUser: (partial) =>
        set((s) => ({ user: s.user ? { ...s.user, ...partial } : s.user })),
      clearAuth: () => {
        clearStoredRefreshToken()
        set({ user: null, accessToken: null, refreshToken: null })
      },
    }),
    {
      name: 'sub12-auth',
      // Persist only the user record, on every platform. Tokens never touch
      // localStorage: the access token is in-memory only; the refresh token lives
      // in an httpOnly cookie on web (Path=/api/v1/auth) and in native device
      // storage on native (loaded into the store at startup — see main.tsx). An
      // XSS payload reading localStorage gets nothing it can replay against the
      // API. Persisting the user lets us rehydrate identity and trigger a refresh
      // on reload.
      partialize: (s) => ({ user: s.user }),
    },
  ),
)
