import { api } from './client'

export interface League {
  id: string
  name: string
  description?: string
  type: string
  created_by: string
  member_count: number
  created_at: string
}

export interface LeagueStanding {
  rank: number
  user_id: string
  username: string
  best_score: number | null
  best_x: number | null
  card_count: number
  joined_at: string
}

export interface CreateLeaguePayload {
  name: string
  description?: string
}

export const leagueApi = {
  list: () =>
    api.get<{ items: League[] }>('/leagues'),

  create: (payload: CreateLeaguePayload) =>
    api.post<League>('/leagues', payload),

  join: (id: string) =>
    api.post<{ joined: boolean }>(`/leagues/${id}/join`, {}),

  standings: (id: string) =>
    api.get<{ items: LeagueStanding[] }>(`/leagues/${id}/standings`),
}
