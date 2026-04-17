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
  decided_by?: string
  decided_at?: string
  created_at: string
}

export interface CreateReportPayload {
  target_type: ReportTargetType
  target_id: string
  reason: string
  notes?: string
}

export interface DecidePayload {
  action: ModerationAction
  notes?: string
}

export const reportsApi = {
  create: (payload: CreateReportPayload) => api.post<Report>('/reports', payload),
  adminList: (status?: ReportStatus, limit = 50) =>
    api.get<{ items: Report[] }>(
      `/admin/reports?limit=${limit}${status ? `&status=${status}` : ''}`,
    ),
  adminDecide: (id: string, payload: DecidePayload) =>
    api.post<Report>(`/admin/reports/${id}/decide`, payload),
}
