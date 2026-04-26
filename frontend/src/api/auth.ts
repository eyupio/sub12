import { api } from './client'

export interface AuthTokens {
  access_token: string
  refresh_token: string
  expires_in: number
}

export interface User {
  id: string
  email: string
  display_name: string
  role?: string
  bio?: string
  location?: string
  club?: string
  avatar_url?: string
  totp_enabled?: boolean
  totp_enrolled_at?: string
  created_at: string
}

interface AuthResponse {
  user: User
  tokens: AuthTokens
}

// Raw shape returned by POST /auth/login. The backend returns one of two
// payloads depending on whether the account has 2FA enabled — either the
// completed `{user, tokens}` pair, or a `{requires_2fa, challenge_token}`
// envelope that the caller must exchange via /auth/login/2fa.
interface LoginRaw {
  user?: User
  tokens?: AuthTokens
  requires_2fa?: boolean
  challenge_token?: string
}

export type LoginResult =
  | { kind: 'complete'; user: User; tokens: AuthTokens }
  | { kind: 'challenge'; challengeToken: string }

export const authApi = {
  register: (email: string, displayName: string, password: string) =>
    api.post<AuthResponse>('/auth/register', { email, display_name: displayName, password }),

  login: async (email: string, password: string): Promise<LoginResult> => {
    const r = await api.post<LoginRaw>('/auth/login', { email, password })
    if (r.requires_2fa && r.challenge_token) {
      return { kind: 'challenge', challengeToken: r.challenge_token }
    }
    if (!r.user || !r.tokens) {
      throw new Error('login response missing user or tokens')
    }
    return { kind: 'complete', user: r.user, tokens: r.tokens }
  },

  refresh: (refreshToken: string) =>
    api.post<AuthTokens>('/auth/refresh', { refresh_token: refreshToken }),

  logout: (refreshToken: string) =>
    api.post<void>('/auth/logout', { refresh_token: refreshToken }),

  forgotPassword: (email: string) =>
    api.post<{ message: string }>('/auth/forgot-password', { email }),

  resetPassword: (token: string, newPassword: string) =>
    api.post<{ ok: boolean }>('/auth/reset-password', { token, new_password: newPassword }),
}
