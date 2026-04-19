import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Target, Crosshair, Zap } from 'lucide-react'
import { scoreCardApi, ScoreCardSummary } from '../api/scoreCards'
import { pelletTestApi, PelletTestSessionSummary } from '../api/pelletTesting'

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

export default function Drafts() {
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
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={`${row.kind}-${row.id}`}>
              <Link
                to={row.href}
                className="flex items-center gap-3 p-3 rounded-lg border border-subtle bg-surface hover:border-[var(--brass)]/40 transition-colors"
              >
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
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
