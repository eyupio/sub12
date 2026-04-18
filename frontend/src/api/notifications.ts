import { api } from './client'

export type NotificationType =
  | 'follow_request'
  | 'follow_accepted'
  | 'comment_on_my_card'
  | 'reply_to_my_comment'
  | 'like_on_my_content'
  | 'score_verified'
  | 'score_rejected'
  | 'score_amended'
  | 'league_join_approved'
  | 'club_join_approved'
  | 'mention'

export interface Notification {
  id: string
  recipient_id: string
  actor_id?: string
  actor_display_name?: string
  actor_avatar_url?: string
  type: NotificationType
  target_id?: string
  target_type?: string
  league_id?: string
  club_id?: string
  metadata?: Record<string, unknown>
  read_at?: string
  created_at: string
}

export interface NotificationPage {
  items: Notification[]
  cursor: string
}

export interface NotificationPreferences {
  user_id: string
  follow_request: boolean
  follow_accepted: boolean
  comment_on_my_card: boolean
  reply_to_my_comment: boolean
  like_on_my_content: boolean
  score_verified: boolean
  score_rejected: boolean
  score_amended: boolean
  league_join_approved: boolean
  club_join_approved: boolean
  mention: boolean
  digest_email: boolean
  follow_request_email: boolean
  follow_accepted_email: boolean
  comment_on_my_card_email: boolean
  reply_to_my_comment_email: boolean
  like_on_my_content_email: boolean
  score_verified_email: boolean
  score_rejected_email: boolean
  score_amended_email: boolean
  league_join_approved_email: boolean
  club_join_approved_email: boolean
  mention_email: boolean
  updated_at: string
}

export type NotificationPreferencesPatch = Partial<Omit<NotificationPreferences, 'user_id' | 'updated_at'>>

export const notificationsApi = {
  list: (cursor?: string, limit = 20) =>
    api.get<NotificationPage>(
      `/notifications?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
    ),
  unreadCount: () => api.get<{ count: number }>('/notifications/unread-count'),
  markRead: (ids?: string[]) => api.post<void>('/notifications/read', { ids: ids ?? [] }),
  getPreferences: () => api.get<NotificationPreferences>('/notifications/preferences'),
  updatePreferences: (patch: NotificationPreferencesPatch) =>
    api.patch<NotificationPreferences>('/notifications/preferences', patch),
}
