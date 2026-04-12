import { api } from './client'

export interface League {
  id: string
  name: string
  description?: string
  type: string
  join_code?: string
  image_url?: string
  created_by: string
  member_count: number
  created_at: string
}

export interface LeagueStanding {
  rank: number
  user_id: string
  display_name: string
  best_score: number | null
  best_x: number | null
  card_count: number
  joined_at: string
}

export interface CreateLeaguePayload {
  name: string
  description?: string
  type?: 'public' | 'private'
}

export interface LeagueConfig {
  league_id: string
  starts_on?: string
  ends_on?: string
  max_submissions_per_round: number
  scoring_rule: 'highest' | 'average'
  join_policy: 'open' | 'invite_code' | 'approval'
  require_score_verification: boolean
  required_confirmations: number
  require_image_upload: boolean
  updated_at: string
}

export interface UpdateLeagueConfigPayload {
  starts_on?: string
  ends_on?: string
  max_submissions_per_round?: number
  scoring_rule?: string
  join_policy?: string
  require_score_verification?: boolean
  required_confirmations?: number
  require_image_upload?: boolean
}

export interface Season {
  id: string
  league_id: string
  name: string
  starts_on: string
  ends_on?: string
  is_active: boolean
  created_at: string
}

export interface CreateSeasonPayload {
  name: string
  starts_on: string
  ends_on?: string
}

export interface Round {
  id: string
  season_id: string
  name: string
  opens_at?: string
  closes_at?: string
  created_at: string
}

export interface CreateRoundPayload {
  name: string
  opens_at?: string
  closes_at?: string
}

export interface JoinRequest {
  id: string
  league_id: string
  user_id: string
  display_name: string
  status: string
  decided_by?: string
  decided_at?: string
  created_at: string
}

export interface LeagueMember {
  user_id: string
  display_name: string
  is_admin: boolean
  joined_at: string
}

export interface ScoreConfirmation {
  id: string
  score_card_id: string
  confirmed_by: string
  display_name: string
  created_at: string
}

export interface ScoreCardAction {
  id: string
  score_card_id: string
  action: 'amend' | 'reject'
  performed_by: string
  display_name: string
  reason?: string
  old_total_score?: number
  new_total_score?: number
  old_x_count?: number
  new_x_count?: number
  created_at: string
}

export interface LeagueScore {
  id: string
  user_id: string
  display_name: string
  shot_at: string
  total_score: number
  x_count: number
  verification: string
  created_at: string
}

export interface MyLeagueSummary {
  id: string
  name: string
  description?: string
  image_url?: string
  member_count: number
  user_rank: number
  starts_on?: string
  ends_on?: string
}

export const leagueApi = {
  // My leagues (dashboard)
  listMine: () =>
    api.get<{ items: MyLeagueSummary[] }>('/users/me/leagues'),

  // Core league CRUD
  list: () =>
    api.get<{ items: League[] }>('/leagues'),

  get: (id: string) =>
    api.get<League>(`/leagues/${id}`),

  create: (payload: CreateLeaguePayload) =>
    api.post<League>('/leagues', payload),

  join: (id: string, joinCode?: string) =>
    api.post<{ joined?: boolean; pending?: boolean }>(`/leagues/${id}/join`, { join_code: joinCode }),

  standings: (id: string) =>
    api.get<{ items: LeagueStanding[] }>(`/leagues/${id}/standings`),

  // League config
  getConfig: (id: string) =>
    api.get<LeagueConfig>(`/leagues/${id}/config`),

  updateConfig: (id: string, payload: UpdateLeagueConfigPayload) =>
    api.patch<LeagueConfig>(`/leagues/${id}/config`, payload),

  // Seasons
  listSeasons: (id: string) =>
    api.get<{ items: Season[] }>(`/leagues/${id}/seasons`),

  createSeason: (id: string, payload: CreateSeasonPayload) =>
    api.post<Season>(`/leagues/${id}/seasons`, payload),

  // Rounds
  listRounds: (leagueId: string, seasonId: string) =>
    api.get<{ items: Round[] }>(`/leagues/${leagueId}/seasons/${seasonId}/rounds`),

  createRound: (leagueId: string, seasonId: string, payload: CreateRoundPayload) =>
    api.post<Round>(`/leagues/${leagueId}/seasons/${seasonId}/rounds`, payload),

  // Members
  listMembers: (id: string) =>
    api.get<{ items: LeagueMember[] }>(`/leagues/${id}/members`),

  // Join requests (admin)
  listJoinRequests: (id: string, status?: string) =>
    api.get<{ items: JoinRequest[] }>(`/leagues/${id}/join-requests${status ? `?status=${status}` : ''}`),

  decideJoinRequest: (leagueId: string, requestId: string, decision: string) =>
    api.post<{ decided: boolean }>(`/leagues/${leagueId}/join-requests/${requestId}/decide`, { decision }),

  regenerateJoinCode: (id: string) =>
    api.post<{ join_code: string }>(`/leagues/${id}/join-code`, {}),

  removeMember: (leagueId: string, userId: string) =>
    api.del<void>(`/leagues/${leagueId}/members/${userId}`),

  // Score verification
  confirmScore: (scoreCardId: string, leagueId: string) =>
    api.post<{ confirmed: boolean }>(`/score-cards/${scoreCardId}/confirmations`, { league_id: leagueId }),

  getAuditTrail: (scoreCardId: string) =>
    api.get<{ confirmations: ScoreConfirmation[]; actions: ScoreCardAction[] }>(`/score-cards/${scoreCardId}/audit-trail`),

  amendScore: (scoreCardId: string, leagueId: string, payload: { new_total_score: number; new_x_count: number; reason?: string }) =>
    api.post(`/score-cards/${scoreCardId}/amend`, { league_id: leagueId, ...payload }),

  rejectScore: (scoreCardId: string, leagueId: string, reason: string) =>
    api.post(`/score-cards/${scoreCardId}/reject`, { league_id: leagueId, reason }),

  // League scores
  listScores: (id: string, limit = 50, offset = 0) =>
    api.get<{ items: LeagueScore[] }>(`/leagues/${id}/scores?limit=${limit}&offset=${offset}`),

  ensureDefaultRound: (id: string) =>
    api.post<{ round_id: string }>(`/leagues/${id}/ensure-round`, {}),

  uploadImage: (id: string, file: File) => {
    const formData = new FormData()
    formData.append('image', file)
    return api.upload<{ image_url: string }>(`/leagues/${id}/image`, formData)
  },
}
