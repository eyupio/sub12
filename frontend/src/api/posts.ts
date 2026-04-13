import { api } from './client'
import type { Comment } from './scoreCards'

export interface PostAttachment {
  id: string
  type: 'image' | 'score_card' | 'pellet_test'
  target_id?: string
  image_url?: string
  sort_order: number
}

export interface Post {
  id: string
  user_id: string
  display_name: string
  avatar_url?: string
  body: string
  league_id?: string
  club_id?: string
  like_count: number
  comment_count: number
  is_liked: boolean
  attachments: PostAttachment[]
  created_at: string
  updated_at: string
}

export interface CreatePostPayload {
  body: string
  league_id?: string
  club_id?: string
  attachments?: { type: string; target_id?: string; image_url?: string }[]
}

export interface SharePayload {
  target_id: string
  target_type: 'score_card' | 'pellet_test'
  body?: string
  league_id?: string
  club_id?: string
}

export const postApi = {
  create: (payload: CreatePostPayload) =>
    api.post<Post>('/posts', payload),

  share: (payload: SharePayload) =>
    api.post<Post>('/posts/share', payload),

  get: (id: string) =>
    api.get<Post>(`/posts/${id}`),

  update: (id: string, body: string) =>
    api.patch<Post>(`/posts/${id}`, { body }),

  delete: (id: string) =>
    api.del<void>(`/posts/${id}`),

  listByLeague: (leagueId: string, limit = 20, offset = 0) =>
    api.get<{ items: Post[] }>(`/leagues/${leagueId}/posts?limit=${limit}&offset=${offset}`),

  listByClub: (clubId: string, limit = 20, offset = 0) =>
    api.get<{ items: Post[] }>(`/clubs/${clubId}/posts?limit=${limit}&offset=${offset}`),

  like: (id: string) =>
    api.post<{ liked: boolean; created: boolean }>(`/posts/${id}/like`, {}),

  unlike: (id: string) =>
    api.del<{ liked: boolean; removed: boolean }>(`/posts/${id}/like`),

  listComments: (id: string) =>
    api.get<{ items: Comment[] }>(`/posts/${id}/comments`),

  createComment: (id: string, body: string) =>
    api.post<Comment>(`/posts/${id}/comments`, { body }),
}
