import { api } from './client'

export type SupportScopeType = 'platform' | 'league' | 'club'
export type SupportTicketCategory = 'question' | 'issue' | 'feature'
export type SupportTicketStatus = 'open' | 'in_progress' | 'waiting_on_user' | 'resolved' | 'closed'
export type SupportTicketPriority = 'low' | 'normal' | 'high' | 'urgent'

export interface SupportTicket {
  id: string
  requester_id?: string
  assignee_id?: string
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

export interface SupportTicketMessage {
  id: string
  ticket_id: string
  author_id: string
  body: string
  internal_note: boolean
  created_at: string
}

export interface SupportTicketEvent {
  id: string
  ticket_id: string
  actor_id?: string
  event_type: string
  from_value?: string
  to_value?: string
  metadata?: Record<string, unknown>
  created_at: string
}

export interface SupportTicketParticipant {
  ticket_id: string
  user_id: string
  role: string
  last_read_at?: string
  created_at: string
  unread_count?: number
}

export interface SupportTicketDetail {
  ticket: SupportTicket
  messages: SupportTicketMessage[]
  events: SupportTicketEvent[]
  participants: SupportTicketParticipant[]
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
  getMine: (id: string) => api.get<SupportTicketDetail>(`/tickets/${id}`),
  adminList: (params?: { status?: SupportTicketStatus; category?: SupportTicketCategory; limit?: number }) => {
    const q = new URLSearchParams()
    if (params?.status) q.set('status', params.status)
    if (params?.category) q.set('category', params.category)
    if (params?.limit) q.set('limit', String(params.limit))
    const query = q.toString()
    return api.get<SupportTicketListResponse>(`/admin/tickets${query ? `?${query}` : ''}`)
  },
  adminGet: (id: string) => api.get<SupportTicketDetail>(`/admin/tickets/${id}`),
  addMessage: (id: string, body: string, internal_note?: boolean) =>
    api.post<SupportTicketMessage>(`/tickets/${id}/messages`, { body, internal_note }),
  adminAddMessage: (id: string, body: string, internal_note?: boolean) =>
    api.post<SupportTicketMessage>(`/tickets/${id}/messages`, { body, internal_note }),
  markRead: (id: string) => api.post<void>(`/tickets/${id}/read`, {}),
  adminTransitionStatus: (id: string, status: SupportTicketStatus) =>
    api.post<SupportTicket>(`/admin/tickets/${id}/status`, { status }),
}
