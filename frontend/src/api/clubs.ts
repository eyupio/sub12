import { api } from './client'
import type { League, CreateLeaguePayload } from './leagues'

export interface Club {
  id: string
  name: string
  description?: string
  image_url?: string
  join_code: string
  type: string
  join_policy: string
  post_visibility: 'members' | 'public'
  allow_member_invites: boolean
  date_format: string
  time_format: string
  timezone: string
  created_by: string
  created_at: string
  updated_at: string
  member_count: number
  league_count?: number
  is_admin?: boolean
  is_member?: boolean
}

export interface ClubMember {
  user_id: string
  display_name: string
  avatar_url?: string
  is_admin: boolean
  joined_at: string
}

export interface ClubStanding {
  rank: number
  user_id: string
  display_name: string
  avatar_url?: string
  best_score?: number
  best_x?: number
  card_count: number
}

export interface ClubJoinRequest {
  id: string
  club_id: string
  user_id: string
  display_name?: string
  avatar_url?: string
  status: string
  decided_by?: string
  decided_at?: string
  created_at: string
}

export interface CreateClubInput {
  name: string
  description?: string
  type?: 'public' | 'private'
  join_policy?: 'open' | 'invite_code' | 'approval'
}

export interface UpdateClubInput {
  name?: string
  description?: string
  type?: 'public' | 'private'
  join_policy?: 'open' | 'invite_code' | 'approval'
  post_visibility?: 'members' | 'public'
  allow_member_invites?: boolean
  date_format?: string
  time_format?: string
  timezone?: string
}

export const clubsApi = {
  list: () =>
    api.get<{ items: Club[] }>('/clubs'),

  get: (id: string) =>
    api.get<Club>(`/clubs/${id}`),

  summary: (id: string) =>
    api.get<{ id: string; name: string; description?: string; image_url?: string; type: string; join_policy: string; member_count: number }>(`/clubs/${id}/summary`),

  create: (input: CreateClubInput) =>
    api.post<Club>('/clubs', input),

  join: (id: string, joinCode?: string) =>
    api.post<{ joined?: boolean; pending?: boolean }>(`/clubs/${id}/join`, { join_code: joinCode ?? '' }),

  listMembers: (id: string) =>
    api.get<{ items: ClubMember[] }>(`/clubs/${id}/members`),

  getStandings: (id: string) =>
    api.get<{ items: ClubStanding[] }>(`/clubs/${id}/standings`),

  removeMember: (clubId: string, userId: string) =>
    api.del<void>(`/clubs/${clubId}/members/${userId}`),

  uploadImage: (clubId: string, file: File) => {
    const fd = new FormData()
    fd.append('image', file)
    return api.upload<{ image_url: string }>(`/clubs/${clubId}/image`, fd)
  },

  listLeagues: (clubId: string) =>
    api.get<{ items: League[] }>(`/clubs/${clubId}/leagues`),

  createLeague: (clubId: string, payload: Omit<CreateLeaguePayload, 'club_id'>) =>
    api.post<League>(`/clubs/${clubId}/leagues`, payload),

  update: (id: string, input: UpdateClubInput) =>
    api.patch<Club>(`/clubs/${id}`, input),

  leave: (id: string) =>
    api.del<void>(`/clubs/${id}/members/me`),

  updateMember: (clubId: string, userId: string, input: { is_admin: boolean }) =>
    api.patch<{ updated: boolean }>(`/clubs/${clubId}/members/${userId}`, input),

  listJoinRequests: (clubId: string, status = 'pending') =>
    api.get<{ items: ClubJoinRequest[] }>(`/clubs/${clubId}/join-requests?status=${encodeURIComponent(status)}`),

  decideJoinRequest: (clubId: string, requestId: string, decision: 'approved' | 'rejected') =>
    api.post<{ decided: boolean }>(`/clubs/${clubId}/join-requests/${requestId}/decide`, { decision }),

  regenerateJoinCode: (id: string) =>
    api.post<{ join_code: string }>(`/clubs/${id}/join-code`, {}),
}
