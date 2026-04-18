import { api } from './client'

export type ReportTargetType = 'post' | 'comment' | 'user' | 'score_card'
export type ReportStatus = 'open' | 'dismissed' | 'actioned'
export type ModerationAction = 'hide' | 'warn_user' | 'no_action'

export interface Report {
  id: string
  reporter_id: string
  target_type: ReportTargetType
  target_id: string
  reason: string
  notes?: string
  status: ReportStatus
  league_id?: string
  club_id?: string
  decided_by?: string
  decided_at?: string
  created_at: string
}

export interface CreateReportPayload {
  target_type: ReportTargetType
  target_id: string
  reason: string
  notes?: string
  context_league_id?: string
  context_club_id?: string
}

export interface DecidePayload {
  action: ModerationAction
  notes?: string
}

function statusQuery(status?: ReportStatus, limit = 50) {
  const parts = [`limit=${limit}`]
  if (status) parts.push(`status=${status}`)
  return parts.join('&')
}

export const reportsApi = {
  create: (payload: CreateReportPayload) => api.post<Report>('/reports', payload),
  adminList: (status?: ReportStatus, limit = 50) =>
    api.get<{ items: Report[] }>(`/admin/reports?${statusQuery(status, limit)}`),
  adminDecide: (id: string, payload: DecidePayload) =>
    api.post<Report>(`/admin/reports/${id}/decide`, payload),
  listForLeague: (leagueId: string, status?: ReportStatus, limit = 50) =>
    api.get<{ items: Report[] }>(`/leagues/${leagueId}/reports?${statusQuery(status, limit)}`),
  decideForLeague: (leagueId: string, reportId: string, payload: DecidePayload) =>
    api.post<Report>(`/leagues/${leagueId}/reports/${reportId}/decide`, payload),
  listForClub: (clubId: string, status?: ReportStatus, limit = 50) =>
    api.get<{ items: Report[] }>(`/clubs/${clubId}/reports?${statusQuery(status, limit)}`),
  decideForClub: (clubId: string, reportId: string, payload: DecidePayload) =>
    api.post<Report>(`/clubs/${clubId}/reports/${reportId}/decide`, payload),
}
