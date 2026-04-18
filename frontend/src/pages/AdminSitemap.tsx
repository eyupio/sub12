import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Globe, Send, RefreshCw, CheckCircle, XCircle, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'
import { adminSitemapApi, SitemapSubmission } from '../api/adminSitemap'

const PAGE_SIZE = 20

const engines = [
  { id: 'indexnow', label: 'IndexNow' },
] as const

const btnPrimary =
  'bg-[var(--brass)] hover:opacity-90 disabled:opacity-50 text-inverse font-medium text-[11px] tracking-widest uppercase py-2.5 px-4 rounded transition-opacity inline-flex items-center gap-2'

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

function formatDate(iso: string) {
  return new Date(iso).toLocaleString()
}

function StatusBadge({ code }: { code?: number }) {
  if (code == null) return <span className="text-red-400 text-xs" role="status"><span className="sr-only">Error: </span>Network Error</span>
  if (code >= 200 && code < 300) return <span className="text-green-400 text-xs flex items-center gap-1" role="status"><CheckCircle size={12} aria-hidden="true" /><span className="sr-only">Success: </span>{code}</span>
  return <span className="text-red-400 text-xs flex items-center gap-1" role="status"><XCircle size={12} aria-hidden="true" /><span className="sr-only">Error: </span>{code}</span>
}

export default function AdminSitemap() {
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<string[]>(['indexnow'])
  const [offset, setOffset] = useState(0)

  const statsQuery = useQuery({
    queryKey: ['admin-sitemap-stats'],
    queryFn: adminSitemapApi.getStats,
  })

  const submissionsQuery = useQuery({
    queryKey: ['admin-sitemap-submissions', offset],
    queryFn: () => adminSitemapApi.listSubmissions(PAGE_SIZE, offset),
  })

  const pingMutation = useMutation({
    mutationFn: () => adminSitemapApi.ping({ engines: selected }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-sitemap-submissions'] })
    },
  })

  const stats = statsQuery.data
  const submissions = submissionsQuery.data?.submissions ?? []
  const total = submissionsQuery.data?.total ?? 0

  const toggleEngine = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id],
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-8">
      <h1 className="text-xl font-semibold text-primary flex items-center gap-2">
        <Globe size={20} /> Sitemap &amp; SEO
      </h1>

      {/* Stats card */}
      <section className="bg-surface border border-subtle rounded-lg p-5 space-y-4">
        <h2 className="text-[11px] tracking-widest uppercase text-muted">Sitemap Overview</h2>
        {statsQuery.isLoading && <p className="text-sm text-muted">Loading…</p>}
        {statsQuery.error && (
          <p className="text-sm text-red-400">{parseError(statsQuery.error)}</p>
        )}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            {([
              ['Static Pages', stats.static_pages],
              ['Public Users', stats.public_users],
              ['Public Leagues', stats.public_leagues],
              ['Public Clubs', stats.public_clubs],
              ['Total URLs', stats.total_urls],
            ] as const).map(([label, value]) => (
              <div key={label} className="text-center">
                <div className="text-2xl font-bold text-primary">{value}</div>
                <div className="text-[10px] tracking-widest uppercase text-muted mt-1">{label}</div>
              </div>
            ))}
          </div>
        )}
        <a
          href="/sitemap.xml"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-[var(--brass)] hover:underline inline-flex items-center gap-1"
        >
          View sitemap.xml <ExternalLink size={12} />
        </a>
      </section>

      {/* Ping controls */}
      <section className="bg-surface border border-subtle rounded-lg p-5 space-y-4">
        <h2 className="text-[11px] tracking-widest uppercase text-muted">Submit Sitemap to Search Engines</h2>
        <p className="text-xs text-muted">
          IndexNow requires a configured key. Set <code>INDEXNOW_KEY</code> (and optionally <code>INDEXNOW_KEY_LOCATION</code>) on the API server before submitting.
        </p>
        <div className="flex flex-wrap gap-3">
          {engines.map((e) => (
            <label key={e.id} className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={selected.includes(e.id)}
                onChange={() => toggleEngine(e.id)}
                className="accent-[var(--brass)]"
              />
              <span className="text-sm text-secondary">{e.label}</span>
            </label>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <button
            className={btnPrimary}
            disabled={selected.length === 0 || pingMutation.isPending}
            onClick={() => pingMutation.mutate()}
          >
            {pingMutation.isPending ? (
              <><RefreshCw size={14} className="animate-spin" /> Submitting…</>
            ) : (
              <><Send size={14} /> Ping Selected Engines</>
            )}
          </button>
        </div>
        {pingMutation.isError && (
          <p className="text-sm text-red-400">{parseError(pingMutation.error)}</p>
        )}
        {pingMutation.isSuccess && (
          <p className="text-sm text-green-400">Ping submitted successfully!</p>
        )}
      </section>

      {/* Submission history */}
      <section className="bg-surface border border-subtle rounded-lg p-5 space-y-4">
        <h2 className="text-[11px] tracking-widest uppercase text-muted">Submission History</h2>
        {submissionsQuery.isLoading && <p className="text-sm text-muted">Loading…</p>}
        {submissionsQuery.error && (
          <p className="text-sm text-red-400">{parseError(submissionsQuery.error)}</p>
        )}
        {submissions.length === 0 && !submissionsQuery.isLoading && (
          <p className="text-sm text-muted">No submissions yet.</p>
        )}
        {submissions.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] tracking-widest uppercase text-muted border-b border-subtle">
                  <th className="text-left py-2 pr-3">Engine</th>
                  <th className="text-left py-2 pr-3">Status</th>
                  <th className="text-left py-2 pr-3">Error</th>
                  <th className="text-left py-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((s: SitemapSubmission) => (
                  <tr key={s.id} className="border-b border-subtle/50">
                    <td className="py-2 pr-3 text-primary capitalize">{s.engine}</td>
                    <td className="py-2 pr-3"><StatusBadge code={s.status_code} /></td>
                    <td className="py-2 pr-3 text-muted truncate max-w-[200px]">{s.error ?? '—'}</td>
                    <td className="py-2 text-muted whitespace-nowrap">{formatDate(s.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between pt-2">
            <button
              className="text-xs text-muted hover:text-primary disabled:opacity-30 flex items-center gap-1"
              disabled={offset === 0}
              onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
            >
              <ChevronLeft size={14} /> Previous
            </button>
            <span className="text-xs text-muted">
              {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
            </span>
            <button
              className="text-xs text-muted hover:text-primary disabled:opacity-30 flex items-center gap-1"
              disabled={offset + PAGE_SIZE >= total}
              onClick={() => setOffset((o) => o + PAGE_SIZE)}
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
