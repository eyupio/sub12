import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { CheckSquare, Crosshair, Square, Target, Trash2, Zap } from 'lucide-react'
import { scoreCardApi, ScoreCardSummary } from '../api/scoreCards'
import { pelletTestApi, PelletTestSessionSummary } from '../api/pelletTesting'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { toast } from '../store/toast'

interface DraftRow {
  id: string
  kind: 'score' | 'pellet'
  title: string
  subtitle: string
  when: string
  thumbnail?: string
  href: string
}

function toRow(card: ScoreCardSummary): DraftRow {
  return {
    id: card.id,
    kind: 'score',
    title: card.league_name ? `League: ${card.league_name}` : card.club_id ? 'Club score card' : 'Personal score card',
    subtitle: card.location ? card.location : 'No location',
    when: card.created_at,
    thumbnail: card.card_image_url ?? undefined,
    href: `/scores/new?draftId=${card.id}`,
  }
}

function toRowPT(session: PelletTestSessionSummary): DraftRow {
  return {
    id: session.id,
    kind: 'pellet',
    title: `${session.rifle_make} ${session.rifle_model}`,
    subtitle: `${session.pellet_brand} ${session.pellet_model}`,
    when: session.created_at,
    thumbnail: session.first_image_url ?? undefined,
    href: `/pellet-testing/new?draftId=${session.id}`,
  }
}

function relative(iso: string): string {
  const d = new Date(iso)
  const secs = (Date.now() - d.getTime()) / 1000
  if (secs < 60) return 'just now'
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

function rowKey(row: DraftRow): string {
  return `${row.kind}-${row.id}`
}

export default function Drafts() {
  const qc = useQueryClient()
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [pendingDelete, setPendingDelete] = useState<DraftRow[] | null>(null)

  const { data: scoreDrafts } = useQuery({
    queryKey: ['score-drafts'],
    queryFn: () => scoreCardApi.list(50, 0, 'drafts'),
  })
  const { data: pelletDrafts } = useQuery({
    queryKey: ['pellet-drafts'],
    queryFn: () => pelletTestApi.list(50, 0, 'drafts'),
  })

  const rows: DraftRow[] = [
    ...(scoreDrafts?.items ?? []).map(toRow),
    ...(pelletDrafts?.items ?? []).map(toRowPT),
  ].sort((a, b) => (a.when < b.when ? 1 : -1))

  const selectedRows = rows.filter(row => selected.has(rowKey(row)))
  const allSelected = rows.length > 0 && selectedRows.length === rows.length

  function toggleSelected(key: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map(rowKey)))
  }

  const deleteMutation = useMutation({
    mutationFn: async (drafts: DraftRow[]) => {
      await Promise.all(drafts.map(row =>
        row.kind === 'score'
          ? scoreCardApi.remove(row.id)
          : pelletTestApi.delete(row.id)
      ))
      return drafts.length
    },
    onSuccess: (count) => {
      setSelected(new Set())
      setPendingDelete(null)
      qc.invalidateQueries({ queryKey: ['score-drafts'] })
      qc.invalidateQueries({ queryKey: ['score-drafts-count'] })
      qc.invalidateQueries({ queryKey: ['pellet-drafts'] })
      qc.invalidateQueries({ queryKey: ['pellet-drafts-count'] })
      toast(count === 1 ? 'Draft deleted' : `${count} drafts deleted`, 'success')
    },
    onError: (err) => {
      toast(err instanceof Error ? err.message : 'Failed to delete drafts', 'error')
    },
  })

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-medium tracking-wide">Drafts</h1>
        <p className="text-sm text-muted">
          Quick-captured entries waiting for shot scores, measurements, or final details.
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-subtle bg-surface p-8 text-center space-y-3">
          <p className="text-muted text-sm">No drafts yet.</p>
          <Link
            to="/quick-capture"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--brass)] text-black text-sm font-medium"
          >
            <Zap size={14} /> Start a quick capture
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={toggleAll}
              className="inline-flex items-center gap-2 text-xs tracking-widest uppercase text-muted hover:text-secondary transition-colors"
            >
              {allSelected ? <CheckSquare size={15} /> : <Square size={15} />}
              {allSelected ? 'Deselect all' : 'Select all'}
            </button>
            {selectedRows.length > 0 && (
              <button
                type="button"
                onClick={() => setPendingDelete(selectedRows)}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded border border-[var(--error-text)]/30 text-[var(--error-text)] text-xs tracking-widest uppercase hover:bg-[var(--error-bg)] transition-colors"
              >
                <Trash2 size={13} />
                Delete selected
              </button>
            )}
          </div>

          <ul className="space-y-2">
            {rows.map((row) => (
              <li key={`${row.kind}-${row.id}`}>
                <div className="flex items-center gap-2 p-3 rounded-lg border border-subtle bg-surface hover:border-[var(--brass)]/40 transition-colors">
                  <button
                    type="button"
                    onClick={() => toggleSelected(rowKey(row))}
                    className="shrink-0 text-muted hover:text-secondary transition-colors"
                    aria-label={selected.has(rowKey(row)) ? 'Deselect draft' : 'Select draft'}
                  >
                    {selected.has(rowKey(row)) ? <CheckSquare size={18} /> : <Square size={18} />}
                  </button>
                  <Link to={row.href} className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="shrink-0 w-14 h-14 rounded bg-black/60 overflow-hidden flex items-center justify-center">
                      {row.thumbnail ? (
                        <img src={row.thumbnail} alt="" className="w-full h-full object-cover" />
                      ) : row.kind === 'score' ? (
                        <Target size={22} className="text-muted" />
                      ) : (
                        <Crosshair size={22} className="text-muted" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] tracking-widest uppercase px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                          Draft
                        </span>
                        <span className="text-xs text-muted">{relative(row.when)}</span>
                      </div>
                      <div className="text-sm text-primary font-medium tracking-wide truncate">{row.title}</div>
                      <div className="text-xs text-muted truncate">{row.subtitle}</div>
                    </div>
                    <span className="text-[var(--brass)] text-sm tracking-wide">Refine</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => setPendingDelete([row])}
                    className="shrink-0 rounded p-2 text-muted hover:text-[var(--error-text)] hover:bg-[var(--error-bg)] transition-colors"
                    aria-label="Delete draft"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={pendingDelete && pendingDelete.length > 1 ? 'Delete drafts?' : 'Delete draft?'}
        message={pendingDelete && pendingDelete.length > 1
          ? `This will permanently delete ${pendingDelete.length} selected drafts. This cannot be undone.`
          : 'This draft will be permanently deleted. This cannot be undone.'}
        confirmLabel={deleteMutation.isPending ? 'Deleting...' : 'Delete'}
        onConfirm={() => {
          if (pendingDelete && !deleteMutation.isPending) {
            deleteMutation.mutate(pendingDelete)
          }
        }}
        onCancel={() => {
          if (!deleteMutation.isPending) setPendingDelete(null)
        }}
      />
    </div>
  )
}
