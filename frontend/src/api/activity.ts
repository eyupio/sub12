import { api } from './client'

export interface ActivityItem {
  id: string
  user_id: string
  display_name: string
  avatar_url?: string
  type: 'score_posted' | 'personal_best' | 'joined_league' | 'commented'
  target_id?: string
  target_type?: string
  metadata?: {
    total_score?: number
    x_count?: number
    is_pb?: boolean
    league_name?: string
  }
  created_at: string
}

export interface FeedResponse {
  items: ActivityItem[]
  cursor?: string
}

export const activityApi = {
  getFeed: (limit = 20, cursor?: string) => {
    let url = `/feed?limit=${limit}`
    if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`
    return api.get<FeedResponse>(url)
  },
}
