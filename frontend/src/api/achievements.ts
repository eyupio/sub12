import { api } from './client'

export interface Achievement {
  id: string
  name: string
  description: string
  icon: string
  earned_at: string
}

export const achievementApi = {
  listMine: () =>
    api.get<{ items: Achievement[] }>('/users/me/achievements'),

  listForUser: (userId: string) =>
    api.get<{ items: Achievement[] }>(`/users/${userId}/achievements`),
}
