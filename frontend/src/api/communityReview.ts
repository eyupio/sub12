import { api } from './client'
import type { ScoreConfirmation } from './leagues'

export interface CommunityReviewRequest {
  id: string
  score_card_id: string
  requested_by: string
  required_confirmations: number
  status: 'open' | 'verified' | 'cancelled'
  created_at: string
  resolved_at?: string
}

export interface CommunityReviewStatus {
  request?: CommunityReviewRequest
  confirmations: ScoreConfirmation[]
  confirmation_count: number
  viewer_has_confirmed: boolean
}

export const communityReviewApi = {
  get: (scoreCardId: string) =>
    api.get<CommunityReviewStatus>(`/score-cards/${scoreCardId}/review-request`),

  request: (scoreCardId: string) =>
    api.post<CommunityReviewRequest>(`/score-cards/${scoreCardId}/review-request`, {}),

  cancel: (scoreCardId: string) =>
    api.del<void>(`/score-cards/${scoreCardId}/review-request`),

  confirm: (scoreCardId: string) =>
    api.post<{ confirmed: boolean }>(`/score-cards/${scoreCardId}/review-request/confirm`, {}),
}
