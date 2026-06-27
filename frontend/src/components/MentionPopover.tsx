import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { usersApi, type PublicProfile } from '../api/users'
import { identiconDataUri } from '../utils/identicon'

interface MentionPopoverProps {
  query: string
  onSelect: (user: PublicProfile) => void
  onClose: () => void
}

export function MentionPopover({ query, onSelect, onClose }: MentionPopoverProps) {
  const [debounced, setDebounced] = useState(query)
  const [highlight, setHighlight] = useState(0)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 150)
    return () => clearTimeout(t)
  }, [query])

  const { data, isLoading } = useQuery({
    queryKey: ['mention-search', debounced],
    queryFn: () => usersApi.search(debounced, 8),
    enabled: debounced.length >= 1,
  })

  const items = useMemo(() => data?.items ?? [], [data])

  useEffect(() => {
    setHighlight(0)
  }, [items.length])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (items.length === 0) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlight((h) => (h + 1) % items.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlight((h) => (h - 1 + items.length) % items.length)
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        onSelect(items[highlight])
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [items, highlight, onSelect, onClose])

  return (
    <div
      className="absolute left-0 right-0 top-full mt-1 z-[40] bg-surface border border-subtle rounded shadow-lg max-h-64 overflow-y-auto"
      role="listbox"
    >
      {isLoading && <p className="text-xs text-muted p-3">Searching...</p>}
      {!isLoading && items.length === 0 && (
        <p className="text-xs text-muted p-3">{debounced ? 'No matches' : 'Type to search users'}</p>
      )}
      {items.map((u, idx) => (
        <button
          key={u.id}
          type="button"
          role="option"
          aria-selected={idx === highlight}
          onClick={() => onSelect(u)}
          onMouseEnter={() => setHighlight(idx)}
          className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition ${idx === highlight ? 'bg-[var(--hover-bg,rgba(0,0,0,0.06))]' : ''}`}
        >
          <div className="w-7 h-7 rounded-full bg-[var(--muted-bg,rgba(0,0,0,0.05))] overflow-hidden flex items-center justify-center shrink-0">
            <img
              src={u.avatar_url || identiconDataUri(u.id || u.display_name || '')}
              alt=""
              className="w-full h-full object-cover"
            />
          </div>
          <span className="text-primary truncate">{u.display_name}</span>
        </button>
      ))}
    </div>
  )
}
