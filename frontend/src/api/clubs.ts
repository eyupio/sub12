import { api } from './client'
import type { League, CreateLeaguePayload } from './leagues'
import type { ModeratorPermissionsResponse } from '../utils/moderators'

export interface Club {
  id: string
  name: string
  /** Human-readable identifier used in public share URLs. */
  slug?: string
  description?: string
  image_url?: string
  join_code: string
  type: string
  join_policy: string
  post_visibility: 'members' | 'public'
  date_format: string
  time_format: string
  timezone: string
  created_by: string
  created_at: string
  updated_at: string
  member_count: number
  league_count: number
  /** Legacy spelling of is_moderator, still sent by the API. */
  is_admin?: boolean
  is_member?: boolean
  /** Viewer runs the club (owner or promoted moderator). */
  is_moderator?: boolean
  is_owner?: boolean
  /** Viewer's effective capabilities — the whole catalogue for an owner. */
  permissions?: string[]

  // Real-world profile — all optional.
  website_url?: string
  contact_email?: string
  contact_phone?: string
  address_line1?: string
  address_line2?: string
  city?: string
  region?: string
  postcode?: string
  country?: string
  latitude?: number
  longitude?: number
  disciplines: string[]
  distances: string[]
  facilities: string[]
  membership_info?: string
  visitor_policy?: string
  established_year?: number

  /** Only present when the directory was queried with a viewer location. */
  distance_km?: number
}

export interface ClubSummary {
  id: string
  name: string
  description?: string
  image_url?: string
  type: string
  join_policy: string
  member_count: number
  city?: string
  region?: string
  country?: string
  disciplines: string[]
}

/** One published session slot. day_of_week is 0 = Monday through 6 = Sunday. */
export interface ClubOpeningHours {
  id: string
  club_id: string
  day_of_week: number
  opens_at?: string
  closes_at?: string
  is_closed: boolean
  note?: string
}

export interface ClubOpeningHoursInput {
  day_of_week: number
  opens_at: string | null
  closes_at: string | null
  is_closed: boolean
  note: string | null
}

export const DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const

export interface ClubMember {
  user_id: string
  display_name: string
  avatar_url?: string
  /** Legacy spelling of is_moderator, still sent by the API. */
  is_admin: boolean
  is_moderator: boolean
  is_owner: boolean
  /** Omitted for viewers who do not help run the club. */
  permissions?: string[]
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

/**
 * Text fields follow the API's "omit to keep, empty string to clear"
 * convention; arrays clear by sending an empty array. Coordinates only clear
 * via `clear_coordinates`.
 */
export interface UpdateClubInput {
  name?: string
  description?: string
  type?: 'public' | 'private'
  join_policy?: 'open' | 'invite_code' | 'approval'
  post_visibility?: 'members' | 'public'
  date_format?: string
  time_format?: string
  timezone?: string
  website_url?: string
  contact_email?: string
  contact_phone?: string
  address_line1?: string
  address_line2?: string
  city?: string
  region?: string
  postcode?: string
  country?: string
  latitude?: number
  longitude?: number
  clear_coordinates?: boolean
  disciplines?: string[]
  distances?: string[]
  facilities?: string[]
  membership_info?: string
  visitor_policy?: string
  established_year?: number
}

export interface ClubDirectoryParams {
  code?: string
  q?: string
  discipline?: string
  lat?: number
  lng?: number
  radiusKm?: number
}

export const clubsApi = {
  list: (params?: ClubDirectoryParams) => {
    const qs = new URLSearchParams()
    // A join code resolves a single club and overrides the other filters, so
    // send it alone.
    const code = params?.code?.trim()
    if (code) {
      qs.set('code', code)
    } else if (params) {
      if (params.q?.trim()) qs.set('q', params.q.trim())
      if (params.discipline) qs.set('discipline', params.discipline)
      if (params.lat != null && params.lng != null) {
        qs.set('lat', String(params.lat))
        qs.set('lng', String(params.lng))
        if (params.radiusKm != null) qs.set('radius_km', String(params.radiusKm))
      }
    }
    const query = qs.toString()
    return api.get<{ items: Club[] }>(`/clubs${query ? `?${query}` : ''}`)
  },

  listDisciplines: () =>
    api.get<{ items: string[] }>('/clubs/disciplines'),

  listMine: () =>
    api.get<{ items: Club[] }>('/users/me/clubs'),

  get: (id: string) =>
    api.get<Club>(`/clubs/${id}`),

  summary: (id: string) =>
    api.get<ClubSummary>(`/clubs/${id}/summary`),

  getOpeningHours: (id: string) =>
    api.get<{ items: ClubOpeningHours[] }>(`/clubs/${id}/opening-hours`),

  replaceOpeningHours: (id: string, items: ClubOpeningHoursInput[]) =>
    api.put<{ items: ClubOpeningHours[] }>(`/clubs/${id}/opening-hours`, { items }),

  remove: (id: string) =>
    api.del<void>(`/clubs/${id}`),

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

  updateMember: (
    clubId: string,
    userId: string,
    input: { is_moderator?: boolean; permissions?: string[] },
  ) => api.patch<{ updated: boolean }>(`/clubs/${clubId}/members/${userId}`, input),

  /** The capabilities a club owner can delegate, plus the caller's own role. */
  getModeratorPermissions: (clubId: string) =>
    api.get<ModeratorPermissionsResponse>(`/clubs/${clubId}/moderator-permissions`),

  listJoinRequests: (clubId: string, status = 'pending') =>
    api.get<{ items: ClubJoinRequest[] }>(`/clubs/${clubId}/join-requests?status=${encodeURIComponent(status)}`),

  decideJoinRequest: (clubId: string, requestId: string, decision: 'approved' | 'rejected') =>
    api.post<{ decided: boolean }>(`/clubs/${clubId}/join-requests/${requestId}/decide`, { decision }),

  regenerateJoinCode: (id: string) =>
    api.post<{ join_code: string }>(`/clubs/${id}/join-code`, {}),
}
