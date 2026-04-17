import { api } from './client'

export interface MutedUser {
  muted_id: string
  display_name: string
  avatar_url?: string | null
  created_at: string
}

export const privacyApi = {
  mute: (userId: string) => api.post<{ muted: boolean }>(`/users/${userId}/mute`, {}),
  unmute: (userId: string) => api.del<{ muted: boolean }>(`/users/${userId}/mute`),
  listMuted: () => api.get<{ items: MutedUser[] }>('/users/me/mutes'),
}
