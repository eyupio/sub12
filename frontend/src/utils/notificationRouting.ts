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
    case 'announcement': {
      // The announcement's own title is the sentence — it was written to be
      // read, and paraphrasing it would bury what the sender said.
      const title = n.metadata?.title
      if (typeof title === 'string' && title !== '') return title
      const where = groupName(n)
      return where ? `${actor} posted an announcement in ${where}` : `${actor} posted an announcement`
    }
  }
  return 'You have a new notification'
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

/**
 * Where a notification lands. `to` is the app path; `search` and `hash` name
 * the section within that page, so a tap opens the thing the notification is
 * actually about rather than the top of a page the reader has to hunt through.
 */
export interface NotificationTarget {
  to: string
  search?: Record<string, string>
  hash?: string
}

// The entity the notification hangs off, addressed by target_type/target_id.
// Null when it carries nothing openable.
function entityTarget(n: Notification): NotificationTarget | null {
  const id = n.target_id
  if (!id) return null
  switch (n.target_type) {
    case 'score_card':
      return { to: `/scores/${id}` }
    case 'post':
      return { to: `/posts/${id}` }
    case 'user':
      return { to: `/users/${id}` }
    case 'league':
      return { to: `/leagues/${id}` }
    case 'club':
      return { to: `/clubs/${id}` }
    case 'pellet_test':
      return { to: `/pellet-testing/${id}` }
    case 'support_ticket':
      return { to: `/support/tickets/${id}` }
    case 'feature_request':
      return { to: `/feature-requests/${id}` }
    default:
      return null
  }
}

// The league or club the notification was raised inside, when it names one.
function communityTarget(n: Notification): NotificationTarget | null {
  if (n.league_id) return { to: `/leagues/${n.league_id}` }
  if (n.club_id) return { to: `/clubs/${n.club_id}` }
  return null
}

/**
 * Resolve a notification to the page — and where possible the section — it
 * belongs to. Every notification resolves to something: a tap that lands
 * nowhere reads as a broken app, so the last resort is the surface the event
 * came from rather than a dead control.
 */
export function notificationTarget(n: Notification): NotificationTarget {
  switch (n.type) {
    case 'follow_request':
      // Requests are accepted or declined on the profile's Social tab.
      return { to: '/profile', search: { tab: 'social' } }

    case 'follow_accepted': {
      const userID = n.target_type === 'user' ? n.target_id : n.actor_id
      return userID ? { to: `/users/${userID}` } : { to: '/profile', search: { tab: 'social' } }
    }

    case 'score_verified':
    case 'score_rejected':
    case 'score_amended': {
      if (!n.target_id) return communityTarget(n) ?? { to: '/scores' }
      // A league moderator's verdict names the league it was given in. A
      // community review never does, and what the shooter wants to see —
      // who confirmed, how many more are needed — is on the review page
      // rather than the card.
      if (n.type === 'score_verified' && !n.league_id) return { to: `/scores/${n.target_id}/review` }
      return { to: `/scores/${n.target_id}` }
    }

    case 'league_join_approved':
      return n.league_id ? { to: `/leagues/${n.league_id}` } : entityTarget(n) ?? { to: '/leagues' }

    case 'club_join_approved':
      return n.club_id ? { to: `/clubs/${n.club_id}` } : entityTarget(n) ?? { to: '/clubs' }

    case 'post_flagged':
      // The point of the notification is "edit to amend", which needs the post
      // itself — the feed would bury it.
      return n.target_id ? { to: `/posts/${n.target_id}` } : { to: '/feed' }

    case 'report_filed': {
      // Anchored on the report id, matching the links the moderation emails
      // already send.
      const hash = n.target_id
      if (n.league_id) return { to: `/leagues/${n.league_id}/reports`, hash }
      if (n.club_id) return { to: `/clubs/${n.club_id}/reports`, hash }
      return { to: '/admin/reports', hash }
    }

    case 'ticket_created':
    case 'ticket_replied':
    case 'ticket_assigned':
    case 'ticket_status_changed':
      return n.target_id ? { to: `/support/tickets/${n.target_id}` } : { to: '/support' }

    case 'feature_request_state_changed':
      // Raised from two places: the board, where the target is the idea, and
      // the ticket it was refined from, where the target is the ticket. Route
      // on target_type so a ticket id is never read as a feature-request id.
      if (n.target_type === 'support_ticket' && n.target_id) return { to: `/support/tickets/${n.target_id}` }
      return n.target_id ? { to: `/feature-requests/${n.target_id}` } : { to: '/feature-requests' }

    case 'score_validation_requested':
      // A personal card is confirmed from its review page — the confirm action
      // and the progress live there; a league or event card is ruled on from
      // the card itself.
      if (!n.target_id) return communityTarget(n) ?? { to: '/scores' }
      return n.metadata?.scope === 'personal'
        ? { to: `/scores/${n.target_id}/review` }
        : { to: `/scores/${n.target_id}` }

    // Join requests are decided on the settings page that lists them.
    case 'league_join_request':
      return n.league_id ? { to: `/leagues/${n.league_id}/settings` } : { to: '/leagues' }
    case 'club_join_request':
      return n.club_id ? { to: `/clubs/${n.club_id}/settings` } : { to: '/clubs' }

    case 'league_join_rejected':
    case 'league_role_changed':
    case 'league_round_opened':
      return n.league_id ? { to: `/leagues/${n.league_id}` } : { to: '/leagues' }

    case 'club_join_rejected':
    case 'club_role_changed':
      return n.club_id ? { to: `/clubs/${n.club_id}` } : { to: '/clubs' }

    case 'event_invitation':
    case 'event_participant_joined':
    case 'event_went_live':
    case 'event_results_posted': {
      // A club-hosted event's notifications carry club_id, so they have to
      // resolve to the event before communityTarget claims them for the club.
      const slug = n.metadata?.event_slug
      return typeof slug === 'string' && slug !== '' ? { to: `/events/${slug}` } : { to: '/events' }
    }

    case 'announcement':
      return n.target_id ? { to: `/announcements/${n.target_id}` } : { to: '/notifications' }

    case 'comment_on_my_card':
    case 'reply_to_my_comment':
    case 'like_on_my_content':
    case 'mention':
      return entityTarget(n) ?? communityTarget(n) ?? { to: '/feed' }
  }

  // A type this bundle doesn't know yet — a Capacitor app running an older
  // build against a newer backend. Open whatever it points at rather than
  // leaving the row dead.
  return entityTarget(n) ?? communityTarget(n) ?? { to: '/notifications' }
}

/** The same destination as a single path string, for non-router callers. */
export function notificationLink(n: Notification): string {
  const target = notificationTarget(n)
  const query = target.search ? `?${new URLSearchParams(target.search).toString()}` : ''
  const hash = target.hash ? `#${target.hash}` : ''
  return `${target.to}${query}${hash}`
}
