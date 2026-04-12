import { api } from './client'
import type { Rifle } from './gear'
import type { Pellet } from './gear'

// ── Session ─────────────────────────────────────────────────────────────────────

export interface PelletTestSession {
  id: string
  user_id: string
  rifle_id: string
  pellet_id: string
  test_date: string
  distance_m: number
  distance_unit: string
  location?: string
  wind_mph?: number
  temp_celsius?: number
  humidity_pct?: number
  notes?: string
  average_group_size_mm?: number
  best_group_size_mm?: number
  group_count: number
  created_at: string
  updated_at: string
  groups?: PelletTestGroup[]
  images?: PelletTestImage[]
  rifle?: Rifle
  pellet?: Pellet
}

export interface PelletTestSessionSummary {
  id: string
  test_date: string
  distance_m: number
  distance_unit: string
  location?: string
  average_group_size_mm?: number
  best_group_size_mm?: number
  group_count: number
  rifle_make: string
  rifle_model: string
  pellet_brand: string
  pellet_model: string
  created_at: string
}

// ── Group ───────────────────────────────────────────────────────────────────────

export interface PelletTestGroup {
  id: string
  session_id: string
  group_number: number
  shot_count: number
  group_size_mm: number
  group_size_moa?: number
  notes?: string
  created_at: string
  updated_at: string
}

// ── Image ───────────────────────────────────────────────────────────────────────

export interface PelletTestImage {
  id: string
  session_id: string
  group_id?: string
  image_id: string
  image_url: string
  caption?: string
  created_at: string
}

// ── Leaderboard ─────────────────────────────────────────────────────────────────

export interface PelletLeaderboardEntry {
  pellet_id: string
  pellet_brand: string
  pellet_model: string
  head_size_mm?: number
  weight_grains?: number
  best_group_mm: number
  avg_group_mm: number
  test_count: number
  total_groups: number
  consistency_score?: number
  last_tested: string
  rank: number
}

// ── Stats ───────────────────────────────────────────────────────────────────────

export interface PelletTestStats {
  total_tests: number
  total_groups: number
  best_group_mm?: number
  avg_group_mm?: number
  most_tested_pellet?: string
}

// ── Payloads ────────────────────────────────────────────────────────────────────

export interface CreatePelletTestPayload {
  rifle_id: string
  pellet_id: string
  test_date: string
  distance_value: number
  distance_unit: string
  location?: string
  wind_mph?: number
  temp_celsius?: number
  humidity_pct?: number
  notes?: string
}

export interface UpdatePelletTestPayload {
  rifle_id?: string
  pellet_id?: string
  test_date?: string
  distance_value?: number
  distance_unit?: string
  location?: string
  wind_mph?: number
  temp_celsius?: number
  humidity_pct?: number
  notes?: string
}

export interface CreateGroupPayload {
  shot_count: number
  group_size_mm: number
  notes?: string
}

export interface UpdateGroupPayload {
  shot_count?: number
  group_size_mm?: number
  notes?: string
}

// ── API ─────────────────────────────────────────────────────────────────────────

export const pelletTestApi = {
  // Sessions
  create: (payload: CreatePelletTestPayload) =>
    api.post<PelletTestSession>('/pellet-tests', payload),
  list: (limit = 20, offset = 0) =>
    api.get<{ items: PelletTestSessionSummary[] }>(`/pellet-tests?limit=${limit}&offset=${offset}`),
  get: (id: string) =>
    api.get<PelletTestSession>(`/pellet-tests/${id}`),
  update: (id: string, payload: UpdatePelletTestPayload) =>
    api.patch<PelletTestSession>(`/pellet-tests/${id}`, payload),
  delete: (id: string) =>
    api.del<void>(`/pellet-tests/${id}`),

  // Groups
  createGroup: (sessionId: string, payload: CreateGroupPayload) =>
    api.post<PelletTestGroup>(`/pellet-tests/${sessionId}/groups`, payload),
  updateGroup: (sessionId: string, groupId: string, payload: UpdateGroupPayload) =>
    api.patch<PelletTestGroup>(`/pellet-tests/${sessionId}/groups/${groupId}`, payload),
  deleteGroup: (sessionId: string, groupId: string) =>
    api.del<void>(`/pellet-tests/${sessionId}/groups/${groupId}`),

  // Images
  uploadImage: (sessionId: string, file: File, groupId?: string, caption?: string) => {
    const fd = new FormData()
    fd.append('image', file)
    if (groupId) fd.append('group_id', groupId)
    if (caption) fd.append('caption', caption)
    return api.upload<PelletTestImage>(`/pellet-tests/${sessionId}/images`, fd)
  },
  deleteImage: (sessionId: string, imageId: string) =>
    api.del<void>(`/pellet-tests/${sessionId}/images/${imageId}`),

  // Leaderboard & stats
  leaderboard: (rifleId: string) =>
    api.get<{ items: PelletLeaderboardEntry[] }>(`/pellet-tests/leaderboard?rifle_id=${rifleId}`),
  stats: () =>
    api.get<PelletTestStats>('/pellet-tests/stats'),
}
