import { api } from './client'
import type { EventDTO } from './events'

export interface AdminEventDTO extends EventDTO {
  club_name?: string
  owner_display_name: string
}

export const adminEventsApi = {
  list: () => api.get<{ items: AdminEventDTO[] }>('/admin/events'),
  delete: (id: string) => api.del<void>(`/admin/events/${id}`),
}
