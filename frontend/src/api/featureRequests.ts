import { api } from './client'

export type FeatureRequestStatus = 'submitted' | 'refining' | 'accepted' | 'rejected' | 'planned' | 'in_progress' | 'done'

export interface FeatureRequest {
  id: string
  ticket_id: string
  title: string
  refined_description: string
  status: FeatureRequestStatus
  owner_admin_id?: string
  scope_type: 'platform' | 'league' | 'club'
  scope_id?: string
  vote_count: number
  viewer_has_voted: boolean
  created_at: string
  updated_at: string
}

export interface FeatureRequestListResponse {
  items: FeatureRequest[]
}

interface QueryParams {
  scopeType?: string
  scopeID?: string
  limit?: number
}

function queryString(params: QueryParams = {}) {
  const q = new URLSearchParams()
  if (params.scopeType) q.set('scope_type', params.scopeType)
  if (params.scopeID) q.set('scope_id', params.scopeID)
  if (params.limit) q.set('limit', String(params.limit))
  const encoded = q.toString()
  return encoded ? `?${encoded}` : ''
}

export const featureRequestsApi = {
  list: (params?: QueryParams) => api.get<FeatureRequestListResponse>(`/feature-requests${queryString(params)}`),
  ranking: (params?: QueryParams) => api.get<FeatureRequestListResponse>(`/feature-requests/ranking${queryString(params)}`),
  vote: (id: string, upvote: boolean) => api.post<FeatureRequest>(`/feature-requests/${id}/vote`, { upvote }),
  adminCreateFromTicket: (ticketID: string, payload: { title: string; refined_description: string; owner_admin_id?: string }) =>
    api.post<FeatureRequest>(`/admin/tickets/${ticketID}/feature-request`, payload),
  adminUpdate: (id: string, payload: Partial<Pick<FeatureRequest, 'title' | 'refined_description' | 'status' | 'owner_admin_id'>>) =>
    api.patch<FeatureRequest>(`/admin/feature-requests/${id}`, payload),
}
