import { api } from './client'

export interface ScoreCardSummary {
  id: string
  shot_at: string
  total_score: number
  x_count: number
  location?: string
  created_at: string
}

export interface ScoreCard extends ScoreCardSummary {
  user_id: string
  rifle_id?: string
  pellet_id?: string
  wind_mph?: number
  temp_celsius?: number
  notes?: string
  shot_scores: number[]
  shot_xs: boolean[]
  card_image_url?: string
  verification: string
  league_round_id?: string
  updated_at: string
}

export interface CreateScoreCardPayload {
  shot_at: string
  shot_scores: number[]
  shot_xs: boolean[]
  location?: string
  wind_mph?: number
  temp_celsius?: number
  notes?: string
  rifle_id?: string
  pellet_id?: string
}

export const scoreCardApi = {
  create: (payload: CreateScoreCardPayload) =>
    api.post<ScoreCard>('/score-cards', payload),

  list: (limit = 20, offset = 0) =>
    api.get<{ items: ScoreCardSummary[] }>(`/score-cards?limit=${limit}&offset=${offset}`),

  get: (id: string) =>
    api.get<ScoreCard>(`/score-cards/${id}`),

  update: (id: string, payload: CreateScoreCardPayload) =>
    api.patch<ScoreCard>(`/score-cards/${id}`, payload),

  uploadImage: (cardId: string, file: File) => {
    const formData = new FormData()
    formData.append('image', file)
    return api.upload<{ card_image_url: string }>(`/score-cards/${cardId}/image`, formData)
  },
}
