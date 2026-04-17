import { api } from './client'

export const privacyApi = {
  mute: (userId: string) => api.post<{ muted: boolean }>(`/users/${userId}/mute`, {}),
  unmute: (userId: string) => api.del<{ muted: boolean }>(`/users/${userId}/mute`),
  listMuted: () => api.get<{ items: string[] }>('/users/me/mutes'),
}
