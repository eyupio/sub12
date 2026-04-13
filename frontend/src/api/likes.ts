import { api } from './client'

interface LikeResponse {
  liked: boolean
  created: boolean
}

interface UnlikeResponse {
  liked: boolean
  removed: boolean
}

export const likeApi = {
  likeScoreCard: (id: string) =>
    api.post<LikeResponse>(`/score-cards/${id}/like`, {}),

  unlikeScoreCard: (id: string) =>
    api.del<UnlikeResponse>(`/score-cards/${id}/like`),

  likeComment: (id: string) =>
    api.post<LikeResponse>(`/comments/${id}/like`, {}),

  unlikeComment: (id: string) =>
    api.del<UnlikeResponse>(`/comments/${id}/like`),

  likePost: (id: string) =>
    api.post<LikeResponse>(`/posts/${id}/like`, {}),

  unlikePost: (id: string) =>
    api.del<UnlikeResponse>(`/posts/${id}/like`),
}
