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
  active_start_hour: number
  active_end_hour: number
  interact_with_real_users: boolean
  max_cards_per_persona: number
  last_run_at?: string
  last_action?: string
  updated_by?: string
  updated_at: string
}

export interface UpdateSimulationSettingsInput {
  enabled: boolean
  persona_count: number
  actions_per_hour: number
  post_weight: number
  like_weight: number
  comment_weight: number
  follow_weight: number
  active_start_hour: number
  active_end_hour: number
  interact_with_real_users: boolean
  max_cards_per_persona: number
}

export interface SimulationStatus {
  enabled: boolean
  persona_count: number
  simulated_user_count: number
  simulated_card_count: number
  last_run_at?: string
  last_action?: string
}

export interface SimulationRunResponse {
  performed: number
}

export const adminSimulationApi = {
  getSettings: () => api.get<SimulationSettings>('/admin/simulation/settings'),
  patchSettings: (payload: UpdateSimulationSettingsInput) =>
    api.patch<SimulationSettings>('/admin/simulation/settings', payload),
  getStatus: () => api.get<SimulationStatus>('/admin/simulation/status'),
  runNow: () => api.post<SimulationRunResponse>('/admin/simulation/run-now', {}),
}
