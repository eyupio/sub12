import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Users } from 'lucide-react'
import { adminLeaguesApi } from '../api/adminLeagues'

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

export default function AdminLeagues() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-leagues'],
    queryFn: adminLeaguesApi.list,
  })

  const items = data?.items ?? []

  return (
    <div className="max-w-3xl mx-auto px-4 lg:px-6 py-6 lg:py-8 space-y-6">
      <div>
        <h1 className="t-page-title">
          Admin · Leagues
        </h1>
        <p className="text-xs text-muted mt-1 tracking-wide">
          {items.length > 0 ? `${items.length} leagues` : 'Manage all leagues'}
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
          {items.map(league => (
            <Link
              key={league.id}
              to="/admin/leagues/$id"
              params={{ id: league.id }}
              className="flex items-center gap-3 p-3 lg:p-4 rounded border border-subtle bg-surface hover:border-[var(--brass)]/30 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-primary truncate">{league.name}</span>
                  <span className={`text-[9px] tracking-widest uppercase px-1.5 py-0.5 rounded shrink-0 ${league.type === 'private' ? 'bg-surface text-muted border border-subtle' : 'bg-[var(--brass)]/10 text-[var(--brass)]'}`}>
                    {league.type}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted">
                  <Users size={11} />
                  <span>{league.member_count} members</span>
                </div>
              </div>
              <ChevronRight size={14} className="text-muted shrink-0" />
            </Link>
          ))}
          {items.length === 0 && (
            <p className="text-sm text-muted text-center py-8">No leagues found.</p>
          )}
        </div>
      )}
    </div>
  )
}
