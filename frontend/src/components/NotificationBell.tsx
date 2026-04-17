import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Bell } from 'lucide-react'
import { notificationsApi } from '../api/notifications'
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
  const count = data?.count ?? 0
  const label = count > 0 ? `${count} unread notifications` : 'Notifications'

  return (
    <Link
      to="/notifications"
      className="relative text-muted hover:text-secondary transition-colors"
      aria-label={label}
      title={label}
    >
      <Bell size={17} />
      {count > 0 && (
        <span
          aria-hidden="true"
          className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[var(--brass)] text-inverse text-[9px] leading-4 tracking-wider font-semibold flex items-center justify-center"
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  )
}
