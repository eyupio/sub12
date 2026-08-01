import { api } from './client'
import type { GearTrendPoint } from './gear'

export type GearKind = 'rifle' | 'pellet'

export interface AdminGearTotals {
  rifles: number
  pellets: number
  rifle_models: number
  pellet_models: number
  rifle_makes: number
  pellet_brands: number
  owners_with_gear: number
  active_rifles: number
  active_pellets: number
  rifles_opted_in: number
  pellets_opted_in: number
  opt_in_rate: number
  rifles_with_images: number
  pellets_with_images: number
  cards_with_rifle: number
  cards_with_pellet: number
  orphan_cards: number
  avg_rifles_per_owner: number
  avg_pellets_per_owner: number
}

export interface AdminGearModel {
  kind: GearKind
  make: string
  model: string
  owner_count: number
  item_count: number
  opted_in_count: number
  card_count: number
  test_count: number
  avg_score?: number
  best_score?: number
  avg_group_mm?: number
  best_group_mm?: number
  first_seen: string
  last_used?: string
}

export interface AdminGearCombo {
  rifle_make: string
  rifle_model: string
  pellet_brand: string
  pellet_model: string
  user_count: number
  card_count: number
  test_count: number
  avg_score?: number
  best_score?: number
  avg_group_mm?: number
  best_group_mm?: number
}

export interface AdminGearSlice {
  label: string
  count: number
  share: number
}

export interface AdminGearAdoptionPoint {
  period: string
  rifles: number
  pellets: number
}

export interface AdminGearStats {
  totals: AdminGearTotals
  top_rifles: AdminGearModel[]
  top_pellets: AdminGearModel[]
  top_combos: AdminGearCombo[]
  calibre_split: AdminGearSlice[]
  rifle_make_split: AdminGearSlice[]
  pellet_brand_split: AdminGearSlice[]
  pellet_weight_split: AdminGearSlice[]
  power_split: AdminGearSlice[]
  adoption: AdminGearAdoptionPoint[]
}

export interface AdminGearModelOwner {
  user_id: string
  display_name: string
  email: string
  is_simulated: boolean
  opted_in: boolean
  item_count: number
  card_count: number
  test_count: number
  avg_score?: number
  best_score?: number
  best_group_mm?: number
  added_at: string
}

export interface AdminGearModelDetail {
  model: AdminGearModel
  owners: AdminGearModelOwner[]
  trend: GearTrendPoint[]
}

export type AdminGearSort =
  | 'owners' | 'items' | 'cards' | 'tests'
  | 'avg_score' | 'best_score' | 'avg_group' | 'best_group'
  | 'recent' | 'name'

export const adminGearApi = {
  getStats: () => api.get<AdminGearStats>('/admin/gear/stats'),

  listModels: (params: {
    kind: GearKind
    q?: string
    sort?: AdminGearSort
    limit?: number
    offset?: number
  }) => {
    const search = new URLSearchParams({ kind: params.kind })
    if (params.q) search.set('q', params.q)
    if (params.sort) search.set('sort', params.sort)
    search.set('limit', String(params.limit ?? 25))
    search.set('offset', String(params.offset ?? 0))
    return api.get<{ items: AdminGearModel[]; total: number }>(`/admin/gear/models?${search}`)
  },

  getModelDetail: (kind: GearKind, make: string, model: string) => {
    const search = new URLSearchParams({ kind, make, model })
    return api.get<AdminGearModelDetail>(`/admin/gear/model?${search}`)
  },
}
