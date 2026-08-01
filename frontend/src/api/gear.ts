import { api } from './client'

export interface Rifle {
  id: string
  user_id: string
  make: string
  model: string
  calibre: string
  power_ftlb?: number
  tune_notes?: string
  image_url?: string
  is_active: boolean
  comparison_opt_in: boolean
  created_at: string
  updated_at: string
}

export interface Pellet {
  id: string
  user_id: string
  brand: string
  model: string
  head_size_mm?: number
  weight_grains?: number
  batch_code?: string
  notes?: string
  image_url?: string
  is_active: boolean
  comparison_opt_in: boolean
  created_at: string
  updated_at: string
}

export interface CreateRiflePayload {
  make: string
  model: string
  calibre?: string
  power_ftlb?: number
  tune_notes?: string
  image_url?: string
}

export interface CreatePelletPayload {
  brand: string
  model: string
  head_size_mm?: number
  weight_grains?: number
  batch_code?: string
  notes?: string
  image_url?: string
}

export const gearApi = {
  listRifles: (all = false) =>
    api.get<{ items: Rifle[] }>(`/rifles${all ? '?all=true' : ''}`),
  createRifle: (payload: CreateRiflePayload) =>
    api.post<Rifle>('/rifles', payload),
  updateRifle: (id: string, payload: Partial<CreateRiflePayload> & { is_active?: boolean; comparison_opt_in?: boolean }) =>
    api.patch<Rifle>(`/rifles/${id}`, payload),
  deleteRifle: (id: string) =>
    api.del<void>(`/rifles/${id}`),

  listPellets: (all = false) =>
    api.get<{ items: Pellet[] }>(`/pellets${all ? '?all=true' : ''}`),
  createPellet: (payload: CreatePelletPayload) =>
    api.post<Pellet>('/pellets', payload),
  updatePellet: (id: string, payload: Partial<CreatePelletPayload> & { is_active?: boolean; comparison_opt_in?: boolean }) =>
    api.patch<Pellet>(`/pellets/${id}`, payload),
  deletePellet: (id: string) =>
    api.del<void>(`/pellets/${id}`),

  uploadRifleImage: (id: string, file: File) => {
    const formData = new FormData()
    formData.append('image', file)
    return api.upload<Rifle>(`/rifles/${id}/image`, formData)
  },
  uploadPelletImage: (id: string, file: File) => {
    const formData = new FormData()
    formData.append('image', file)
    return api.upload<Pellet>(`/pellets/${id}/image`, formData)
  },

  getRifleShowcase: (id: string) =>
    api.get<RifleShowcase>(`/rifles/${id}/showcase`),
  getPelletShowcase: (id: string) =>
    api.get<PelletShowcase>(`/pellets/${id}/showcase`),

  // Flips every owned rifle and pellet in or out of public comparison at once.
  setComparisonOptInAll: (optIn: boolean) =>
    api.patch<{ opt_in: boolean; rifles_updated: number; pellets_updated: number }>(
      '/users/me/gear-comparison',
      { opt_in: optIn },
    ),
}

// ─── Showcase ────────────────────────────────────────────────────────────────

export interface GearPersonalStats {
  card_count: number
  shots_fired: number
  best_score?: number
  best_x_count?: number
  best_card_id?: string
  avg_score?: number
  avg_x_count?: number
  std_dev?: number
  rolling_10_avg?: number
  first_used?: string
  last_used?: string
  active_days: number
  test_count: number
  group_count: number
  best_group_mm?: number
  avg_group_mm?: number
  perfect_shots: number
  x_percentage?: number
}

export interface GearTrendPoint {
  period: string
  avg_score: number
  best_score?: number
  avg_x_count: number
  std_dev: number
  card_count: number
}

export interface GearGroupPoint {
  period: string
  avg_group_mm: number
  best_group_mm?: number
  test_count: number
}

export interface GearHistogramBin {
  label: string
  min: number
  max: number
  count: number
}

export interface GearShotBucket {
  value: number
  count: number
}

export interface GearPairing {
  gear_id?: string
  name: string
  card_count: number
  user_count: number
  avg_score?: number
  best_score?: number
  test_count: number
  avg_group_mm?: number
  best_group_mm?: number
}

export interface GearRecentCard {
  id: string
  shot_at: string
  total_score: number
  x_count: number
  location?: string
}

export interface GearLeader {
  user_id: string
  display_name: string
  avatar_url?: string
  best_score: number
  best_x_count: number
  avg_score?: number
  card_count: number
  is_you: boolean
}

export interface GearGroupLeader {
  user_id: string
  display_name: string
  avatar_url?: string
  best_group_mm: number
  avg_group_mm?: number
  test_count: number
  rifle_name?: string
  is_you: boolean
}

export interface GearCommunity {
  opted_in: boolean
  eligible: boolean
  min_owners: number
  owner_count: number
  card_count: number
  test_count: number
  avg_score?: number
  median_score?: number
  p90_score?: number
  best_score?: number
  avg_x_count?: number
  avg_group_mm?: number
  median_group_mm?: number
  best_group_mm?: number
  your_percentile?: number
  your_rank?: number
  distribution: GearHistogramBin[]
  trend: GearTrendPoint[]
  top_pairings: GearPairing[]
  leaders: GearLeader[]
  group_leaders: GearGroupLeader[]
}

export interface RifleShowcase {
  rifle: Rifle
  model_key: string
  personal: GearPersonalStats
  score_trend: GearTrendPoint[]
  score_distribution: GearHistogramBin[]
  shot_breakdown: GearShotBucket[]
  group_trend: GearGroupPoint[]
  pairings: GearPairing[]
  recent_cards: GearRecentCard[]
  community: GearCommunity
}

export interface PelletShowcase {
  pellet: Pellet
  model_key: string
  personal: GearPersonalStats
  score_trend: GearTrendPoint[]
  score_distribution: GearHistogramBin[]
  group_trend: GearGroupPoint[]
  group_distribution: GearHistogramBin[]
  pairings: GearPairing[]
  recent_cards: GearRecentCard[]
  community: GearCommunity
}
