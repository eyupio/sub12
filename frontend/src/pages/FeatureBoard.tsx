import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { featureRequestsApi } from '../api/featureRequests'
import { FeatureRequestVoteButton } from '../components/FeatureRequestVoteButton'

const statuses = ['all', 'submitted', 'refining', 'accepted', 'rejected', 'planned', 'in_progress', 'done'] as const

export default function FeatureBoard() {
  const [scopeType, setScopeType] = useState<'platform' | 'league' | 'club'>('platform')
  const [scopeID, setScopeID] = useState('')
  const [status, setStatus] = useState<(typeof statuses)[number]>('all')

  const { data, isLoading } = useQuery({
    queryKey: ['feature-requests', 'ranking', scopeType, scopeID],
    queryFn: () => featureRequestsApi.ranking({ scopeType, scopeID: scopeID || undefined, limit: 100 }),
  })

  const items = useMemo(() => {
    const rows = data?.items ?? []
    if (status === 'all') return rows
    return rows.filter((x) => x.status === status)
  }, [data?.items, status])

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-6 space-y-4">
      <div className="rounded-2xl border border-subtle bg-surface p-4">
        <h1 className="text-2xl font-semibold">Community feature board</h1>
        <p className="text-sm text-muted mt-1">
          Browse, rank, and upvote scoped feature requests. Need to submit a new request? Open a{' '}
          <Link to="/support" className="text-[var(--brass)] hover:underline">feature ticket in Support</Link>.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="text-sm">
            Scope type
            <select className="mt-1 w-full rounded-md border border-subtle bg-transparent p-2" value={scopeType} onChange={e => setScopeType(e.target.value as 'platform' | 'league' | 'club')}>
              <option value="platform">Platform</option>
              <option value="league">League</option>
              <option value="club">Club</option>
            </select>
          </label>
          <label className="text-sm">
            Scope ID (for league/club)
            <input className="mt-1 w-full rounded-md border border-subtle bg-transparent p-2" value={scopeID} onChange={e => setScopeID(e.target.value)} placeholder="optional UUID" />
          </label>
          <label className="text-sm">
            Status filter
            <select className="mt-1 w-full rounded-md border border-subtle bg-transparent p-2" value={status} onChange={e => setStatus(e.target.value as (typeof statuses)[number])}>
              {statuses.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="space-y-3">
        {isLoading && <p className="text-sm text-muted">Loading feature requests…</p>}
        {!isLoading && items.length === 0 && <p className="text-sm text-muted">No visible feature requests for this scope yet.</p>}
        {items.map(item => (
          <article key={item.id} className="rounded-xl border border-subtle bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">{item.title}</h2>
                <p className="text-xs text-muted mt-1">Status: {item.status} · Scope: {item.scope_type}</p>
              </div>
              <FeatureRequestVoteButton featureRequestID={item.id} initialVoted={item.viewer_has_voted} initialCount={item.vote_count} />
            </div>
            {item.refined_description && <p className="mt-3 text-sm text-secondary whitespace-pre-wrap">{item.refined_description}</p>}
          </article>
        ))}
      </div>
    </div>
  )
}
