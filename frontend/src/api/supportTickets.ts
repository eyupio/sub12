import { api } from './client'

export type SupportScopeType = 'platform' | 'league' | 'club'
export type SupportTicketCategory = 'question' | 'issue' | 'feature'
export type SupportTicketStatus = 'open' | 'in_progress' | 'waiting_on_user' | 'resolved' | 'closed'
export type SupportTicketPriority = 'low' | 'normal' | 'high' | 'urgent'

export interface SupportTicket {
  id: string
  scope_type?: SupportScopeType
  scope_id?: string
  category?: SupportTicketCategory
  title?: string
  description?: string
  status?: SupportTicketStatus
  priority?: SupportTicketPriority
  created_at?: string
  updated_at?: string
  unread_count?: number
  unread?: {
    count: number
    has_unread: boolean
  }
}

export interface SupportTicketListResponse {
  items: SupportTicket[]
}

export interface CreateSupportTicketInput {
  scope_type: SupportScopeType
  scope_id?: string
  category: SupportTicketCategory
  title: string
  description: string
  priority?: SupportTicketPriority
}

export const supportTicketsApi = {
  create: (payload: CreateSupportTicketInput) => api.post<SupportTicket>('/tickets', payload),
  listMine: (limit = 200) => api.get<SupportTicketListResponse>(`/tickets?limit=${limit}`),
  adminList: (params?: { status?: SupportTicketStatus; category?: SupportTicketCategory; limit?: number }) => {
    const q = new URLSearchParams()
    if (params?.status) q.set('status', params.status)
    if (params?.category) q.set('category', params.category)
    if (params?.limit) q.set('limit', String(params.limit))
    const query = q.toString()
    return api.get<SupportTicketListResponse>(`/admin/tickets${query ? `?${query}` : ''}`)
  },
  adminTransitionStatus: (id: string, status: SupportTicketStatus) =>
    api.post<SupportTicket>(`/admin/tickets/${id}/status`, { status }),
}
