import { api } from './client'

export interface AchievementDef {
  id: string
  name: string
  description: string
  icon: string
}

export interface Achievement extends AchievementDef {
  earned_at: string
}

export const achievementApi = {
  listDefs: () =>
    api.get<{ items: AchievementDef[] }>('/achievements'),

  listMine: () =>
    api.get<{ items: Achievement[] }>('/users/me/achievements'),

  listForUser: (userId: string) =>
    api.get<{ items: Achievement[] }>(`/users/${userId}/achievements`),
}
