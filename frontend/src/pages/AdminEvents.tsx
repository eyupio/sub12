import { FormEvent, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, ChevronRight, Plus, Save, Tags, Trash2, Users } from 'lucide-react'
import { adminEventsApi, type AdminEventDTO } from '../api/adminEvents'
import { categoriesApi, type Category } from '../api/categories'
import { HelpIcon } from '../components/Tooltip'
import { pageHelp } from '../components/tooltips'
import { Badge, PageGrid, PageHeader, Section, Tabs } from '../components/leagues'
import { toast } from '../store/toast'
import type { EventState } from '../api/events'

type TabKey = 'events' | 'categories'

function parseError(error: unknown) {
  if (!(error instanceof Error)) return 'Request failed.'
  return error.message
}

function stateBadge(state: EventState) {
  switch (state) {
    case 'live':
      return <Badge variant="red" live>Live</Badge>
    case 'open_for_entries':
      return <Badge variant="green">Open</Badge>
    case 'complete':
      return <Badge variant="gold">Complete</Badge>
    case 'archived':
      return <Badge variant="neutral">Archived</Badge>
    case 'draft':
    default:
      return <Badge variant="neutral">Draft</Badge>
  }
}

export default function AdminEvents() {
  const [tab, setTab] = useState<TabKey>('events')

  const eventsQuery = useQuery({
    queryKey: ['admin-events'],
    queryFn: () => adminEventsApi.list(),
  })
  const categoriesQuery = useQuery({
    queryKey: ['admin-categories'],
    queryFn: () => categoriesApi.adminList(),
  })

  const eventsCount = eventsQuery.data?.items?.length ?? 0
  const categoriesCount = categoriesQuery.data?.items?.length ?? 0

  return (
    <PageGrid>
      <PageHeader
        title="Admin · Events"
        info={<HelpIcon content={pageHelp.adminEvents} />}
        description="Every event on the platform plus the participant categories that group them."
      />

      <div className="lc-stack">
        <Section
          tabs={
            <Tabs<TabKey>
              tabs={[
                { value: 'events', label: 'Events', count: eventsCount },
                { value: 'categories', label: 'Categories', count: categoriesCount },
              ]}
              active={tab}
              onChange={setTab}
            />
          }
        >
          {tab === 'events' ? (
            <EventsList query={eventsQuery} />
          ) : (
            <CategoriesPanel query={categoriesQuery} />
          )}
        </Section>
      </div>
    </PageGrid>
  )
}

function EventsList({
  query,
}: {
  query: ReturnType<typeof useQuery<{ items: AdminEventDTO[] }, Error>>
}) {
  const queryClient = useQueryClient()
  const remove = useMutation({
    mutationFn: (id: string) => adminEventsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-events'] })
      toast('Event deleted', 'info')
    },
    onError: (err) => toast(parseError(err), 'error'),
  })

  if (query.isLoading) {
    return (
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ height: 56, borderRadius: 8, background: 'var(--bg-2)', opacity: 0.6 }} />
        ))}
      </div>
    )
  }
  if (query.error) {
    return <p style={{ padding: 16, color: 'var(--error-text)', fontSize: 13 }}>{parseError(query.error)}</p>
  }

  const items = query.data?.items ?? []
  if (items.length === 0) {
    return <p style={{ padding: 24, fontSize: 13, color: 'var(--muted)', textAlign: 'center' }}>No events yet.</p>
  }

  return (
    <ul style={{ display: 'flex', flexDirection: 'column' }}>
      {items.map((ev, i) => (
        <li
          key={ev.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '14px 18px',
            borderTop: i === 0 ? 'none' : '1px solid var(--line)',
          }}
        >
          <CalendarClock size={18} style={{ color: 'var(--muted)', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Link
                to="/events/$slug"
                params={{ slug: ev.slug }}
                style={{ fontSize: 14, color: 'var(--ink)', fontWeight: 500, textDecoration: 'none' }}
              >
                {ev.name}
              </Link>
              {stateBadge(ev.state)}
              {ev.club_name && (
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>· {ev.club_name}</span>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <span>{ev.discipline}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Users size={11} /> {ev.participant_count}
              </span>
              <span>by {ev.owner_display_name || '—'}</span>
            </div>
          </div>
          <button
            type="button"
            aria-label="Delete event"
            onClick={() => {
              if (confirm(`Delete event "${ev.name}"? This cannot be undone.`)) {
                remove.mutate(ev.id)
              }
            }}
            disabled={remove.isPending}
            className="lc-icon-btn"
            style={{ color: 'var(--red)' }}
          >
            <Trash2 size={14} />
          </button>
          <Link to="/events/$slug" params={{ slug: ev.slug }} className="lc-icon-btn" aria-label="Open event">
            <ChevronRight size={14} />
          </Link>
        </li>
      ))}
    </ul>
  )
}

function CategoriesPanel({
  query,
}: {
  query: ReturnType<typeof useQuery<{ items: Category[] }, Error>>
}) {
  const queryClient = useQueryClient()

  const create = useMutation({
    mutationFn: (body: { slug: string; label: string; sort_order: number }) =>
      categoriesApi.adminCreate(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-categories'] })
      queryClient.invalidateQueries({ queryKey: ['categories', 'public'] })
      toast('Category added', 'success')
    },
    onError: (err) => toast(parseError(err), 'error'),
  })

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<Category> }) =>
      categoriesApi.adminUpdate(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-categories'] })
      queryClient.invalidateQueries({ queryKey: ['categories', 'public'] })
      toast('Saved', 'success')
    },
    onError: (err) => toast(parseError(err), 'error'),
  })

  const remove = useMutation({
    mutationFn: (id: string) => categoriesApi.adminDelete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-categories'] })
      queryClient.invalidateQueries({ queryKey: ['categories', 'public'] })
      toast('Category removed', 'info')
    },
    onError: (err) => toast(parseError(err), 'error'),
  })

  if (query.isLoading) {
    return (
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ height: 48, borderRadius: 8, background: 'var(--bg-2)', opacity: 0.6 }} />
        ))}
      </div>
    )
  }

  const items = query.data?.items ?? []

  return (
    <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <CreateCategoryForm
        pending={create.isPending}
        onSubmit={(slug, label, sortOrder) => create.mutate({ slug, label, sort_order: sortOrder })}
      />

      <ul style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--line)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        {items.map((c, i) => (
          <CategoryRow
            key={c.id}
            cat={c}
            isFirst={i === 0}
            onSave={(body) => update.mutate({ id: c.id, body })}
            onRemove={() => {
              if (confirm(`Remove category "${c.label}"?`)) remove.mutate(c.id)
            }}
            pending={update.isPending || remove.isPending}
          />
        ))}
        {items.length === 0 && (
          <li style={{ padding: 14, fontSize: 13, color: 'var(--muted)', textAlign: 'center' }}>
            <Tags size={20} style={{ opacity: 0.5 }} />
            <p style={{ marginTop: 6 }}>No categories yet. Add one above.</p>
          </li>
        )}
      </ul>
    </div>
  )
}

function CreateCategoryForm({
  onSubmit,
  pending,
}: {
  onSubmit: (slug: string, label: string, sortOrder: number) => void
  pending: boolean
}) {
  const [slug, setSlug] = useState('')
  const [label, setLabel] = useState('')
  const [sortOrder, setSortOrder] = useState(100)

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!slug.trim() || !label.trim()) return
    onSubmit(slug.trim().toLowerCase(), label.trim(), sortOrder)
    setSlug('')
    setLabel('')
    setSortOrder(100)
  }

  const inputCls =
    'w-full bg-surface border border-subtle rounded px-3 py-2 text-sm text-primary placeholder-muted focus:outline-none focus:border-[var(--gold)]/50 transition-colors'

  return (
    <form onSubmit={submit} className="grid grid-cols-12 gap-2 items-end">
      <div className="col-span-4">
        <label className="t-section-title">Slug</label>
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="open"
          className={`${inputCls} font-mono`}
        />
      </div>
      <div className="col-span-5">
        <label className="t-section-title">Label</label>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Open" className={inputCls} />
      </div>
      <div className="col-span-2">
        <label className="t-section-title">Order</label>
        <input
          type="number"
          value={sortOrder}
          onChange={(e) => setSortOrder(Number.parseInt(e.target.value || '0', 10))}
          className={inputCls}
        />
      </div>
      <div className="col-span-1">
        <button type="submit" disabled={pending} aria-label="Add category" className="lc-icon-btn" style={{ color: 'var(--gold)', width: '100%' }}>
          <Plus size={16} />
        </button>
      </div>
    </form>
  )
}

function CategoryRow({
  cat,
  isFirst,
  onSave,
  onRemove,
  pending,
}: {
  cat: Category
  isFirst: boolean
  onSave: (body: Partial<Category>) => void
  onRemove: () => void
  pending: boolean
}) {
  const [label, setLabel] = useState(cat.label)
  const [sortOrder, setSortOrder] = useState(cat.sort_order)
  const [active, setActive] = useState(cat.is_active)
  const dirty = label !== cat.label || sortOrder !== cat.sort_order || active !== cat.is_active

  const inputCls =
    'bg-surface border border-subtle rounded px-2 py-1.5 text-sm text-primary focus:outline-none focus:border-[var(--gold)]/50 transition-colors'

  return (
    <li
      className="grid grid-cols-12 gap-2 p-3 items-center"
      style={{ borderTop: isFirst ? 'none' : '1px solid var(--line)' }}
    >
      <span className="col-span-3 font-mono text-xs text-muted truncate">{cat.slug}</span>
      <input value={label} onChange={(e) => setLabel(e.target.value)} className={`col-span-4 ${inputCls}`} />
      <input
        type="number"
        value={sortOrder}
        onChange={(e) => setSortOrder(Number.parseInt(e.target.value || '0', 10))}
        className={`col-span-2 ${inputCls}`}
      />
      <label className="col-span-1 text-xs flex items-center gap-1">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        On
      </label>
      <div className="col-span-2 flex justify-end gap-1">
        <button
          type="button"
          onClick={() => onSave({ label, sort_order: sortOrder, is_active: active })}
          disabled={!dirty || pending}
          aria-label="Save"
          className="lc-icon-btn"
          style={{ color: dirty ? 'var(--gold)' : 'var(--muted)', opacity: dirty ? 1 : 0.4 }}
        >
          <Save size={14} />
        </button>
        <button type="button" onClick={onRemove} disabled={pending} aria-label="Remove" className="lc-icon-btn" style={{ color: 'var(--red)' }}>
          <Trash2 size={14} />
        </button>
      </div>
    </li>
  )
}
