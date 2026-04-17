import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Search, Users as UsersIcon } from 'lucide-react'
import { usersApi } from '../api/users'

export default function Users() {
  const [input, setInput] = useState('')
  const [debounced, setDebounced] = useState('')

  useEffect(() => {
    const h = setTimeout(() => setDebounced(input.trim()), 250)
    return () => clearTimeout(h)
  }, [input])

  const { data, isFetching } = useQuery({
    queryKey: ['users', 'search', debounced],
    queryFn: () => usersApi.search(debounced),
    enabled: debounced.length >= 2,
  })

  const results = data?.items ?? []

  return (
    <div className="p-4 lg:p-8 space-y-4 max-w-lg lg:max-w-2xl mx-auto pb-24">
      <h1 className="text-lg font-medium tracking-widest uppercase text-secondary">Find People</h1>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Search by display name"
          aria-label="Search users"
          autoFocus
          className="w-full bg-surface border border-subtle rounded pl-9 pr-3 py-2.5 text-sm text-primary placeholder-muted focus:outline-none focus:border-[var(--brass)]/50 transition-colors"
        />
      </div>

      {debounced.length > 0 && debounced.length < 2 && (
        <p className="text-xs text-muted">Type at least 2 characters to search.</p>
      )}

      {debounced.length >= 2 && (
        <div className="rounded border border-subtle bg-surface">
          {isFetching && results.length === 0 ? (
            <p className="text-xs text-muted px-3 py-4 text-center">Searching...</p>
          ) : results.length === 0 ? (
            <div className="px-3 py-6 text-center space-y-1">
              <UsersIcon size={20} className="mx-auto text-muted" />
              <p className="text-xs text-muted">No users match that name.</p>
              <p className="text-[10px] text-muted">Private profiles are only findable by exact display name.</p>
            </div>
          ) : (
            <ul className="divide-y divide-[var(--border-subtle)]">
              {results.map((u) => {
                const initials = u.display_name
                  .split(' ')
                  .map((w) => w[0])
                  .slice(0, 2)
                  .join('')
                  .toUpperCase()
                return (
                  <li key={u.id}>
                    <Link
                      to="/users/$id"
                      params={{ id: u.id }}
                      className="flex items-center gap-3 px-3 py-2.5 hover:bg-surface-hover transition-colors"
                    >
                      <div className="w-9 h-9 rounded-full overflow-hidden border border-subtle flex-shrink-0 bg-surface-hover flex items-center justify-center text-[11px] font-medium text-muted">
                        {u.avatar_url ? (
                          <img src={u.avatar_url} alt={u.display_name} className="w-full h-full object-cover" />
                        ) : (
                          initials
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-primary truncate">{u.display_name}</p>
                        {u.location && <p className="text-[11px] text-muted truncate">{u.location}</p>}
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {debounced.length < 2 && (
        <p className="text-xs text-muted">
          Search other shooters by their display name to follow them.
        </p>
      )}
    </div>
  )
}
