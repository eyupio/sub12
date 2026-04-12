import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, ChevronLeft } from 'lucide-react'
import { adminUsersApi } from '../api/adminUsers'

const PAGE_SIZE = 50

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

export default function AdminUsers() {
  const [offset, setOffset] = useState(0)

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-users', offset],
    queryFn: () => adminUsersApi.list(PAGE_SIZE, offset),
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const hasPrev = offset > 0
  const hasNext = offset + PAGE_SIZE < total

  return (
    <div className="max-w-3xl mx-auto px-4 lg:px-6 py-6 lg:py-8 space-y-6">
      <div>
        <h1 className="text-xl lg:text-2xl font-medium tracking-widest uppercase text-secondary">
          Admin · Users
        </h1>
        <p className="text-xs text-muted mt-1 tracking-wide">
          {total > 0 ? `${total} registered users` : 'Manage registered users'}
        </p>
      </div>

      {error && (
        <p className="text-[var(--error-text)] text-sm">{parseError(error)}</p>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-14 rounded bg-surface animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          {items.map(u => (
            <Link
              key={u.id}
              to="/admin/users/$id"
              params={{ id: u.id }}
              className="flex items-center gap-3 p-3 lg:p-4 rounded border border-subtle bg-surface hover:border-[var(--brass)]/30 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-[var(--brass)]/10 flex items-center justify-center shrink-0">
                {u.avatar_url ? (
                  <img src={u.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <span className="text-[10px] text-[var(--brass)] font-medium">
                    {u.display_name[0]?.toUpperCase() ?? '?'}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-primary truncate">{u.display_name}</span>
                  {u.role === 'admin' && (
                    <span className="text-[9px] tracking-widest uppercase bg-[var(--brass)]/10 text-[var(--brass)] px-1.5 py-0.5 rounded shrink-0">
                      Admin
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted truncate block">{u.email}</span>
              </div>
              <ChevronRight size={14} className="text-muted shrink-0" />
            </Link>
          ))}
          {items.length === 0 && (
            <p className="text-sm text-muted text-center py-8">No users found.</p>
          )}
        </div>
      )}

      {(hasPrev || hasNext) && (
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={() => setOffset(o => Math.max(0, o - PAGE_SIZE))}
            disabled={!hasPrev}
            className="flex items-center gap-1 text-[11px] tracking-widest uppercase text-secondary disabled:text-muted transition-colors"
          >
            <ChevronLeft size={14} />
            Prev
          </button>
          <span className="text-xs text-muted">
            {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
          </span>
          <button
            onClick={() => setOffset(o => o + PAGE_SIZE)}
            disabled={!hasNext}
            className="flex items-center gap-1 text-[11px] tracking-widest uppercase text-secondary disabled:text-muted transition-colors"
          >
            Next
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
