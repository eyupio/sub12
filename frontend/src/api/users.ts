import { api } from './client'

export interface PublicProfile {
  id: string
  display_name: string
  bio?: string
  location?: string
  club?: string
  avatar_url?: string
  profile_visibility: string
  show_follower_counts: boolean
  created_at: string
}

export interface FollowStats {
  follower_count: number
  following_count: number
  is_following: boolean
  follows_you: boolean
}

export interface PublicProfileWithFollow extends PublicProfile, FollowStats {
  is_private: boolean
  is_blocked: boolean
  follow_request_status?: string
}

export interface UpdateProfileInput {
  display_name?: string
  bio?: string
  location?: string
  club?: string
  profile_visibility?: string
  default_score_visibility?: string
  feed_opt_out?: boolean
  show_follower_counts?: boolean
  default_distance_unit?: string
  default_measurement_unit?: string
}

export interface FollowListItem {
  user_id: string
  display_name: string
  avatar_url?: string
}

export interface UserBlock {
  blocker_id: string
  blocked_id: string
  display_name: string
  avatar_url?: string
  created_at: string
}

export interface FollowRequest {
  id: string
  requester_id: string
  target_id: string
  status: string
  display_name?: string
  avatar_url?: string
  created_at: string
  decided_at?: string
}

export const usersApi = {
  getProfile: (id: string) => api.get<PublicProfileWithFollow>(`/users/${id}`),
  follow: (id: string) => api.post<{ following?: boolean; status?: string }>(`/users/${id}/follow`, {}),
  unfollow: (id: string) => api.del<{ following: boolean }>(`/users/${id}/follow`),
  updateMe: (input: UpdateProfileInput) => api.patch<{ id: string; email: string; display_name: string; bio?: string; location?: string; club?: string; avatar_url?: string; profile_visibility: string; default_score_visibility: string; feed_opt_out: boolean; show_follower_counts: boolean; default_distance_unit: string; default_measurement_unit: string }>('/users/me', input),
  uploadAvatar: (file: File) => {
    const formData = new FormData()
    formData.append('image', file)
    return api.upload<{ id: string; email: string; display_name: string; bio?: string; location?: string; club?: string; avatar_url?: string }>('/users/me/avatar', formData)
  },
  requestEmailChange: (email: string) => api.post<{ message: string }>('/users/me/email', { email }),
  confirmEmailChange: (token: string) => api.post<{ id: string; email: string; display_name: string }>('/users/me/email/confirm', { token }),

  // Social lists
  getFollowers: (id: string, limit = 50, offset = 0) =>
    api.get<{ items: FollowListItem[] }>(`/users/${id}/followers?limit=${limit}&offset=${offset}`),
  getFollowing: (id: string, limit = 50, offset = 0) =>
    api.get<{ items: FollowListItem[] }>(`/users/${id}/following?limit=${limit}&offset=${offset}`),

  // Block
  block: (id: string) => api.post<{ blocked: boolean }>(`/users/${id}/block`, {}),
  unblock: (id: string) => api.del<{ blocked: boolean }>(`/users/${id}/block`),
  listBlocked: () => api.get<{ items: UserBlock[] }>('/users/me/blocks'),

  // Follow requests
  listFollowRequests: () => api.get<{ items: FollowRequest[] }>('/users/me/follow-requests'),
  decideFollowRequest: (id: string, decision: 'accepted' | 'rejected') =>
    api.post<FollowRequest>(`/users/me/follow-requests/${id}/decide`, { decision }),

  // Search
  search: (q: string, limit = 20) =>
    api.get<{ items: PublicProfile[] }>(`/users?q=${encodeURIComponent(q)}&limit=${limit}`),
}
