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
  created_at: string
}

interface AuthResponse {
  user: User
  tokens: AuthTokens
}

export const authApi = {
  register: (email: string, displayName: string, password: string) =>
    api.post<AuthResponse>('/auth/register', { email, display_name: displayName, password }),

  login: (email: string, password: string) =>
    api.post<AuthResponse>('/auth/login', { email, password }),

  refresh: (refreshToken: string) =>
    api.post<AuthTokens>('/auth/refresh', { refresh_token: refreshToken }),

  logout: (refreshToken: string) =>
    api.post<void>('/auth/logout', { refresh_token: refreshToken }),

  forgotPassword: (email: string) =>
    api.post<{ message: string }>('/auth/forgot-password', { email }),

  resetPassword: (token: string, newPassword: string) =>
    api.post<{ ok: boolean }>('/auth/reset-password', { token, new_password: newPassword }),
}
