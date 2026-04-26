import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Users, Lock, Trophy, X, FileText, KeyRound } from 'lucide-react'
import { leagueApi, CreateLeaguePayload, MyLeagueSummary, type League } from '../api/leagues'
import { useAuthStore } from '../store/auth'
import { toast } from '../store/toast'
import { HelpIcon } from '../components/Tooltip'
import { pageHelp } from '../components/tooltips'
import {
  PageGrid,
  PageHeader,
  FilterRow,
  EmptyState,
  EntityCard,
  Badge,
  VisibilityDot,
} from '../components/leagues'
import { StatTile } from '../components/dashboard'

type Filter = 'all' | 'active' | 'joined' | 'owned' | 'closed'

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
        ? 'border-[var(--gold)]/50 bg-[var(--gold-tint)] text-[var(--gold)]'
        : 'border-subtle text-muted hover:text-secondary'
    }`

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-[var(--overlay-bg)] backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-card border border-subtle rounded-t-2xl sm:rounded-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="new-league-modal-title">
        <div className="flex items-center justify-between">
          <h2 id="new-league-modal-title" className="t-section-title">New League</h2>
          <button onClick={onClose} className="text-muted hover:text-secondary transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="t-section-title">Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Club Winter Series 2026"
              className="w-full bg-surface border border-subtle rounded px-3 py-2.5 text-sm text-primary placeholder-muted focus:outline-none focus:border-[var(--gold)]/50 transition-colors"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <label className="t-section-title">Description <span className="text-muted">(optional)</span></label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What's this league for?"
              rows={2}
              className="w-full bg-surface border border-subtle rounded px-3 py-2.5 text-sm text-primary placeholder-muted focus:outline-none focus:border-[var(--gold)]/50 transition-colors resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="t-section-title">Visibility</label>
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
            <label className="t-section-title">Standings</label>
            <div className="flex gap-3">
              {(['highest', 'average'] as const).map((opt) => (
                <button key={opt} type="button" onClick={() => setScoringRule(opt)} className={toggleCls(scoringRule === opt)}>
                  {opt === 'highest' ? 'Best Score' : 'Average'}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="t-section-title">How members join</label>
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
                      ? 'border-[var(--gold)]/50 bg-[var(--gold-tint)] text-[var(--gold)]'
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
            className="w-full bg-[var(--gold)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-[11px] tracking-widest uppercase py-3 rounded transition-opacity"
          >
            {mutation.isPending ? 'Creating…' : 'Create League'}
          </button>
        </form>
      </div>
    </div>
  )
}

function shortCode(joinCode?: string): string {
  if (!joinCode) return ''
  return joinCode.slice(0, 4).toUpperCase()
}

export default function Leagues() {
  const [showCreate, setShowCreate] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [codeInput, setCodeInput] = useState('')
  const [code, setCode] = useState('')
  const user = useAuthStore((s) => s.user)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['leagues', code || null],
    queryFn: () => leagueApi.list(code ? { code } : undefined),
  })

  function applyCode(e: React.FormEvent) {
    e.preventDefault()
    const next = codeInput.trim().toUpperCase()
    setCode(next)
  }

  function clearCode() {
    setCodeInput('')
    setCode('')
  }

  const { data: myLeagues } = useQuery({
    queryKey: ['my-leagues'],
    queryFn: () => leagueApi.listMine(),
    enabled: !!user,
  })

  const myLeagueMap = useMemo(
    () => new Map<string, MyLeagueSummary>((myLeagues?.items ?? []).map((l) => [l.id, l])),
    [myLeagues],
  )

  const filtered: League[] = useMemo(() => {
    const all = data?.items ?? []
    if (code) return all
    const q = search.trim().toLowerCase()
    return all.filter((l) => {
      if (q && !l.name.toLowerCase().includes(q)) return false
      const isJoined = myLeagueMap.has(l.id)
      const isOwned = user?.id === l.created_by
      switch (filter) {
        case 'all': return true
        case 'active': return true
        case 'joined': return isJoined
        case 'owned': return isOwned
        case 'closed': return false
        default: return true
      }
    })
  }, [data, filter, search, code, myLeagueMap, user])

  const stats = useMemo(() => {
    const joined = myLeagues?.items?.length ?? 0
    const bestRank = (myLeagues?.items ?? []).reduce(
      (acc, l) => (l.user_rank > 0 && (acc === 0 || l.user_rank < acc) ? l.user_rank : acc),
      0,
    )
    const bestRankLeague = (myLeagues?.items ?? []).find((l) => l.user_rank === bestRank && bestRank > 0)
    const available = data?.items?.length ?? 0
    const owned = (data?.items ?? []).filter((l) => l.created_by === user?.id).length
    return {
      joined,
      bestRank,
      bestRankLeague,
      available,
      owned,
    }
  }, [myLeagues, data, user])

  return (
    <PageGrid>
      <PageHeader
        title="Leagues"
        info={<HelpIcon content={pageHelp.leagues} />}
        description="Compete in seasonal contests. Submit scores. Chase the leaderboard."
        action={
          <button className="lc-action-ghost" onClick={() => setShowCreate(true)}>
            <Plus size={14} /> New
          </button>
        }
      />

      <div className="lc-stack">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile
            label="Joined"
            value={String(stats.joined)}
            sub={stats.joined > 0 ? `across ${stats.joined} league${stats.joined !== 1 ? 's' : ''}` : 'none yet'}
          />
          <StatTile
            label="Best Position"
            value={stats.bestRank > 0 ? String(stats.bestRank) : '—'}
            unit={stats.bestRank > 0 ? <sup style={{ fontSize: 11 }}>{ordinalSuffix(stats.bestRank)}</sup> : undefined}
            sub={stats.bestRankLeague?.name}
          />
          <StatTile label="Available" value={String(stats.available)} sub="leagues" />
          <StatTile label="Owned" value={String(stats.owned)} sub="created by you" />
        </div>
        <FilterRow<Filter>
          search={search}
          onSearch={setSearch}
          placeholder="Search leagues…"
          chips={[
            { value: 'all', label: 'All' },
            { value: 'active', label: 'Active' },
            { value: 'joined', label: 'Joined' },
            { value: 'owned', label: 'Owned' },
            { value: 'closed', label: 'Closed' },
          ]}
          activeChip={filter}
          onChip={setFilter}
        />

        <form onSubmit={applyCode} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <KeyRound size={14} style={{ position: 'absolute', top: '50%', left: 10, transform: 'translateY(-50%)', color: 'var(--muted)' }} />
            <input
              type="text"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              placeholder="Find league by code"
              className="font-mono"
              style={{ width: '100%', background: 'var(--lc-surface)', border: '1px solid var(--line)', borderRadius: 6, color: 'var(--ink)', fontSize: 13, padding: '8px 10px 8px 32px', textTransform: 'uppercase' }}
              aria-label="Find league by code"
            />
          </div>
          <button
            type="submit"
            disabled={!codeInput.trim() || codeInput.trim().toUpperCase() === code}
            className="lc-action-ghost"
          >
            Find
          </button>
        </form>

        {code && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--muted)' }}>
            <span>Showing match for code</span>
            <button
              type="button"
              onClick={clearCode}
              className="lc-code-chip"
              style={{ background: 'transparent', border: '1px solid var(--line)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--ink)' }}
              title="Clear code"
            >
              <span className="lc-code-label">CODE</span>
              {code}
              <X size={11} />
            </button>
          </div>
        )}

        {isLoading && (
          <div className="lc-stack" aria-busy>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} style={{ height: 88, borderRadius: 'var(--radius-lg)', background: 'var(--lc-surface)', border: '1px solid var(--line)', opacity: 0.6 }} />
            ))}
          </div>
        )}

        {isError && <p style={{ color: 'var(--red)' }}>Failed to load leagues.</p>}

        {data && filtered.length === 0 && (
          <EmptyState
            icon={<Trophy size={42} />}
            title={code ? 'No league with that code' : 'No leagues here'}
            body={code ? 'Double-check the code and try again.' : (search || filter !== 'all' ? 'Try a different search or filter.' : 'Create the first league to get started.')}
            cta={code ? (
              <button className="lc-action-ghost" onClick={clearCode}>
                <X size={14} /> Clear code
              </button>
            ) : (
              <button className="lc-action-ghost" onClick={() => setShowCreate(true)}>
                <Plus size={14} /> New league
              </button>
            )}
          />
        )}

        {data && filtered.length > 0 && (
          <div className="lc-stack">
            {filtered.map((league) => {
              const myInfo = myLeagueMap.get(league.id)
              const visibility = league.type === 'private' ? 'private' : 'public'
              const code = shortCode(league.join_code)
              const meta = [
                { icon: <Users size={12} />, text: `${league.member_count} shooter${league.member_count !== 1 ? 's' : ''}` },
                { icon: <FileText size={12} />, text: `${league.member_count > 0 ? '—' : '0'} cards` },
                { icon: <VisibilityDot visibility={visibility} />, text: visibility },
                ...(code ? [{ icon: null, text: <span className="lc-code-chip"><span className="lc-code-label">CODE</span>{code}</span> }] : []),
              ]
              return (
                <EntityCard
                  key={league.id}
                  to="/leagues/$id"
                  toParams={{ id: league.id }}
                  thumbImage={league.image_url}
                  name={league.name}
                  badges={
                    <>
                      {visibility === 'private' && <Badge variant="neutral"><Lock size={10} /> Private</Badge>}
                    </>
                  }
                  meta={meta}
                  rightRail={myInfo && myInfo.user_rank > 0 ? 'rank' : 'chevron'}
                  rank={myInfo && myInfo.user_rank > 0 ? {
                    position: myInfo.user_rank,
                    total: league.member_count,
                  } : null}
                />
              )
            })}
          </div>
        )}
      </div>

      {showCreate && <CreateLeagueModal onClose={() => setShowCreate(false)} />}
    </PageGrid>
  )
}

function ordinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return s[(v - 20) % 10] || s[v] || s[0]
}
