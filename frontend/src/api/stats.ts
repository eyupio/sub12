import { api } from './client'

export interface UserStats {
  cards_logged: number
  best_score?: number
  best_x_count?: number
  avg_score?: number
}

export interface RifleStats {
  rifle_id: string
  best_score: number
  best_x_count: number
  card_count: number
}

export interface ScoreTrendPoint {
  period: string
  avg_score: number
  best_score?: number
  std_dev: number
  card_count: number
}

export const statsApi = {
  getMe: () => api.get<UserStats>('/users/me/stats'),
  getRifleStats: () => api.get<{ items: RifleStats[] }>('/users/me/rifle-stats'),
  getScoreTrends: (period: 'week' | 'month' = 'week', rifleId?: string) => {
    const params = new URLSearchParams({ period })
    if (rifleId) params.set('rifle_id', rifleId)
    return api.get<{ items: ScoreTrendPoint[] }>(`/users/me/score-trends?${params}`)
  },
}
