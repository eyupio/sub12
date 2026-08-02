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
    case 'score_validation_requested': {
      const where = groupName(n)
      return where
        ? `${actor} needs a score card validated in ${where}`
        : `${actor} asked the community to validate a score card`
    }
    case 'league_join_request':
      return `${actor} asked to join ${groupName(n) ?? 'your league'}`
    case 'league_join_rejected':
      return `Your request to join ${groupName(n) ?? 'a league'} was declined`
    case 'league_role_changed':
      return n.metadata?.is_moderator
        ? `You now help run ${groupName(n) ?? 'a league'}`
        : `You no longer help run ${groupName(n) ?? 'a league'}`
    case 'league_round_opened': {
      const round = n.metadata?.round_name as string | undefined
      return round
        ? `${round} is open in ${groupName(n) ?? 'your league'}`
        : `A new round is open in ${groupName(n) ?? 'your league'}`
    }
    case 'club_join_request':
      return `${actor} asked to join ${groupName(n) ?? 'your club'}`
    case 'club_join_rejected':
      return `Your request to join ${groupName(n) ?? 'a club'} was declined`
    case 'club_role_changed':
      return n.metadata?.is_moderator
        ? `You now help run ${groupName(n) ?? 'a club'}`
        : `You no longer help run ${groupName(n) ?? 'a club'}`
    case 'event_invitation':
      return `${actor} invited you to ${groupName(n) ?? 'an event'}`
    case 'event_participant_joined':
      return `${actor} entered ${groupName(n) ?? 'your event'}`
    case 'event_went_live':
      return `${groupName(n) ?? 'An event you entered'} is now live`
    case 'event_results_posted':
      return `Results are in for ${groupName(n) ?? 'an event you entered'}`
  }
}

// groupName is the league, club or event a notification belongs to, as the
// server named it. Undefined when the notification carries no group — a
// personal card's validation request belongs to nobody.
function groupName(n: Notification): string | undefined {
  for (const key of ['league_name', 'club_name', 'event_name'] as const) {
    const value = n.metadata?.[key]
    if (typeof value === 'string' && value !== '') return value
  }
  return undefined
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

  if (n.type === 'score_validation_requested' && n.target_id) {
    // A personal card is confirmed from its review page; a league or event
    // card is ruled on from the card itself.
    return n.metadata?.scope === 'personal'
      ? `/scores/${n.target_id}/review`
      : `/scores/${n.target_id}`
  }

  // Join requests are decided on the settings page that lists them.
  if (n.type === 'league_join_request' && n.league_id) return `/leagues/${n.league_id}/settings`
  if (n.type === 'club_join_request' && n.club_id) return `/clubs/${n.club_id}/settings`

  // Event notifications carry the club that hosts the event, so they have to
  // resolve to the event before the club fallback below claims them.
  if (
    n.type === 'event_invitation' ||
    n.type === 'event_participant_joined' ||
    n.type === 'event_went_live' ||
    n.type === 'event_results_posted'
  ) {
    const slug = n.metadata?.event_slug
    return typeof slug === 'string' && slug !== '' ? `/events/${slug}` : '/events'
  }

  if (n.target_type === 'score_card' && n.target_id) return `/scores/${n.target_id}`
  if (n.target_type === 'post') return '/feed'
  if (n.target_type === 'user' && n.target_id) return `/users/${n.target_id}`
  if (n.league_id) return `/leagues/${n.league_id}`
  if (n.club_id) return `/clubs/${n.club_id}`
  return null
}
