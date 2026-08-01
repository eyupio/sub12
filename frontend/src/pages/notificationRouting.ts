import type { Notification } from '../api/notifications'

export function notificationSentence(n: Notification): string {
  const actor = n.actor_display_name ?? 'Someone'
  switch (n.type) {
    case 'follow_request':
      return `${actor} requested to follow you`
    case 'follow_accepted':
      return `${actor} started following you`
    case 'comment_on_my_card':
      return `${actor} commented on your score card`
    case 'reply_to_my_comment':
      return `${actor} replied to your comment`
    case 'like_on_my_content':
      return `${actor} liked your ${n.target_type ?? 'content'}`
    case 'score_verified':
      return `Your score was verified`
    case 'score_rejected':
      return `Your score was rejected`
    case 'score_amended':
      return `${actor} amended your score`
    case 'league_join_approved':
      return `Your league join request was approved`
    case 'club_join_approved':
      return `Your club join request was approved`
    case 'mention':
      return `${actor} mentioned you`
    case 'post_flagged':
      return `${actor} flagged your post — please reflect and edit to amend`
    case 'report_filed': {
      const community = n.metadata?.community_name as string | undefined
      const target = (n.metadata?.target_label as string | undefined) ?? 'content'
      return community
        ? `${actor} flagged ${target} in ${community}`
        : `${actor} flagged ${target}`
    }
    case 'ticket_created':
      return `${actor} created a support ticket`
    case 'ticket_replied':
      return `${actor} replied on a support ticket`
    case 'ticket_assigned':
      return `${actor} assigned you a support ticket`
    case 'ticket_status_changed':
      return `${actor} changed a support ticket status`
    case 'feature_request_state_changed':
      return `${actor} updated a feature request status`
  }
}

export function notificationLink(n: Notification): string | null {
  if (n.type === 'report_filed') {
    if (n.league_id) return `/leagues/${n.league_id}/reports`
    if (n.club_id) return `/clubs/${n.club_id}/reports`
    return '/admin/support'
  }

  if (
    n.type === 'ticket_created' ||
    n.type === 'ticket_replied' ||
    n.type === 'ticket_assigned' ||
    n.type === 'ticket_status_changed'
  ) {
    return n.target_id ? `/support/tickets/${n.target_id}` : '/support'
  }

  if (n.type === 'feature_request_state_changed') {
    // Land on the idea that moved — its history explains the change — and fall
    // back to the board for older notifications that carry no target.
    return n.target_id ? `/feature-requests/${n.target_id}` : '/feature-requests'
  }

  if (n.target_type === 'score_card' && n.target_id) return `/scores/${n.target_id}`
  if (n.target_type === 'post') return '/feed'
  if (n.target_type === 'user' && n.target_id) return `/users/${n.target_id}`
  if (n.league_id) return `/leagues/${n.league_id}`
  if (n.club_id) return `/clubs/${n.club_id}`
  return null
}
