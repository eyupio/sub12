import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Bell } from 'lucide-react'
import { notificationsApi } from '../api/notifications'
import { supportTicketsApi } from '../api/supportTickets'
import { useAuthStore } from '../store/auth'

export function NotificationBell() {
  const token = useAuthStore((s) => s.accessToken)
  const { data } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => notificationsApi.unreadCount(),
    enabled: !!token,
    refetchInterval: 30_000,
    staleTime: 15_000,
  })
  const { data: tickets } = useQuery({
    queryKey: ['tickets', 'unread-count'],
    queryFn: () => supportTicketsApi.unreadCount(),
    enabled: !!token,
    refetchInterval: 30_000,
    staleTime: 15_000,
  })

  const notifCount = data?.count ?? 0
  const ticketCount = tickets?.count ?? 0
  const totalCount = notifCount + ticketCount
  const label =
    totalCount > 0
      ? `${totalCount} unread items (${notifCount} notifications, ${ticketCount} tickets)`
      : 'Notifications'

  return (
    <Link
      to="/notifications"
      className="relative text-muted hover:text-secondary transition-colors"
      aria-label={label}
      title={label}
    >
      <Bell size={17} />
      {totalCount > 0 && (
        <span
          aria-hidden="true"
          className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[var(--brass)] text-inverse text-[9px] leading-4 tracking-wider font-semibold flex items-center justify-center"
        >
          {totalCount > 99 ? '99+' : totalCount}
        </span>
      )}
    </Link>
  )
}
