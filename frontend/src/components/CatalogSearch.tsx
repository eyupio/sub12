import { useState, useRef, useEffect, useMemo } from 'react'
import { Search } from 'lucide-react'

interface CatalogSearchProps<T> {
  items: T[]
  searchKeys: (keyof T)[]
  renderItem: (item: T) => string
  renderDetail?: (item: T) => string
  onSelect: (item: T) => void
  onManualEntry: () => void
  placeholder: string
}

const inputCls =
  'w-full bg-surface border border-subtle rounded px-3 py-2 pl-9 text-primary text-sm placeholder:text-muted focus:outline-none focus:border-[var(--brass)]/50'

export function CatalogSearch<T>({
  items,
  searchKeys,
  renderItem,
  renderDetail,
  onSelect,
  onManualEntry,
  placeholder,
}: CatalogSearchProps<T>) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(true)
  const [activeIndex, setActiveIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const filtered = useMemo(() => {
    if (!query.trim()) return items.slice(0, 8)
    const q = query.toLowerCase()
    return items
      .filter(item =>
        searchKeys.some(key => String(item[key]).toLowerCase().includes(q))
      )
      .slice(0, 8)
  }, [items, query, searchKeys])

  useEffect(() => {
    setActiveIndex(-1)
  }, [query])

  useEffect(() => {
    setOpen(true)
  }, [items])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const el = listRef.current.children[activeIndex] as HTMLElement | undefined
      el?.scrollIntoView({ block: 'nearest' })
    }
  }, [activeIndex])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) return
    const total = filtered.length + 1 // +1 for "enter manually"
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => (i + 1) % total)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => (i - 1 + total) % total)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIndex >= 0 && activeIndex < filtered.length) {
        onSelect(filtered[activeIndex])
        setOpen(false)
      } else if (activeIndex === filtered.length) {
        onManualEntry()
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
        <input
          className={inputCls}
          placeholder={placeholder}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
        />
      </div>

      {open && (
        <ul
          ref={listRef}
          className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded border border-subtle bg-surface shadow-lg"
        >
          {filtered.map((item, i) => (
            <li
              key={i}
              className={[
                'px-3 py-2 cursor-pointer text-sm transition-colors',
                i === activeIndex
                  ? 'bg-[var(--brass)]/10 text-[var(--brass)]'
                  : 'text-secondary hover:bg-surface-hover',
              ].join(' ')}
              onMouseEnter={() => setActiveIndex(i)}
              onMouseDown={e => {
                e.preventDefault()
                onSelect(item)
                setOpen(false)
              }}
            >
              <span className="font-medium">{renderItem(item)}</span>
              {renderDetail && (
                <span className="ml-2 text-[11px] text-muted">{renderDetail(item)}</span>
              )}
            </li>
          ))}
          {filtered.length === 0 && query.trim() && (
            <li className="px-3 py-2 text-sm text-muted">No matches found</li>
          )}
          <li
            className={[
              'px-3 py-2 cursor-pointer text-sm border-t border-subtle transition-colors',
              activeIndex === filtered.length
                ? 'bg-[var(--brass)]/10 text-[var(--brass)]'
                : 'text-muted hover:text-secondary hover:bg-surface-hover',
            ].join(' ')}
            onMouseEnter={() => setActiveIndex(filtered.length)}
            onMouseDown={e => {
              e.preventDefault()
              onManualEntry()
            }}
          >
            or enter manually&hellip;
          </li>
        </ul>
      )}
    </div>
  )
}
