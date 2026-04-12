import { api } from './client'

export interface Club {
  id: string
  name: string
  description?: string
  image_url?: string
  join_code: string
  created_by: string
  created_at: string
  updated_at: string
  member_count: number
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

export interface CreateClubInput {
  name: string
  description?: string
}

export const clubsApi = {
  list: () =>
    api.get<{ items: Club[] }>('/clubs'),

  get: (id: string) =>
    api.get<Club>(`/clubs/${id}`),

  create: (input: CreateClubInput) =>
    api.post<Club>('/clubs', input),

  join: (id: string) =>
    api.post<{ joined: boolean }>(`/clubs/${id}/join`, {}),

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
}
