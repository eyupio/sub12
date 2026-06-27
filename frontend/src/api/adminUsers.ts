import { api } from './client'

export interface AdminUser {
  id: string
  email: string
  role: 'user' | 'admin'
  display_name: string
  bio?: string
  location?: string
  club?: string
  avatar_url?: string
  is_simulated: boolean
  created_at: string
  updated_at: string
}

export interface AdminUsersListResponse {
  items: AdminUser[]
  total: number
  limit: number
  offset: number
}

export const adminUsersApi = {
  list: (limit = 50, offset = 0, hideSimulated = false) =>
    api.get<AdminUsersListResponse>(
      `/admin/users?limit=${limit}&offset=${offset}${hideSimulated ? '&hide_simulated=1' : ''}`,
    ),

  get: (id: string) =>
    api.get<AdminUser>(`/admin/users/${id}`),

  updateRole: (id: string, role: 'user' | 'admin') =>
    api.patch<AdminUser>(`/admin/users/${id}/role`, { role }),

  delete: (id: string) =>
    api.del<void>(`/admin/users/${id}`),
}
