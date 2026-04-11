import { api } from './client'

export interface UserStats {
  cards_logged: number
  best_score?: number
  best_x_count?: number
  avg_score?: number
}

export const statsApi = {
  getMe: () => api.get<UserStats>('/users/me/stats'),
}
