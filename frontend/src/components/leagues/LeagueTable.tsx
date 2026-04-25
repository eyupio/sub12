import { useMemo, useState } from 'react'

export type Column<R> = {
  key: keyof R | string
  label: string
  align?: 'left' | 'right' | 'center'
  sortable?: boolean
  render: (row: R, idx: number) => React.ReactNode
  width?: string | number
  className?: string
  sortValue?: (row: R) => number | string
}

export type StandingRow = {
  id: string
  rank: number
  name: string
  handle?: string | null
  avatarUrl?: string | null
  cards?: number
  best?: number | null
  bestX?: number | null
  avg?: number | null
  recent?: number[]
  trend?: number | null
  isMe?: boolean
}

export function LeagueTable<R extends { id: string }>({
  rows,
  columns,
  initialSortKey,
  initialSortDir = 'asc',
  emptyState,
}: {
  rows: R[]
  columns: Column<R>[]
  initialSortKey?: string
  initialSortDir?: 'asc' | 'desc'
  emptyState?: React.ReactNode
}) {
  const [sortKey, setSortKey] = useState<string | undefined>(initialSortKey)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(initialSortDir)

  const sorted = useMemo(() => {
    if (!sortKey) return rows
    const col = columns.find((c) => c.key === sortKey)
    if (!col || !col.sortable) return rows
    const get = col.sortValue ?? ((r: R) => (r as Record<string, unknown>)[col.key as string] as number | string)
    return [...rows].sort((a, b) => {
      const va = get(a)
      const vb = get(b)
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      if (typeof va === 'number' && typeof vb === 'number') {
        return sortDir === 'asc' ? va - vb : vb - va
      }
      return sortDir === 'asc'
        ? String(va).localeCompare(String(vb))
        : String(vb).localeCompare(String(va))
    })
  }, [rows, columns, sortKey, sortDir])

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  if (rows.length === 0 && emptyState) return <>{emptyState}</>

  return (
    <div className="lc-table-wrap">
      <table className="lc-table">
        <thead>
          <tr>
            {columns.map((c) => {
              const align = c.align ?? 'left'
              const klass = `${align === 'right' ? 'num' : align === 'center' ? 'center' : ''} ${c.sortable ? 'sortable' : ''} ${c.className ?? ''}`
              const isSorted = sortKey === c.key
              return (
                <th
                  key={String(c.key)}
                  className={klass}
                  style={c.width ? { width: c.width } : undefined}
                  onClick={c.sortable ? () => toggleSort(String(c.key)) : undefined}
                >
                  {c.label}
                  {c.sortable && (
                    <span className="lc-sort">
                      {isSorted ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                    </span>
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, idx) => (
            <tr key={row.id} className={(row as unknown as StandingRow).isMe ? 'is-me' : ''}>
              {columns.map((c) => {
                const align = c.align ?? 'left'
                const klass = `${align === 'right' ? 'num' : align === 'center' ? 'center' : ''} ${c.className ?? ''}`
                return (
                  <td key={String(c.key)} className={klass}>
                    {c.render(row, idx)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

