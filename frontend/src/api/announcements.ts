import { api } from './client'

export type AnnouncementScope = 'platform' | 'league' | 'club' | 'event'

export interface Announcement {
  id: string
  scope: AnnouncementScope
  league_id?: string
  club_id?: string
  event_id?: string
  scope_name?: string
  event_slug?: string
  created_by: string
  author_display_name?: string
  author_avatar_url?: string
  title: string
  body: string
  recipient_count: number
  email_sent: boolean
  created_at: string
}

export interface CreateAnnouncementInput {
  title: string
  body: string
  /** Off by default: an announcement always lands in-app, email is opt-in per send. */
  send_email: boolean
}

export const ANNOUNCEMENT_TITLE_MAX = 120
export const ANNOUNCEMENT_BODY_MAX = 4000

/** Where a scope's announcements are sent and listed. Platform sends go
 *  through the admin route; every other scope is gated by the service. */
function scopePath(scope: AnnouncementScope, id: string): string {
  switch (scope) {
    case 'league':
      return `/leagues/${id}/announcements`
    case 'club':
      return `/clubs/${id}/announcements`
    case 'event':
      return `/events/${id}/announcements`
    case 'platform':
      return '/announcements/platform'
  }
}

export const announcementsApi = {
  get: (id: string) => api.get<Announcement>(`/announcements/${id}`),
  list: (scope: AnnouncementScope, id: string, limit = 20) =>
    api.get<{ items: Announcement[] }>(`${scopePath(scope, id)}?limit=${limit}`),
  send: (scope: AnnouncementScope, id: string, input: CreateAnnouncementInput) =>
    api.post<Announcement>(scope === 'platform' ? '/admin/announcements' : scopePath(scope, id), input),
}
