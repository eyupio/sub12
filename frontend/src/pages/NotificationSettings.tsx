import { Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft } from 'lucide-react'
import { toast } from '../store/toast'
import { notificationsApi, NotificationPreferences, NotificationPreferencesPatch } from '../api/notifications'

interface PrefRow {
  key: keyof NotificationPreferences
  label: string
  description: string
}

const ROWS: PrefRow[] = [
  { key: 'follow_request', label: 'Follow requests', description: 'Someone wants to follow your private profile.' },
  { key: 'follow_accepted', label: 'New followers', description: 'A follow was accepted or a public follow happened.' },
  { key: 'comment_on_my_card', label: 'Comments on my score cards', description: '' },
  { key: 'reply_to_my_comment', label: 'Replies to my comments', description: '' },
  { key: 'like_on_my_content', label: 'Likes on my content', description: '' },
  { key: 'score_verified', label: 'Score verified', description: 'A league admin confirmed your score.' },
  { key: 'score_rejected', label: 'Score rejected', description: '' },
  { key: 'score_amended', label: 'Score amended', description: '' },
  { key: 'league_join_approved', label: 'League join approved', description: '' },
  { key: 'club_join_approved', label: 'Club join approved', description: '' },
  { key: 'mention', label: 'Mentions', description: '@-mentions in comments or posts.' },
  { key: 'digest_email', label: 'Digest email', description: 'Weekly summary by email.' },
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
      </div>

      {isLoading && (
        <div className="space-y-2">
          {ROWS.map((_, i) => <div key={i} className="h-10 rounded border border-subtle bg-surface animate-pulse" />)}
        </div>
      )}

      {!isLoading && data && (
        <ul className="space-y-2">
          {ROWS.map((row) => {
            const val = data[row.key] as boolean
            return (
              <li key={row.key} className="flex items-start justify-between gap-3 p-3 rounded border border-subtle bg-surface">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-secondary font-medium">{row.label}</p>
                  {row.description && <p className="text-xs text-muted">{row.description}</p>}
                </div>
                <label className="shrink-0 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={val}
                    onChange={(e) => mutation.mutate({ [row.key]: e.target.checked } as NotificationPreferencesPatch)}
                    aria-label={row.label}
                    className="scale-125"
                  />
                </label>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
