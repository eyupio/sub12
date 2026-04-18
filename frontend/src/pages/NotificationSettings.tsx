import { Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft } from 'lucide-react'
import { toast } from '../store/toast'
import { notificationsApi, NotificationPreferences, NotificationPreferencesPatch } from '../api/notifications'
import { HelpIcon } from '../components/Tooltip'
import { pageHelp } from '../components/tooltips'

interface PrefRow {
  inAppKey: keyof NotificationPreferences
  emailKey: keyof NotificationPreferences
  label: string
  description: string
}

const ROWS: PrefRow[] = [
  { inAppKey: 'follow_request', emailKey: 'follow_request_email', label: 'Follow requests', description: 'Someone wants to follow your private profile.' },
  { inAppKey: 'follow_accepted', emailKey: 'follow_accepted_email', label: 'New followers', description: 'A follow was accepted or a public follow happened.' },
  { inAppKey: 'comment_on_my_card', emailKey: 'comment_on_my_card_email', label: 'Comments on my score cards', description: '' },
  { inAppKey: 'reply_to_my_comment', emailKey: 'reply_to_my_comment_email', label: 'Replies to my comments', description: '' },
  { inAppKey: 'like_on_my_content', emailKey: 'like_on_my_content_email', label: 'Likes on my content', description: '' },
  { inAppKey: 'score_verified', emailKey: 'score_verified_email', label: 'Score verified', description: 'A league admin confirmed your score.' },
  { inAppKey: 'score_rejected', emailKey: 'score_rejected_email', label: 'Score rejected', description: '' },
  { inAppKey: 'score_amended', emailKey: 'score_amended_email', label: 'Score amended', description: '' },
  { inAppKey: 'league_join_approved', emailKey: 'league_join_approved_email', label: 'League join approved', description: '' },
  { inAppKey: 'club_join_approved', emailKey: 'club_join_approved_email', label: 'Club join approved', description: '' },
  { inAppKey: 'mention', emailKey: 'mention_email', label: 'Mentions', description: '@-mentions in comments or posts.' },
  { inAppKey: 'ticket_created', emailKey: 'ticket_created_email', label: 'Ticket created', description: 'When a support ticket is opened in your scope.' },
  { inAppKey: 'ticket_replied', emailKey: 'ticket_replied_email', label: 'Ticket replies', description: 'New replies on tickets you participate in.' },
  { inAppKey: 'ticket_assigned', emailKey: 'ticket_assigned_email', label: 'Ticket assignments', description: 'When a ticket is assigned to you.' },
  { inAppKey: 'ticket_status_changed', emailKey: 'ticket_status_changed_email', label: 'Ticket status changes', description: 'Updates to support ticket lifecycle state.' },
  { inAppKey: 'feature_request_state_changed', emailKey: 'feature_request_state_changed_email', label: 'Feature request state', description: 'Status changes for feature request tickets.' },
]

export default function NotificationSettings() {
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
    <div className="p-4 lg:p-8 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Link to="/profile" className="text-muted hover:text-secondary" aria-label="Back to profile">
          <ChevronLeft size={18} />
        </Link>
        <h1 className="text-xl lg:text-2xl font-medium tracking-widest uppercase text-secondary">Notifications</h1>
        <HelpIcon content={pageHelp.notificationSettings} />
      </div>

      <p className="text-xs text-muted">
        Choose how you want to be notified for each event. In-app shows in the
        bell menu; email is sent to your account address.
      </p>

      {isLoading && (
        <div className="space-y-2">
          {ROWS.map((_, i) => <div key={i} className="h-14 rounded border border-subtle bg-surface animate-pulse" />)}
        </div>
      )}

      {!isLoading && data && (
        <>
          <div className="hidden sm:flex items-center justify-end gap-6 px-3 pt-2 text-[11px] tracking-wider uppercase text-muted">
            <span className="w-12 text-center">In-app</span>
            <span className="w-12 text-center">Email</span>
          </div>

          <ul className="space-y-2">
            {ROWS.map((row) => {
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
                        checked={inAppVal}
                        onChange={(e) => mutation.mutate({ [row.inAppKey]: e.target.checked } as NotificationPreferencesPatch)}
                        aria-label={`${row.label} in-app`}
                        className="scale-125"
                      />
                    </label>
                    <label className="flex flex-col items-center gap-1 text-[10px] uppercase tracking-wider text-muted cursor-pointer w-12">
                      <span className="sm:hidden">Email</span>
                      <input
                        type="checkbox"
                        checked={emailVal}
                        onChange={(e) => mutation.mutate({ [row.emailKey]: e.target.checked } as NotificationPreferencesPatch)}
                        aria-label={`${row.label} email`}
                        className="scale-125"
                      />
                    </label>
                  </div>
                </li>
              )
            })}
          </ul>

          <div className="pt-2">
            <h2 className="text-xs uppercase tracking-wider text-muted mb-2">Moderation</h2>
            <ul className="space-y-2">
              <li className="flex items-start justify-between gap-3 p-3 rounded border border-subtle bg-surface">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-secondary font-medium">Reports filed</p>
                  <p className="text-xs text-muted">League/club admin only. Email delivery is controlled by the digest email setting below.</p>
                </div>
                <label className="shrink-0 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={data.report_filed}
                    onChange={(e) => mutation.mutate({ report_filed: e.target.checked })}
                    aria-label="Reports filed"
                    className="scale-125"
                  />
                </label>
              </li>
            </ul>
          </div>

          <div className="pt-2">
            <h2 className="text-xs uppercase tracking-wider text-muted mb-2">Email digests</h2>
            <ul className="space-y-2">
              <li className="flex items-start justify-between gap-3 p-3 rounded border border-subtle bg-surface">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-secondary font-medium">Digest email</p>
                  <p className="text-xs text-muted">Weekly summary by email; also gates report-filed emails for admins.</p>
                </div>
                <label className="shrink-0 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={data.digest_email}
                    onChange={(e) => mutation.mutate({ digest_email: e.target.checked })}
                    aria-label="Digest email"
                    className="scale-125"
                  />
                </label>
              </li>
            </ul>
          </div>
        </>
      )}
    </div>
  )
}
