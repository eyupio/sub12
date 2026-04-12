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

export interface FollowStats {
  follower_count: number
  following_count: number
  is_following: boolean
}

export interface PublicProfileWithFollow extends PublicProfile, FollowStats {}

export interface UpdateProfileInput {
  display_name?: string
  bio?: string
  location?: string
  club?: string
}

export const usersApi = {
  getProfile: (id: string) => api.get<PublicProfileWithFollow>(`/users/${id}`),
  follow: (id: string) => api.post<{ following: boolean }>(`/users/${id}/follow`, {}),
  unfollow: (id: string) => api.del<{ following: boolean }>(`/users/${id}/follow`),
  updateMe: (input: UpdateProfileInput) => api.patch<{ id: string; email: string; display_name: string; bio?: string; location?: string; club?: string; avatar_url?: string }>('/users/me', input),
  uploadAvatar: (file: File) => {
    const formData = new FormData()
    formData.append('image', file)
    return api.upload<{ id: string; email: string; display_name: string; bio?: string; location?: string; club?: string; avatar_url?: string }>('/users/me/avatar', formData)
  },
  requestEmailChange: (email: string) => api.post<{ message: string }>('/users/me/email', { email }),
  confirmEmailChange: (token: string) => api.post<{ id: string; email: string; display_name: string }>('/users/me/email/confirm', { token }),
}
