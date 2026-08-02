import { api } from './client'

export interface ScoreCardSummary {
  id: string
  shot_at: string
  total_score: number
  x_count: number
  location?: string
  location_lat?: number
  location_lng?: number
  rifle_id?: string
  pellet_id?: string
  verification: string
  league_round_id?: string
  league_id?: string
  league_name?: string
  club_id?: string
  card_image_url?: string
  card_image_rotation?: number
  location_id?: string
  is_draft: boolean
  event_participant_id?: string
  created_at: string
}

export interface ScoreCardAuthor {
  id: string
  display_name: string
  avatar_url?: string
  location?: string
  bio?: string
  star_level: number
}

export interface ScoreCardAchievement {
  id: string
  name: string
  icon: string
  earned_at: string
}

export interface ScoreCard extends ScoreCardSummary {
  user_id: string
  rifle_id?: string
  pellet_id?: string
  wind_mph?: number
  temp_celsius?: number
  distance_m?: number
  discipline?: string
  notes?: string
  shot_scores: number[]
  shot_xs: boolean[]
  card_image_url?: string
  verification: string
  visibility: string
  league_round_id?: string
  club_id?: string
  like_count: number
  comment_count: number
  is_liked: boolean
  is_draft: boolean
  card_image_rotation?: number
  location_id?: string
  updated_at: string
  author?: ScoreCardAuthor
  achievements?: ScoreCardAchievement[]
  is_pb: boolean
  pb_delta?: number
  running_avg?: number
  event_participant_id?: string
}

export interface QuickCreateScoreCardPayload {
  rifle_id?: string
  pellet_id?: string
  shot_at?: string
  location?: string
  location_lat?: number
  location_lng?: number
  location_id?: string
  wind_mph?: number
  temp_celsius?: number
  distance_m?: number
  discipline?: string
  notes?: string
  league_round_id?: string
  club_id?: string
  visibility?: string
  event_participant_id?: string
}

export interface CreateScoreCardPayload {
  shot_at: string
  shot_scores: number[]
  shot_xs: boolean[]
  location?: string
  location_lat?: number
  location_lng?: number
  location_id?: string
  wind_mph?: number
  temp_celsius?: number
  distance_m?: number
  discipline?: string
  notes?: string
  rifle_id?: string
  pellet_id?: string
  league_round_id?: string
  club_id?: string
  visibility?: string
  event_participant_id?: string
}

export interface UpdateScoreCardPayload {
  shot_at?: string
  shot_scores?: number[]
  shot_xs?: boolean[]
  location?: string
  location_lat?: number
  location_lng?: number
  location_id?: string
  wind_mph?: number
  temp_celsius?: number
  distance_m?: number
  discipline?: string
  notes?: string
  rifle_id?: string
  pellet_id?: string
  league_round_id?: string
  club_id?: string
  visibility?: string
  card_image_rotation?: number
  // Empty string withdraws the card from its event; omit to keep the link.
  event_participant_id?: string
}

export interface Comment {
  id: string
  target_id: string
  target_type: string
  parent_id?: string
  user_id: string
  display_name: string
  avatar_url?: string
  body: string
  like_count: number
  reply_count: number
  is_liked: boolean
  is_flagged?: boolean
  flag_reason?: string | null
  created_at: string
  updated_at: string
}

export const scoreCardApi = {
  create: (payload: CreateScoreCardPayload) =>
    api.post<ScoreCard>('/score-cards', payload),

  quickCreate: (payload: QuickCreateScoreCardPayload) =>
    api.post<ScoreCard>('/score-cards/quick', payload),

  graduate: (id: string) =>
    api.post<ScoreCard>(`/score-cards/${id}/graduate`, {}),

  draftCount: () =>
    api.get<{ count: number }>('/score-cards/drafts/count'),

  list: (limit = 20, offset = 0, scope?: 'personal' | 'league' | 'club' | 'drafts', leagueId?: string) => {
    let url = `/score-cards?limit=${limit}&offset=${offset}`
    if (scope) url += `&scope=${scope}`
    if (leagueId) url += `&league_id=${leagueId}`
    return api.get<{ items: ScoreCardSummary[] }>(url)
  },

  get: (id: string) =>
    api.get<ScoreCard>(`/score-cards/${id}`),

  update: (id: string, payload: UpdateScoreCardPayload) =>
    api.patch<ScoreCard>(`/score-cards/${id}`, payload),

  rotate: (id: string, rotation: number) =>
    api.post<ScoreCard>(`/score-cards/${id}/rotate`, { rotation }),

  remove: (id: string) =>
    api.del<void>(`/score-cards/${id}`),

  uploadImage: (cardId: string, file: File) => {
    const formData = new FormData()
    formData.append('image', file)
    return api.upload<{ card_image_url: string }>(`/score-cards/${cardId}/image`, formData)
  },

  submitToLeague: (cardId: string, leagueRoundId: string) =>
    api.post<ScoreCard>(`/score-cards/${cardId}/submit-to-league`, { league_round_id: leagueRoundId }),

  submitToEvent: (cardId: string, eventSlug: string) =>
    api.post<ScoreCard>(`/score-cards/${cardId}/submit-to-event`, { event_slug: eventSlug }),

  listComments: (cardId: string) =>
    api.get<{ items: Comment[] }>(`/score-cards/${cardId}/comments`),

  createComment: (cardId: string, body: string, parentId?: string) =>
    api.post<Comment>(`/score-cards/${cardId}/comments`, { body, parent_id: parentId }),

  updateComment: (cardId: string, commentId: string, body: string) =>
    api.patch<Comment>(`/score-cards/${cardId}/comments/${commentId}`, { body }),

  deleteComment: (cardId: string, commentId: string) =>
    api.del<void>(`/score-cards/${cardId}/comments/${commentId}`),
}

export const commentApi = {
  listReplies: (commentId: string) =>
    api.get<{ items: Comment[] }>(`/comments/${commentId}/replies`),

  reply: (commentId: string, body: string) =>
    api.post<Comment>(`/comments/${commentId}/replies`, { body }),

  update: (commentId: string, body: string) =>
    api.patch<Comment>(`/comments/${commentId}`, { body }),

  delete: (commentId: string) =>
    api.del<void>(`/comments/${commentId}`),

  flag: (commentId: string, reason: string) =>
    api.post<{ flagged: boolean }>(`/comments/${commentId}/flag`, { reason }),

  unflag: (commentId: string) =>
    api.post<{ flagged: boolean }>(`/comments/${commentId}/unflag`, {}),
}
