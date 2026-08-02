import { Link } from '@tanstack/react-router'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { UserPlus, UserCheck, MessageSquare, Heart, CheckCircle, XCircle, AlertCircle, Users as UsersIcon, Trophy, AtSign, Flag, LifeBuoy } from 'lucide-react'
import { notificationsApi, type NotificationType } from '../api/notifications'
import { formatDateTime, useRegionalPrefs } from '../utils/date'
import { notificationSentence, notificationTarget } from '../utils/notificationRouting'

const ICON_MAP: Record<NotificationType, typeof UserPlus> = {
  follow_request: UserPlus,
  follow_accepted: UserCheck,
  comment_on_my_card: MessageSquare,
  reply_to_my_comment: MessageSquare,
  like_on_my_content: Heart,
  score_verified: CheckCircle,
  score_rejected: XCircle,
  score_amended: AlertCircle,
  league_join_approved: Trophy,
  club_join_approved: UsersIcon,
  mention: AtSign,
  post_flagged: Flag,
  report_filed: Flag,
  ticket_created: LifeBuoy,
  ticket_replied: MessageSquare,
  ticket_assigned: UsersIcon,
  ticket_status_changed: AlertCircle,
  feature_request_state_changed: Trophy,
}

export default function Notifications() {
  const queryClient = useQueryClient()
  const prefs = useRegionalPrefs()

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError, refetch } = useInfiniteQuery({
    queryKey: ['notifications', 'list'],
    queryFn: ({ pageParam }) => notificationsApi.list(pageParam as string | undefined),
    getNextPageParam: (last) => last.cursor || undefined,
    initialPageParam: undefined as string | undefined,
  })

  const markAllMutation = useMutation({
    mutationFn: () => notificationsApi.markRead([]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  const markOneMutation = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead([id]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  const items = data?.pages.flatMap((p) => p.items) ?? []
  const hasUnread = items.some((n) => !n.read_at)

  return (
    <div className="p-4 lg:p-8 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="t-page-title">Notifications</h1>
        <div className="flex items-center gap-4">
          {hasUnread && (
            <button
              type="button"
              onClick={() => markAllMutation.mutate()}
              disabled={markAllMutation.isPending}
              className="t-section-title hover:text-secondary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Mark all read
            </button>
          )}
          <Link to="/settings/notifications" className="t-section-title hover:text-secondary">
            Settings
          </Link>
        </div>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-14 rounded border border-subtle skeleton" />
          ))}
        </div>
      )}

      {isError && (
        <div role="alert" className="space-y-2">
          <p className="text-[var(--error-text)] text-sm">Failed to load notifications.</p>
          <button
            onClick={() => refetch()}
            className="text-[11px] tracking-widest uppercase text-[var(--brass)] hover:opacity-80"
          >
            Retry
          </button>
        </div>
      )}

      {!isLoading && items.length === 0 && !isError && (
        <div className="text-center py-12 text-sm text-muted">Nothing here yet.</div>
      )}

      <ul className="space-y-2">
        {items.map((n) => {
          const Icon = ICON_MAP[n.type] ?? AlertCircle
          const target = notificationTarget(n)
          const unread = !n.read_at
          const sentence = notificationSentence(n)
          const content = (
            <div className="flex gap-3 p-3 rounded border border-subtle bg-surface hover:border-[var(--brass)]/30 transition-colors">
              <div className="w-8 h-8 rounded-full bg-surface-hover flex items-center justify-center text-[var(--brass)] shrink-0">
                <Icon size={15} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${unread ? 'text-secondary font-medium' : 'text-muted'}`}>{sentence}</p>
                <p className="text-[10px] tracking-widest uppercase text-muted mt-0.5">
                  {formatDateTime(n.created_at, prefs)}
                </p>
              </div>
              <div className="shrink-0 flex items-center gap-2 self-center">
                {(n.type === 'ticket_created' ||
                  n.type === 'ticket_replied' ||
                  n.type === 'ticket_assigned' ||
                  n.type === 'ticket_status_changed' ||
                  n.type === 'feature_request_state_changed') && (
                  <span className="text-[9px] tracking-widest uppercase px-1.5 py-0.5 rounded border border-subtle text-muted">
                    Ticket
                  </span>
                )}
                {unread && <span aria-label="Unread" className="w-2 h-2 rounded-full bg-[var(--brass)] shrink-0" />}
              </div>
            </div>
          )
          const handleClick = () => {
            if (unread) markOneMutation.mutate(n.id)
          }
          return (
            <li key={n.id}>
              <Link to={target.to} search={target.search} hash={target.hash} onClick={handleClick}>
                {content}
              </Link>
            </li>
          )
        })}
      </ul>

      {hasNextPage && (
        <div className="flex justify-center pt-2">
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="px-4 py-2 rounded border border-subtle t-section-title hover:text-secondary hover:border-[var(--brass)]/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  )
}
