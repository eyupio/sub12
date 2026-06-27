import { api } from './client'

export interface SimulationSettings {
  id: number
  enabled: boolean
  persona_count: number
  actions_per_hour: number
  post_weight: number
  like_weight: number
  comment_weight: number
  follow_weight: number
  unfollow_weight: number
  share_weight: number
  active_start_hour: number
  active_end_hour: number
  interact_with_real_users: boolean
  max_cards_per_persona: number
  hourly_multipliers: number[]
  include_in_public_stats: boolean
  last_run_at?: string
  last_action?: string
  last_tick_at?: string
  updated_by?: string
  updated_at: string
  total_actions: number
  post_count: number
  like_count: number
  comment_count: number
  follow_count: number
  unfollow_count: number
  share_count: number
  last_error?: string
  last_error_at?: string
}

export interface UpdateSimulationSettingsInput {
  enabled: boolean
  persona_count: number
  actions_per_hour: number
  post_weight: number
  like_weight: number
  comment_weight: number
  follow_weight: number
  unfollow_weight: number
  share_weight: number
  active_start_hour: number
  active_end_hour: number
  interact_with_real_users: boolean
  max_cards_per_persona: number
  hourly_multipliers: number[]
  include_in_public_stats: boolean
}

export interface SimulationStatus {
  enabled: boolean
  persona_count: number
  simulated_user_count: number
  simulated_card_count: number
  last_run_at?: string
  last_action?: string
  last_tick_at?: string
  total_actions: number
  post_count: number
  like_count: number
  comment_count: number
  follow_count: number
  unfollow_count: number
  share_count: number
  last_error?: string
  last_error_at?: string
}

export interface SimulationRunResponse {
  performed: number
  counts?: Record<string, number>
}

export interface SimulatedPersona {
  id: string
  display_name: string
  email: string
  bio?: string
  location?: string
  club?: string
  avatar_url?: string
  card_count: number
  created_at: string
}

export interface SimulatedPersonasListResponse {
  items: SimulatedPersona[]
  total: number
  limit: number
  offset: number
}

export interface SimulationAudit {
  id: number
  event: string
  actor_id?: string
  detail?: string
  created_at: string
}

export interface SimulationAuditListResponse {
  items: SimulationAudit[]
  total: number
  limit: number
  offset: number
}

export interface SimulationCleanupResponse {
  deleted: number
  target: number
}

export interface SimulationPurgeResponse {
  deleted: number
}

export interface UpdateSimulatedPersonaInput {
  display_name?: string
  bio?: string
  location?: string
  club?: string
}

export interface AdminUser {
  id: string
  email: string
  role: 'user' | 'admin'
  display_name: string
  bio?: string
  location?: string
  club?: string
  avatar_url?: string
  is_simulated: boolean
  created_at: string
  updated_at: string
}

export const adminSimulationApi = {
  getSettings: () => api.get<SimulationSettings>('/admin/simulation/settings'),
  patchSettings: (payload: UpdateSimulationSettingsInput) =>
    api.patch<SimulationSettings>('/admin/simulation/settings', payload),
  getStatus: () => api.get<SimulationStatus>('/admin/simulation/status'),
  runNow: (actions?: number) =>
    api.post<SimulationRunResponse>('/admin/simulation/run-now', actions ? { actions } : {}),
  listPersonas: (limit = 50, offset = 0) =>
    api.get<SimulatedPersonasListResponse>(
      `/admin/simulation/personas?limit=${limit}&offset=${offset}`,
    ),
  updatePersona: (id: string, payload: UpdateSimulatedPersonaInput) =>
    api.patch<AdminUser>(`/admin/simulation/personas/${id}`, payload),
  uploadPersonaAvatar: (id: string, formData: FormData) =>
    api.upload<AdminUser>(`/admin/simulation/personas/${id}/avatar`, formData),
  joinPersonaToLeague: (id: string, leagueId: string) =>
    api.post<{ ok: boolean }>(`/admin/simulation/personas/${id}/join-league`, { league_id: leagueId }),
  joinPersonaToClub: (id: string, clubId: string) =>
    api.post<{ ok: boolean }>(`/admin/simulation/personas/${id}/join-club`, { club_id: clubId }),
  deletePersona: (id: string) => api.del<void>(`/admin/simulation/personas/${id}`),
  purgeAll: () => api.del<SimulationPurgeResponse>('/admin/simulation/personas'),
  cleanup: (target?: number) =>
    api.post<SimulationCleanupResponse>(
      `/admin/simulation/cleanup${target != null ? `?target=${target}` : ''}`,
      {},
    ),
  listAudit: (limit = 50, offset = 0) =>
    api.get<SimulationAuditListResponse>(
      `/admin/simulation/audit?limit=${limit}&offset=${offset}`,
    ),
}
