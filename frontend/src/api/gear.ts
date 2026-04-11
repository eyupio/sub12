import { api } from './client'

export interface Rifle {
  id: string
  user_id: string
  make: string
  model: string
  calibre: string
  power_ftlb?: number
  tune_notes?: string
  is_active: boolean
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
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface CreateRiflePayload {
  make: string
  model: string
  calibre?: string
  power_ftlb?: number
  tune_notes?: string
}

export interface CreatePelletPayload {
  brand: string
  model: string
  head_size_mm?: number
  weight_grains?: number
  batch_code?: string
  notes?: string
}

export const gearApi = {
  listRifles: (all = false) =>
    api.get<{ items: Rifle[] }>(`/rifles${all ? '?all=true' : ''}`),
  createRifle: (payload: CreateRiflePayload) =>
    api.post<Rifle>('/rifles', payload),
  updateRifle: (id: string, payload: Partial<CreateRiflePayload> & { is_active?: boolean }) =>
    api.patch<Rifle>(`/rifles/${id}`, payload),
  deleteRifle: (id: string) =>
    api.del<void>(`/rifles/${id}`),

  listPellets: (all = false) =>
    api.get<{ items: Pellet[] }>(`/pellets${all ? '?all=true' : ''}`),
  createPellet: (payload: CreatePelletPayload) =>
    api.post<Pellet>('/pellets', payload),
  updatePellet: (id: string, payload: Partial<CreatePelletPayload> & { is_active?: boolean }) =>
    api.patch<Pellet>(`/pellets/${id}`, payload),
  deletePellet: (id: string) =>
    api.del<void>(`/pellets/${id}`),
}
