import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Users, ChevronRight, X } from 'lucide-react'
import { leagueApi, CreateLeaguePayload, MyLeagueSummary } from '../api/leagues'
import { useAuthStore } from '../store/auth'
import { toast } from '../store/toast'
import { HelpIcon } from '../components/Tooltip'
import { pageHelp } from '../components/tooltips'

function CreateLeagueModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<'public' | 'private'>('public')
  const [scoringRule, setScoringRule] = useState<'highest' | 'average'>('highest')
  const [joinPolicy, setJoinPolicy] = useState<'open' | 'invite_code' | 'approval'>('open')
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: (payload: CreateLeaguePayload) => leagueApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leagues'] })
      toast('League created', 'success')
      onClose()
    },
    onError: () => setError('Failed to create league. Please try again.'),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!name.trim()) { setError('Name is required'); return }
    mutation.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
      type,
      scoring_rule: scoringRule,
      join_policy: joinPolicy,
    })
  }

  const toggleCls = (active: boolean) =>
    `flex-1 py-2 rounded border text-[11px] tracking-widest uppercase transition-colors ${
      active
        ? 'border-[var(--brass)]/50 bg-[var(--brass)]/10 text-[var(--brass)]'
        : 'border-subtle text-muted hover:text-secondary'
    }`

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-[var(--overlay-bg)] backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-card border border-subtle rounded-t-2xl sm:rounded-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto" role="dialog" aria-modal="true">
        <div className="flex items-center justify-between">
          <h2 className="text-sm tracking-widest uppercase text-secondary">New League</h2>
          <button onClick={onClose} className="text-muted hover:text-secondary transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[11px] tracking-widest uppercase text-muted">Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Club Winter Series 2026"
              className="w-full bg-surface border border-subtle rounded px-3 py-2.5 text-sm text-primary placeholder-muted focus:outline-none focus:border-[var(--brass)]/50 transition-colors"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] tracking-widest uppercase text-muted">Description <span className="text-muted">(optional)</span></label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What's this league for?"
              rows={2}
              className="w-full bg-surface border border-subtle rounded px-3 py-2.5 text-sm text-primary placeholder-muted focus:outline-none focus:border-[var(--brass)]/50 transition-colors resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] tracking-widest uppercase text-muted">Visibility</label>
            <div className="flex gap-3">
              {(['public', 'private'] as const).map((opt) => (
                <button key={opt} type="button" onClick={() => setType(opt)} className={toggleCls(type === opt)}>
                  {opt}
                </button>
              ))}
            </div>
            {type === 'private' && (
              <p className="text-[10px] text-muted">An invite code will be generated after creation.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] tracking-widest uppercase text-muted">Standings</label>
            <div className="flex gap-3">
              {(['highest', 'average'] as const).map((opt) => (
                <button key={opt} type="button" onClick={() => setScoringRule(opt)} className={toggleCls(scoringRule === opt)}>
                  {opt === 'highest' ? 'Best Score' : 'Average'}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted">
              {scoringRule === 'highest' ? 'Rank members by their single best score.' : 'Rank members by their average across all scores.'}
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] tracking-widest uppercase text-muted">How members join</label>
            <div className="space-y-1.5">
              {([
                { value: 'open' as const, label: 'Open', desc: 'Anyone can join' },
                { value: 'invite_code' as const, label: 'Invite Code', desc: 'Requires a code to join' },
                { value: 'approval' as const, label: 'Approval', desc: 'Admin must approve requests' },
              ]).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setJoinPolicy(opt.value)}
                  className={`w-full text-left px-3 py-2 rounded border text-sm transition-colors ${
                    joinPolicy === opt.value
                      ? 'border-[var(--brass)]/50 bg-[var(--brass)]/10 text-[var(--brass)]'
                      : 'border-subtle text-muted hover:text-secondary'
                  }`}
                >
                  <span className="text-[11px] tracking-widest uppercase font-medium">{opt.label}</span>
                  <span className="text-[10px] text-muted ml-2">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-[var(--error-text)] text-xs">{error}</p>}

          <button
            type="submit"
            disabled={mutation.isPending}
            className="w-full bg-[var(--brass)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-inverse font-medium text-[11px] tracking-widest uppercase py-3 rounded transition-opacity"
          >
            {mutation.isPending ? 'Creating…' : 'Create League'}
          </button>
        </form>
      </div>
    </div>
  )
}

function ordinal(n: number): string {
  if (n <= 0) return '—'
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function LeagueRow({ league, myLeague }: { league: import('../api/leagues').League; myLeague?: MyLeagueSummary }) {
  return (
    <Link
      to="/leagues/$id"
      params={{ id: league.id }}
      className="flex items-center gap-3 p-3 lg:p-4 rounded border border-subtle bg-surface hover:border-[var(--brass)]/30 transition-colors"
    >
      {league.image_url ? (
        <img
          src={league.image_url}
          alt={league.name}
          className="w-9 h-9 rounded-lg object-cover border border-subtle shrink-0"
        />
      ) : (
        <div className="w-9 h-9 rounded-lg border border-subtle shrink-0 bg-surface-hover flex items-center justify-center">
          <Users size={16} className="text-muted opacity-40" />
        </div>
      )}
      <div className="space-y-0.5 min-w-0 flex-1">
        <p className="text-sm text-secondary font-medium truncate">{league.name}</p>
        {league.description && (
          <p className="text-[11px] text-muted truncate">{league.description}</p>
        )}
        <div className="flex items-center gap-1 text-muted">
          <Users size={10} />
          <span className="text-[11px]">{league.member_count}</span>
        </div>
      </div>
      <div className="flex items-center gap-3 ml-3 shrink-0">
        {myLeague && myLeague.user_rank > 0 ? (
          <div className="text-right font-mono">
            <span className="text-sm text-primary">{ordinal(myLeague.user_rank)}</span>
            <span className="text-[11px] text-muted ml-0.5">/{league.member_count}</span>
            {league.member_count >= 5 && (
              <p className="text-[10px] text-muted mt-0.5">top {Math.round((myLeague.user_rank / league.member_count) * 100)}%</p>
            )}
          </div>
        ) : (
          <ChevronRight size={16} className="text-muted" />
        )}
      </div>
    </Link>
  )
}

export default function Leagues() {
  const [showCreate, setShowCreate] = useState(false)
  const user = useAuthStore((s) => s.user)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['leagues'],
    queryFn: () => leagueApi.list(),
  })

  const { data: myLeagues } = useQuery({
    queryKey: ['my-leagues'],
    queryFn: () => leagueApi.listMine(),
    enabled: !!user,
  })

  const myLeagueMap = new Map(
    myLeagues?.items?.map((l) => [l.id, l]) ?? [],
  )

  return (
    <>
      <div className="p-4 lg:p-8 space-y-4 lg:space-y-6 max-w-lg lg:max-w-4xl xl:max-w-5xl mx-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-xl lg:text-2xl font-medium tracking-widest uppercase text-secondary">Leagues</h1>
            <HelpIcon content={pageHelp.leagues} />
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 text-[11px] tracking-widest uppercase text-[var(--brass)] hover:opacity-80 transition-opacity"
          >
            <Plus size={14} />
            New
          </button>
        </div>

        {isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-14 rounded border border-subtle bg-surface animate-pulse" />
            ))}
          </div>
        )}

        {isError && (
          <p className="text-[var(--error-text)] text-sm">Failed to load leagues.</p>
        )}

        {data && data.items.length === 0 && (
          <div className="text-center py-16 space-y-3">
            <p className="text-muted text-sm tracking-widest uppercase">No leagues yet</p>
            <button
              onClick={() => setShowCreate(true)}
              className="inline-block text-[11px] tracking-widest uppercase text-[var(--brass)] hover:opacity-80 transition-opacity"
            >
              Create the first one →
            </button>
          </div>
        )}

        {data && data.items.length > 0 && (
          <div className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
            {data.items.map(league => (
              <LeagueRow key={league.id} league={league} myLeague={myLeagueMap.get(league.id)} />
            ))}
          </div>
        )}
      </div>

      {showCreate && <CreateLeagueModal onClose={() => setShowCreate(false)} />}
    </>
  )
}
