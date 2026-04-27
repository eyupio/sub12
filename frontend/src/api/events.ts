import { api } from './client'

export type EventState = 'draft' | 'open_for_entries' | 'live' | 'complete' | 'archived'
export type EventVisibility = 'public' | 'club_only' | 'unlisted'

export interface EventCourse {
  lanes: number
  shots_per_target: number
  standing_targets?: number[]
  kneeling_targets?: number[]
  standing_supported_targets?: number[]
  kneeling_supported_targets?: number[]
}

export interface EventScoringRules {
  mode: 'xo' | '210' | string
  points?: Record<string, number>
}

export interface EventDTO {
  id: string
  slug: string
  name: string
  description?: string
  location?: string
  starts_at?: string
  ends_at?: string
  archive_at?: string
  discipline: string
  course: EventCourse
  scoring_rules: EventScoringRules
  category_ids: string[]
  visibility: EventVisibility
  state: EventState
  owner_user_id: string
  club_id?: string
  created_at: string
  updated_at: string
  participant_count: number
  is_owner?: boolean
  is_scorer?: boolean
}

export interface EventParticipantDTO {
  id: string
  event_id: string
  user_id?: string
  guest_name?: string
  display_name: string
  team?: string
  category_id?: string
  weapon_class?: string
  weapon_label?: string
  lane_assignment?: number
  scorecard_id: string
  created_by: string
  created_at: string
}

export interface EventStandingRow {
  participant_id: string
  user_id?: string
  display_name: string
  team?: string
  category_id?: string
  weapon_class?: string
  points: number
  hit_count: number
  shots_recorded: number
  position: number
}

export interface CreateEventPayload {
  name: string
  description?: string
  location?: string
  starts_at?: string
  ends_at?: string
  discipline: string
  course: EventCourse
  scoring_rules: EventScoringRules
  category_ids: string[]
  visibility?: EventVisibility
  club_id?: string
}

export interface UpdateEventPayload {
  name?: string
  description?: string
  location?: string
  starts_at?: string
  ends_at?: string
  discipline?: string
  course?: EventCourse
  scoring_rules?: EventScoringRules
  category_ids?: string[]
  visibility?: EventVisibility
}

export interface JoinEventPayload {
  team?: string
  category_id?: string
  weapon_class?: string
  weapon_label?: string
  lane_assignment?: number
}

export interface AddGuestPayload {
  guest_name: string
  team?: string
  category_id?: string
  weapon_class?: string
  weapon_label?: string
  lane_assignment?: number
}

export interface RecordScoreItem {
  participant_id: string
  lane: number
  shot_number: number
  result: string
  note?: string
  client_id: string
  recorded_at?: string
}

export interface EventScoreDTO {
  id: string
  participant_id: string
  lane: number
  shot_number: number
  result: string
  note?: string
  recorded_at: string
  recorded_by: string
  client_id: string
}

export const eventsApi = {
  list: (params?: { state?: EventState; clubId?: string }) => {
    const q = new URLSearchParams()
    if (params?.state) q.set('state', params.state)
    if (params?.clubId) q.set('club_id', params.clubId)
    const qs = q.toString()
    return api.get<{ items: EventDTO[] }>(`/events${qs ? `?${qs}` : ''}`)
  },
  get: (slug: string) => api.get<EventDTO>(`/events/${slug}`),
  create: (body: CreateEventPayload) => api.post<EventDTO>('/events', body),
  update: (slug: string, body: UpdateEventPayload) => api.patch<EventDTO>(`/events/${slug}`, body),
  promote: (slug: string, target: EventState) => api.post<EventDTO>(`/events/${slug}/promote`, { target }),
  join: (slug: string, body: JoinEventPayload) => api.post<EventParticipantDTO>(`/events/${slug}/participants`, body),
  addGuest: (slug: string, body: AddGuestPayload) => api.post<EventParticipantDTO>(`/events/${slug}/guests`, body),
  removeParticipant: (slug: string, participantId: string) => api.del<void>(`/events/${slug}/participants/${participantId}`),
  listParticipants: (slug: string) => api.get<{ items: EventParticipantDTO[] }>(`/events/${slug}/participants`),
  addScorer: (slug: string, userId: string) => api.post<{ added: boolean }>(`/events/${slug}/scorers`, { user_id: userId }),
  scoreboard: (slug: string) => api.get<{ items: EventStandingRow[] }>(`/events/${slug}/scoreboard`),
  listScores: (slug: string) => api.get<{ items: EventScoreDTO[] }>(`/events/${slug}/scores`),
  recordScores: (slug: string, scores: RecordScoreItem[]) => api.post<{ written: number }>(`/events/${slug}/scores`, { scores }),
  resultsCsvUrl: (slug: string) => `/api/v1/events/${slug}/results.csv`,
}
