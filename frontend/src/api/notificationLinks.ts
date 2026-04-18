import type { Notification } from './notifications'

export function notificationLink(n: Notification): string | null {
  if (n.type === 'report_filed') {
    if (n.league_id) return `/leagues/${n.league_id}/reports`
    if (n.club_id) return `/clubs/${n.club_id}/reports`
    return '/admin/reports'
  }

  if (
    n.type === 'ticket_created' ||
    n.type === 'ticket_replied' ||
    n.type === 'ticket_assigned' ||
    n.type === 'ticket_status_changed'
  ) {
    return '/admin/reports'
  }

  if (n.type === 'feature_request_state_changed') {
    return '/feature-requests'
  }

  if (n.target_type === 'score_card' && n.target_id) return `/scores/${n.target_id}`
  if (n.target_type === 'post') return '/feed'
  if (n.target_type === 'user' && n.target_id) return `/users/${n.target_id}`
  if (n.league_id) return `/leagues/${n.league_id}`
  if (n.club_id) return `/clubs/${n.club_id}`
  return null
}
