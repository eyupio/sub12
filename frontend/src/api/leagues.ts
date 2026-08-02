import { api } from './client'
import type { ModeratorPermissionsResponse } from '../utils/moderators'

export interface League {
  id: string
  name: string
  /** Human-readable identifier used in public share URLs. */
  slug?: string
  description?: string
  type: string
  post_visibility: 'members' | 'public'
  join_code?: string
  image_url?: string
  club_id?: string
  created_by: string
  member_count: number
  date_format: string
  time_format: string
  timezone: string
  created_at: string
}

export interface LeagueStanding {
  rank: number
  user_id: string
  display_name: string
  avatar_url?: string
  best_score: number | null
  best_x: number | null
  card_count: number
  joined_at: string
}

export interface CreateLeaguePayload {
  name: string
  description?: string
  type?: 'public' | 'private'
  club_id?: string
  scoring_rule?: 'highest' | 'average'
  join_policy?: 'open' | 'invite_code' | 'approval'
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
  lock_edits_after_verification: boolean
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
  lock_edits_after_verification?: boolean
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

// Omit a field to keep it; send an empty string to clear it. is_active is the
// archive switch — an archived season keeps its cards but takes no new ones.
export interface UpdateSeasonPayload {
  name?: string
  starts_on?: string
  ends_on?: string
  is_active?: boolean
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

// Same convention as UpdateSeasonPayload: clearing both dates makes the round
// permanently open again.
export interface UpdateRoundPayload {
  name?: string
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
  /** Legacy spelling of is_moderator, still sent by the API. */
  is_admin: boolean
  is_moderator: boolean
  is_owner: boolean
  /** Omitted for viewers who do not help run the league. */
  permissions?: string[]
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
  action: 'amend' | 'reject' | 'reopen'
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
  avatar_url?: string
  shot_at: string
  total_score: number
  x_count: number
  verification: string
  created_at: string
}

/** The round a new submission will land in, named for display. */
export interface ActiveRound {
  round_id: string
  round_name: string
  season_name: string
}

export interface LeagueScoreCounts {
  all: number
  pending: number
  verified: number
  rejected: number
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

export interface ScoreCardLeague {
  id: string
  name: string
  round_id?: string
  round_name?: string
}

export interface LeagueSummary {
  id: string
  name: string
  description?: string
  image_url?: string
  type: string
  join_policy: string
  post_visibility: 'members' | 'public'
  member_count: number
  club_id?: string
}

export const leagueApi = {
  // My leagues (dashboard)
  listMine: () =>
    api.get<{ items: MyLeagueSummary[] }>('/users/me/leagues'),

  // Core league CRUD
  list: (params?: { code?: string }) => {
    const code = params?.code?.trim()
    const qs = code ? `?code=${encodeURIComponent(code)}` : ''
    return api.get<{ items: League[] }>(`/leagues${qs}`)
  },

  get: (id: string) =>
    api.get<League>(`/leagues/${id}`),

  // Minimal public-safe summary for rendering a members-only banner
  // on private leagues without leaking members/standings/posts.
  summary: (id: string) =>
    api.get<LeagueSummary>(`/leagues/${id}/summary`),

  create: (payload: CreateLeaguePayload) =>
    api.post<League>('/leagues', payload),

  update: (
    id: string,
    payload: {
      name?: string
      description?: string
      type?: 'public' | 'private'
      post_visibility?: 'members' | 'public'
      date_format?: string
      time_format?: string
      timezone?: string
    },
  ) => api.patch<League>(`/leagues/${id}`, payload),

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

  updateSeason: (leagueId: string, seasonId: string, payload: UpdateSeasonPayload) =>
    api.patch<Season>(`/leagues/${leagueId}/seasons/${seasonId}`, payload),

  deleteSeason: (leagueId: string, seasonId: string) =>
    api.del<void>(`/leagues/${leagueId}/seasons/${seasonId}`),

  // Rounds
  listRounds: (leagueId: string, seasonId: string) =>
    api.get<{ items: Round[] }>(`/leagues/${leagueId}/seasons/${seasonId}/rounds`),

  createRound: (leagueId: string, seasonId: string, payload: CreateRoundPayload) =>
    api.post<Round>(`/leagues/${leagueId}/seasons/${seasonId}/rounds`, payload),

  updateRound: (leagueId: string, seasonId: string, roundId: string, payload: UpdateRoundPayload) =>
    api.patch<Round>(`/leagues/${leagueId}/seasons/${seasonId}/rounds/${roundId}`, payload),

  deleteRound: (leagueId: string, seasonId: string, roundId: string) =>
    api.del<void>(`/leagues/${leagueId}/seasons/${seasonId}/rounds/${roundId}`),

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

  updateMember: (
    leagueId: string,
    userId: string,
    input: { is_moderator?: boolean; permissions?: string[] },
  ) => api.patch<{ updated: boolean }>(`/leagues/${leagueId}/members/${userId}`, input),

  /** The capabilities a league owner can delegate, plus the caller's own role. */
  getModeratorPermissions: (leagueId: string) =>
    api.get<ModeratorPermissionsResponse>(`/leagues/${leagueId}/moderator-permissions`),

  leave: (id: string) =>
    api.del<void>(`/leagues/${id}/members/me`),

  // Score verification
  getLeagueForScoreCard: (scoreCardId: string) =>
    api.get<ScoreCardLeague>(`/score-cards/${scoreCardId}/league`),

  confirmScore: (scoreCardId: string) =>
    api.post<{ confirmed: boolean }>(`/score-cards/${scoreCardId}/confirmations`, {}),

  getAuditTrail: (scoreCardId: string) =>
    api.get<{ confirmations: ScoreConfirmation[]; actions: ScoreCardAction[] }>(`/score-cards/${scoreCardId}/audit-trail`),

  amendScore: (scoreCardId: string, payload: { new_total_score: number; new_x_count: number; reason?: string }) =>
    api.post(`/score-cards/${scoreCardId}/amend`, payload),

  rejectScore: (scoreCardId: string, reason: string) =>
    api.post(`/score-cards/${scoreCardId}/reject`, { reason }),

  // Returns a rejected card to the pending queue (league moderators only).
  reopenScore: (scoreCardId: string, reason?: string) =>
    api.post<{ reopened: boolean }>(`/score-cards/${scoreCardId}/reopen`, { reason }),

  // League scores
  listScores: (id: string, limit = 50, offset = 0, verification?: string) => {
    let url = `/leagues/${id}/scores?limit=${limit}&offset=${offset}`
    if (verification) url += `&verification=${verification}`
    return api.get<{ items: LeagueScore[] }>(url)
  },

  // Per-status tally of submitted cards — one call instead of paging the
  // score list once per verification status just to render tab counters.
  scoreCounts: (id: string) =>
    api.get<LeagueScoreCounts>(`/leagues/${id}/score-counts`),

  ensureDefaultRound: (id: string) =>
    api.post<ActiveRound>(`/leagues/${id}/ensure-round`, {}),

  uploadImage: (id: string, file: File) => {
    const formData = new FormData()
    formData.append('image', file)
    return api.upload<{ image_url: string }>(`/leagues/${id}/image`, formData)
  },
}
