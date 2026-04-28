import { api } from './client'
import type { EventParticipantDTO } from './events'

export type InvitationStatus = 'pending' | 'accepted' | 'declined' | 'expired'
export type PotentialInviteeSource = 'club' | 'followers' | 'following' | 'search'

export interface EventInvitationDTO {
  id: string
  event_id: string
  inviter_user_id: string
  invitee_user_id: string
  token: string
  status: InvitationStatus
  expires_at: string
  created_at: string
  decided_at?: string
}

export interface EventInvitationListItem extends EventInvitationDTO {
  invitee_display_name: string
  invitee_avatar_url?: string
}

export interface PotentialInviteeDTO {
  user_id: string
  display_name: string
  avatar_url?: string
  is_already_invited: boolean
  is_already_participant: boolean
}

export interface EventInvitationView {
  invitation: EventInvitationDTO
  event: {
    id: string
    slug: string
    name: string
    discipline: string
    starts_at?: string
    location?: string
    state: string
    club_id?: string
  }
  inviter: { user_id: string; display_name: string; avatar_url?: string }
  invitee: { user_id: string; display_name: string; avatar_url?: string }
}

export interface CreateBatchResult {
  invitee_user_id: string
  status: 'invited' | 'skipped' | 'error'
  reason?: string
  invitation?: EventInvitationDTO
}

export const eventInvitationsApi = {
  listPotentialInvitees: (slug: string, params: { source: PotentialInviteeSource; q?: string; limit?: number }) => {
    const qs = new URLSearchParams()
    qs.set('source', params.source)
    if (params.q) qs.set('q', params.q)
    if (params.limit) qs.set('limit', String(params.limit))
    return api.get<{ items: PotentialInviteeDTO[] }>(`/events/${slug}/potential-invitees?${qs.toString()}`)
  },
  list: (slug: string) => api.get<{ items: EventInvitationListItem[] }>(`/events/${slug}/invitations`),
  createBatch: (slug: string, inviteeUserIds: string[]) =>
    api.post<{ results: CreateBatchResult[] }>(`/events/${slug}/invitations`, { invitee_user_ids: inviteeUserIds }),
  getByToken: (token: string) => api.get<EventInvitationView>(`/events/invitations/${token}`),
  accept: (token: string) =>
    api.post<EventParticipantDTO | { already_participant: true }>(`/events/invitations/${token}/accept`, {}),
  decline: (token: string) => api.post<{ declined: true }>(`/events/invitations/${token}/decline`, {}),
}
