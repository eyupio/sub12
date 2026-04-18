import { api } from './client'

export interface SupportTicket {
  id: string
  unread_count?: number
  unread?: {
    count: number
    has_unread: boolean
  }
}

export interface SupportTicketListResponse {
  items: SupportTicket[]
}

export const supportTicketsApi = {
  listMine: (limit = 200) => api.get<SupportTicketListResponse>(`/tickets?limit=${limit}`),
}
