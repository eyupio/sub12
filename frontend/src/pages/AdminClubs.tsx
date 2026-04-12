import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Users } from 'lucide-react'
import { adminClubsApi } from '../api/adminClubs'

function parseError(error: unknown) {
  if (!(error instanceof Error)) return 'Request failed.'
  const msg = error.message
  const match = msg.match(/\{.*\}$/)
  if (!match) return msg
  try {
    const parsed = JSON.parse(match[0]) as { error?: string }
    return parsed.error ?? msg
  } catch {
    return msg
  }
}

export default function AdminClubs() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-clubs'],
    queryFn: adminClubsApi.list,
  })

  const items = data?.items ?? []

  return (
    <div className="max-w-3xl mx-auto px-4 lg:px-6 py-6 lg:py-8 space-y-6">
      <div>
        <h1 className="text-xl lg:text-2xl font-medium tracking-widest uppercase text-secondary">
          Admin · Clubs
        </h1>
        <p className="text-xs text-muted mt-1 tracking-wide">
          {items.length > 0 ? `${items.length} clubs` : 'Manage all clubs'}
        </p>
      </div>

      {error && (
        <p className="text-[var(--error-text)] text-sm">{parseError(error)}</p>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-14 rounded bg-surface animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          {items.map(club => (
            <Link
              key={club.id}
              to="/admin/clubs/$id"
              params={{ id: club.id }}
              className="flex items-center gap-3 p-3 lg:p-4 rounded border border-subtle bg-surface hover:border-[var(--brass)]/30 transition-colors"
            >
              {club.image_url ? (
                <img src={club.image_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-[var(--brass)]/10 flex items-center justify-center shrink-0">
                  <Users size={14} className="text-[var(--brass)]" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <span className="text-sm text-primary block truncate">{club.name}</span>
                <span className="text-xs text-muted">{club.member_count} members</span>
              </div>
              <ChevronRight size={14} className="text-muted shrink-0" />
            </Link>
          ))}
          {items.length === 0 && (
            <p className="text-sm text-muted text-center py-8">No clubs found.</p>
          )}
        </div>
      )}
    </div>
  )
}
