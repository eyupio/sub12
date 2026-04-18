import { Link } from '@tanstack/react-router'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { UserPlus, UserCheck, MessageSquare, Heart, CheckCircle, XCircle, AlertCircle, Users as UsersIcon, Trophy, AtSign, Flag } from 'lucide-react'
import { notificationsApi, Notification, NotificationType } from '../api/notifications'
import { formatDateTime, useRegionalPrefs } from '../utils/date'

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
  report_filed: Flag,
}

function notificationSentence(n: Notification): string {
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
    case 'report_filed': {
      const community = n.metadata?.community_name as string | undefined
      const target = (n.metadata?.target_label as string | undefined) ?? 'content'
      return community
        ? `${actor} flagged ${target} in ${community}`
        : `${actor} flagged ${target}`
    }
  }
}

function notificationLink(n: Notification): string | null {
  if (n.type === 'report_filed') {
    if (n.league_id) return `/leagues/${n.league_id}/reports`
    if (n.club_id) return `/clubs/${n.club_id}/reports`
    return '/admin/reports'
  }
  if (n.target_type === 'score_card' && n.target_id) return `/scores/${n.target_id}`
  if (n.target_type === 'post' && n.target_id) return `/scores/${n.target_id}` // posts open in-context; placeholder
  if (n.target_type === 'user' && n.target_id) return `/users/${n.target_id}`
  if (n.league_id) return `/leagues/${n.league_id}`
  if (n.club_id) return `/clubs/${n.club_id}`
  return null
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
        <h1 className="text-xl lg:text-2xl font-medium tracking-widest uppercase text-secondary">Notifications</h1>
        <div className="flex items-center gap-4">
          {hasUnread && (
            <button
              type="button"
              onClick={() => markAllMutation.mutate()}
              disabled={markAllMutation.isPending}
              className="text-[11px] tracking-widest uppercase text-muted hover:text-secondary disabled:opacity-40"
            >
              Mark all read
            </button>
          )}
          <Link to="/settings/notifications" className="text-[11px] tracking-widest uppercase text-muted hover:text-secondary">
            Settings
          </Link>
        </div>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-14 rounded border border-subtle bg-surface animate-pulse" />
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
          const Icon = ICON_MAP[n.type]
          const href = notificationLink(n)
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
              {unread && (
                <span aria-label="Unread" className="w-2 h-2 rounded-full bg-[var(--brass)] self-center shrink-0" />
              )}
            </div>
          )
          const handleClick = () => {
            if (unread) markOneMutation.mutate(n.id)
          }
          return (
            <li key={n.id}>
              {href ? (
                <Link to={href} onClick={handleClick}>
                  {content}
                </Link>
              ) : (
                <button type="button" onClick={handleClick} className="w-full text-left">
                  {content}
                </button>
              )}
            </li>
          )
        })}
      </ul>

      {hasNextPage && (
        <div className="flex justify-center pt-2">
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="px-4 py-2 rounded border border-subtle text-[11px] tracking-widest uppercase text-muted hover:text-secondary hover:border-[var(--brass)]/30 transition-colors disabled:opacity-40"
          >
            {isFetchingNextPage ? 'Loading...' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  )
}
