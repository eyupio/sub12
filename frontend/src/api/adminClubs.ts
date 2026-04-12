import { api } from './client'
import type { Club, ClubMember } from './clubs'

export interface UpdateClubPayload {
  name?: string
  description?: string
}

export const adminClubsApi = {
  list: () =>
    api.get<{ items: Club[] }>('/admin/clubs'),

  get: (id: string) =>
    api.get<Club>(`/admin/clubs/${id}`),

  update: (id: string, payload: UpdateClubPayload) =>
    api.patch<Club>(`/admin/clubs/${id}`, payload),

  delete: (id: string) =>
    api.del<void>(`/admin/clubs/${id}`),

  listMembers: (id: string) =>
    api.get<{ items: ClubMember[] }>(`/admin/clubs/${id}/members`),

  removeMember: (clubId: string, userId: string) =>
    api.del<void>(`/admin/clubs/${clubId}/members/${userId}`),
}
