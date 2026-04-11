import { api } from './client'

export interface PublicProfile {
  id: string
  display_name: string
  bio?: string
  location?: string
  club?: string
  avatar_url?: string
  created_at: string
}

export interface UpdateProfileInput {
  display_name?: string
  bio?: string
  location?: string
  club?: string
}

export const usersApi = {
  getProfile: (id: string) => api.get<PublicProfile>(`/users/${id}`),
  updateMe: (input: UpdateProfileInput) => api.patch<{ id: string; email: string; display_name: string; bio?: string; location?: string; club?: string; avatar_url?: string }>('/users/me', input),
}
