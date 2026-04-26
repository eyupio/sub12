import { api } from './client'

export type ActivityType =
  | 'score_posted'
  | 'personal_best'
  | 'joined_league'
  | 'commented'
  | 'joined_club'
  | 'pellet_test_posted'
  | 'league_round_opened'
  | 'league_season_started'
  | 'achievement_earned'
  | 'feature_request_created'
  | 'feature_request_implemented'
  | 'post_created'
  | 'community_review_requested'
  | 'community_review_verified'

export type FeedFilter = 'public' | 'for_you' | 'league' | 'club'

export interface ActivityItem {
  id: string
  user_id: string
  display_name: string
  avatar_url?: string
  star_level: number
  type: ActivityType
  target_id?: string
  target_type?: string
  metadata?: {
    total_score?: number
    x_count?: number
    is_pb?: boolean
    league_name?: string
    club_name?: string
    best_group_mm?: number
    avg_group_mm?: number
    rifle_name?: string
    pellet_name?: string
    round_name?: string
    season_name?: string
    achievement_id?: string
    achievement_name?: string
    achievement_icon?: string
    achievement_description?: string
    title?: string
    status?: string
    scope_type?: string
    body_preview?: string
    edited_at?: string
    attachment_type?: 'score_card' | 'pellet_test' | 'image'
    attachment_target_id?: string
    attachment_image_urls?: string[]
    card_image_url?: string
    required_confirmations?: number
  }
  league_id?: string
  club_id?: string
  visibility: string
  like_count: number
  is_liked: boolean
  comment_count: number
  created_at: string
}

export interface FeedResponse {
  items: ActivityItem[]
  cursor?: string
}

export const activityApi = {
  getFeed: (limit = 20, cursor?: string, filter: FeedFilter = 'for_you', entityId?: string) => {
    let url = `/feed?limit=${limit}&filter=${filter}`
    if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`
    if (filter === 'league' && entityId) url += `&league_id=${entityId}`
    if (filter === 'club' && entityId) url += `&club_id=${entityId}`
    return api.get<FeedResponse>(url)
  },

  listComments: (id: string) =>
    api.get<{ items: import('./scoreCards').Comment[] }>(`/activities/${id}/comments`),

  createComment: (id: string, body: string) =>
    api.post<import('./scoreCards').Comment>(`/activities/${id}/comments`, { body }),

  // Site-admin moderation: soft-hide a feed item for everyone. The optional
  // reason is captured server-side for the audit log.
  adminHide: (id: string, reason?: string) => {
    const url = reason
      ? `/admin/activities/${id}?reason=${encodeURIComponent(reason)}`
      : `/admin/activities/${id}`
    return api.del<void>(url)
  },

  adminUnhide: (id: string) =>
    api.post<void>(`/admin/activities/${id}/unhide`, {}),
}
