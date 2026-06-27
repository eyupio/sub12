import { api } from './client'
import type { League, LeagueMember } from './leagues'

export interface UpdateLeaguePayload {
  name?: string
  description?: string
}

export const adminLeaguesApi = {
  list: () =>
    api.get<{ items: League[] }>('/admin/leagues'),

  get: (id: string) =>
    api.get<League>(`/admin/leagues/${id}`),

  update: (id: string, payload: UpdateLeaguePayload) =>
    api.patch<League>(`/admin/leagues/${id}`, payload),

  delete: (id: string) =>
    api.del<void>(`/admin/leagues/${id}`),

  listMembers: (id: string) =>
    api.get<{ items: LeagueMember[] }>(`/admin/leagues/${id}/members`),

  addMember: (leagueId: string, userId: string) =>
    api.post<{ ok: boolean }>(`/admin/leagues/${leagueId}/members`, { user_id: userId }),

  removeMember: (leagueId: string, userId: string) =>
    api.del<void>(`/admin/leagues/${leagueId}/members/${userId}`),
}
