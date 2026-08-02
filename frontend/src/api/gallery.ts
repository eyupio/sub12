import { api } from './client'

export type GalleryKind = 'score_card' | 'rifle' | 'pellet' | 'pellet_test'

export interface GalleryItem {
  kind: GalleryKind
  id: string
  image_url: string
  image_rotation?: number
  title: string
  caption?: string
  shot_at?: string
  total_score?: number
  x_count?: number
  is_draft?: boolean
  verification?: string
  rifle_name?: string
  pellet_name?: string
  league_round_id?: string
  league_id?: string
  league_name?: string
  round_name?: string
  club_id?: string
  club_name?: string
  event_participant_id?: string
  event_slug?: string
  event_name?: string
  session_id?: string
  group_size_mm?: number
  created_at: string
}

export const galleryApi = {
  list: () => api.get<{ items: GalleryItem[] }>('/users/me/gallery'),
}
