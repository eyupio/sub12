import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from '../store/toast'
import { notificationsApi, NotificationPreferences, NotificationPreferencesPatch } from '../api/notifications'

/**
 * The one rendering of notification preferences. Both surfaces that offer them
 * — the Profile "Notifications" tab and the /settings/notifications page —
 * render this, so a type added to the catalogue below appears in both. They
 * used to carry a row list each, and the profile tab's copy silently fell a
 * whole release behind: leagues, clubs and events were unreachable for anyone
 * who never went via the bell menu.
 *
 * Every switch is a row in NOTIFICATION_PREF_GROUPS and carries `data-pref`
 * naming the preference it writes, so the test can assert the rendered page
 * covers the API type rather than assert the file merely mentions it. A
 * preference declared but never drawn fails nothing on its own — the row is
 * simply absent — which is how this panel has gone stale twice.
 */

interface PrefRow {
  inAppKey: keyof NotificationPreferences
  emailKey: keyof NotificationPreferences
  label: string
  description: string
}

/**
 * A preference with one switch rather than an in-app/email pair. `column` says
 * which of the two headings it belongs under: a lone checkbox at the right edge
 * of a two-column table reads as "email me this", which is wrong for every one
 * of these but the digest.
 */
interface SingleRow {
  key: keyof NotificationPreferences
  label: string
  description: string
  column: 'in-app' | 'email'
}

interface PrefGroup {
  title: string
  note?: string
  rows?: PrefRow[]
  singles?: SingleRow[]
}

const NOTIFICATION_PREF_GROUPS: PrefGroup[] = [
  {
    title: 'Social',
    rows: [
      { inAppKey: 'follow_request', emailKey: 'follow_request_email', label: 'Follow requests', description: 'Someone wants to follow your private profile.' },
      { inAppKey: 'follow_accepted', emailKey: 'follow_accepted_email', label: 'New followers', description: 'A follow was accepted or a public follow happened.' },
      { inAppKey: 'comment_on_my_card', emailKey: 'comment_on_my_card_email', label: 'Comments on my score cards', description: '' },
      { inAppKey: 'reply_to_my_comment', emailKey: 'reply_to_my_comment_email', label: 'Replies to my comments', description: '' },
      { inAppKey: 'like_on_my_content', emailKey: 'like_on_my_content_email', label: 'Likes on my content', description: '' },
      { inAppKey: 'mention', emailKey: 'mention_email', label: 'Mentions', description: '@-mentions in comments or posts.' },
      { inAppKey: 'post_flagged', emailKey: 'post_flagged_email', label: 'Post flagged', description: 'A moderator asked you to amend one of your posts.' },
    ],
  },
  {
    title: 'Score validation',
    rows: [
      { inAppKey: 'score_validation_requested', emailKey: 'score_validation_requested_email', label: 'Validation requested', description: 'A card is waiting on you — a league or event card you can rule on, or a personal card someone asked the community to confirm.' },
      { inAppKey: 'score_verified', emailKey: 'score_verified_email', label: 'Score verified', description: 'A league moderator confirmed your score.' },
      { inAppKey: 'score_rejected', emailKey: 'score_rejected_email', label: 'Score rejected', description: '' },
      { inAppKey: 'score_amended', emailKey: 'score_amended_email', label: 'Score amended', description: '' },
    ],
  },
  {
    // Opting in to be asked to verify other people's cards. Not delivery
    // switches — they widen the audience of a verification request — but they
    // are what somebody looking for "who sends me cards to check" comes here
    // for, so they sit with score validation rather than at the foot of the
    // page, and are named for the three places a card can come from.
    title: 'Score card verification requests',
    note: 'Ask to be sent other shooters’ cards when they need verifying. These widen who gets asked — you always hear about cards from people you follow and leagues you help run. Delivery follows the “Validation requested” switches above.',
    singles: [
      {
        key: 'review_requests_public',
        label: 'Public cards from the feed',
        description: 'Community review requests on anyone’s public personal card, including shooters you don’t follow.',
        column: 'in-app',
      },
      {
        key: 'review_requests_leagues',
        label: 'Cards in leagues I’m in',
        description: 'League cards waiting on verification in any league you belong to, not just ones you help run.',
        column: 'in-app',
      },
      {
        key: 'review_requests_club_leagues',
        label: 'Cards in my clubs’ leagues',
        description: 'League cards in leagues run under a club you belong to, whether or not you are in that league.',
        column: 'in-app',
      },
    ],
  },
  {
    title: 'Leagues',
    rows: [
      { inAppKey: 'league_join_request', emailKey: 'league_join_request_email', label: 'Join requests', description: 'Someone asked to join a league you run.' },
      { inAppKey: 'league_join_approved', emailKey: 'league_join_approved_email', label: 'Join approved', description: '' },
      { inAppKey: 'league_join_rejected', emailKey: 'league_join_rejected_email', label: 'Join declined', description: '' },
      { inAppKey: 'league_role_changed', emailKey: 'league_role_changed_email', label: 'My role changed', description: 'You were made a league moderator, or stood down.' },
      { inAppKey: 'league_round_opened', emailKey: 'league_round_opened_email', label: 'New round open', description: 'A league you are in opened a new round.' },
    ],
  },
  {
    title: 'Clubs',
    rows: [
      { inAppKey: 'club_join_request', emailKey: 'club_join_request_email', label: 'Join requests', description: 'Someone asked to join a club you run.' },
      { inAppKey: 'club_join_approved', emailKey: 'club_join_approved_email', label: 'Join approved', description: '' },
      { inAppKey: 'club_join_rejected', emailKey: 'club_join_rejected_email', label: 'Join declined', description: '' },
      { inAppKey: 'club_role_changed', emailKey: 'club_role_changed_email', label: 'My role changed', description: 'You were made a club moderator, or stood down.' },
    ],
  },
  {
    title: 'Events',
    rows: [
      { inAppKey: 'event_invitation', emailKey: 'event_invitation_email', label: 'Invitations', description: 'You were invited to an event.' },
      { inAppKey: 'event_participant_joined', emailKey: 'event_participant_joined_email', label: 'New entries', description: 'Someone entered an event you host.' },
      { inAppKey: 'event_went_live', emailKey: 'event_went_live_email', label: 'Event went live', description: 'An event you entered has started.' },
      { inAppKey: 'event_results_posted', emailKey: 'event_results_posted_email', label: 'Results posted', description: 'Final standings for an event you shot.' },
    ],
  },
  {
    title: 'Announcements',
    rows: [
      { inAppKey: 'announcement', emailKey: 'announcement_email', label: 'Announcements', description: 'A message sent to everyone in a league, club or event you belong to, or to the whole site.' },
    ],
  },
  {
    title: 'Support',
    rows: [
      { inAppKey: 'ticket_created', emailKey: 'ticket_created_email', label: 'Ticket created', description: 'When a support ticket is opened in your scope.' },
      { inAppKey: 'ticket_replied', emailKey: 'ticket_replied_email', label: 'Ticket replies', description: 'New replies on tickets you participate in.' },
      { inAppKey: 'ticket_assigned', emailKey: 'ticket_assigned_email', label: 'Ticket assignments', description: 'When a ticket is assigned to you.' },
      { inAppKey: 'ticket_status_changed', emailKey: 'ticket_status_changed_email', label: 'Ticket status changes', description: 'Updates to support ticket lifecycle state.' },
      { inAppKey: 'feature_request_state_changed', emailKey: 'feature_request_state_changed_email', label: 'Feature request state', description: 'Status changes for feature request tickets.' },
    ],
  },
  {
    title: 'Moderation',
    singles: [
      {
        key: 'report_filed',
        label: 'Reports filed',
        description: 'League/club moderators only. Email delivery is controlled by the digest email setting below.',
        column: 'in-app',
      },
    ],
  },
  {
    title: 'Email digests',
    singles: [
      {
        key: 'digest_email',
        label: 'Digest email',
        description: 'Weekly summary by email; also gates report-filed emails for moderators.',
        column: 'email',
      },
    ],
  },
]

const ROW_COUNT = NOTIFICATION_PREF_GROUPS.reduce(
  (n, g) => n + (g.rows?.length ?? 0) + (g.singles?.length ?? 0),
  0,
)

export function NotificationPreferencesPanel() {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['notification-prefs'],
    queryFn: () => notificationsApi.getPreferences(),
  })

  const mutation = useMutation({
    mutationFn: (patch: NotificationPreferencesPatch) => notificationsApi.updatePreferences(patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-prefs'] })
      toast('Preferences updated', 'success')
    },
    onError: () => toast('Failed to update', 'error'),
  })

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">
        Choose how you want to be notified for each event. In-app shows in the
        bell menu; email is sent to your account address.
      </p>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: ROW_COUNT }, (_, i) => <div key={i} className="h-14 rounded border border-subtle skeleton" />)}
        </div>
      )}

      {!isLoading && data && (
        <>
          <div className="hidden sm:flex items-center justify-end gap-6 px-3 pt-2 text-[11px] tracking-wider uppercase text-muted">
            <span className="w-12 text-center">In-app</span>
            <span className="w-12 text-center">Email</span>
          </div>

          {NOTIFICATION_PREF_GROUPS.map((group) => (
            <div key={group.title} className="pt-2">
              <h2 className="t-section-title mb-2">{group.title}</h2>
              {group.note && <p className="text-xs text-muted mb-2">{group.note}</p>}
              <ul className="space-y-2">
                {(group.rows ?? []).map((row) => {
                  const inAppVal = data[row.inAppKey] as boolean
                  const emailVal = data[row.emailKey] as boolean
                  return (
                    <li key={row.inAppKey} className="flex items-start justify-between gap-3 p-3 rounded border border-subtle bg-surface">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-secondary font-medium">{row.label}</p>
                        {row.description && <p className="text-xs text-muted">{row.description}</p>}
                      </div>
                      <div className="shrink-0 flex items-start gap-4 sm:gap-6">
                        <label className="flex flex-col items-center gap-1 text-[10px] uppercase tracking-wider text-muted cursor-pointer w-12">
                          <span className="sm:hidden">In-app</span>
                          <input
                            type="checkbox"
                            data-pref={row.inAppKey}
                            checked={inAppVal}
                            onChange={(e) => mutation.mutate({ [row.inAppKey]: e.target.checked } as NotificationPreferencesPatch)}
                            aria-label={`${group.title} — ${row.label} in-app`}
                            className="scale-125"
                          />
                        </label>
                        <label className="flex flex-col items-center gap-1 text-[10px] uppercase tracking-wider text-muted cursor-pointer w-12">
                          <span className="sm:hidden">Email</span>
                          <input
                            type="checkbox"
                            data-pref={row.emailKey}
                            checked={emailVal}
                            onChange={(e) => mutation.mutate({ [row.emailKey]: e.target.checked } as NotificationPreferencesPatch)}
                            aria-label={`${group.title} — ${row.label} email`}
                            className="scale-125"
                          />
                        </label>
                      </div>
                    </li>
                  )
                })}

                {(group.singles ?? []).map((row) => {
                  const toggle = (
                    <label className="flex flex-col items-center gap-1 text-[10px] uppercase tracking-wider text-muted cursor-pointer w-12">
                      <span className="sm:hidden">{row.column === 'email' ? 'Email' : 'In-app'}</span>
                      <input
                        type="checkbox"
                        data-pref={row.key}
                        checked={data[row.key] as boolean}
                        onChange={(e) => mutation.mutate({ [row.key]: e.target.checked } as NotificationPreferencesPatch)}
                        aria-label={`${group.title} — ${row.label}`}
                        className="scale-125"
                      />
                    </label>
                  )
                  // The unused column keeps its width, so the switch stays under
                  // the heading it answers to instead of sliding to the edge.
                  const spacer = <span className="hidden sm:block w-12" aria-hidden="true" />
                  return (
                    <li key={row.key} className="flex items-start justify-between gap-3 p-3 rounded border border-subtle bg-surface">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-secondary font-medium">{row.label}</p>
                        {row.description && <p className="text-xs text-muted">{row.description}</p>}
                      </div>
                      <div className="shrink-0 flex items-start gap-4 sm:gap-6">
                        {row.column === 'email' ? spacer : toggle}
                        {row.column === 'email' ? toggle : spacer}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
