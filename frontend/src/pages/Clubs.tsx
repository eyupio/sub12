import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Users, X, Trophy, Lock, KeyRound } from 'lucide-react'
import { clubsApi, type Club, type CreateClubInput } from '../api/clubs'
import { ApiError } from '../api/client'
import { HelpIcon } from '../components/Tooltip'
import { pageHelp } from '../components/tooltips'
import { toast } from '../store/toast'
import {
  PageGrid,
  PageHeader,
  StatsStrip,
  FilterRow,
  EmptyState,
  EntityCard,
  Badge,
  type StatCell,
} from '../components/leagues'

function CreateClubModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<'public' | 'private'>('public')
  const [joinPolicy, setJoinPolicy] = useState<'open' | 'invite_code' | 'approval'>('open')
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: (input: CreateClubInput) => clubsApi.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clubs'] })
      toast('Club created', 'success')
      onClose()
    },
    onError: (err: unknown) => {
      const msg = err instanceof ApiError && err.message ? err.message : 'Failed to create club. Please try again.'
      setError(msg)
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!name.trim()) { setError('Name is required'); return }
    mutation.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
      type,
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
      <div role="dialog" aria-modal="true" aria-labelledby="new-club-modal-title" className="relative w-full sm:max-w-md bg-card border border-subtle rounded-t-2xl sm:rounded-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 id="new-club-modal-title" className="text-sm tracking-widest uppercase text-secondary">New Club</h2>
          <button onClick={onClose} className="text-muted hover:text-secondary transition-colors"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[11px] tracking-widest uppercase text-muted">Club Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Riverside Rifle Club" className="w-full bg-surface border border-subtle rounded px-3 py-2.5 text-sm text-primary placeholder-muted focus:outline-none focus:border-[var(--gold)]/50 transition-colors" autoFocus />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] tracking-widest uppercase text-muted">Description <span className="text-muted">(optional)</span></label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="A short description of your club" rows={2} className="w-full bg-surface border border-subtle rounded px-3 py-2.5 text-sm text-primary placeholder-muted focus:outline-none focus:border-[var(--gold)]/50 transition-colors resize-none" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] tracking-widest uppercase text-muted">Visibility</label>
            <div className="flex gap-3">
              {(['public', 'private'] as const).map(value => (
                <button key={value} type="button" onClick={() => setType(value)} className={toggleCls(type === value)}>{value}</button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] tracking-widest uppercase text-muted">How members join</label>
            <div className="space-y-1.5">
              {([
                { value: 'open' as const, label: 'Open', desc: 'Anyone can join' },
                { value: 'invite_code' as const, label: 'Invite Code', desc: 'Requires a code to join' },
                { value: 'approval' as const, label: 'Approval', desc: 'Admin must approve requests' },
              ]).map(opt => (
                <button key={opt.value} type="button" onClick={() => setJoinPolicy(opt.value)} className={`w-full text-left px-3 py-2 rounded border text-sm transition-colors ${joinPolicy === opt.value ? 'border-[var(--gold)]/50 bg-[var(--gold-tint)] text-[var(--gold)]' : 'border-subtle text-muted hover:text-secondary'}`}>
                  <span className="text-[11px] tracking-widest uppercase font-medium">{opt.label}</span>
                  <span className="text-[10px] text-muted ml-2">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>
          {error && <p className="text-[var(--error-text)] text-xs">{error}</p>}
          <button type="submit" disabled={mutation.isPending} className="w-full bg-[var(--gold)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-[11px] tracking-widest uppercase py-3 rounded transition-opacity">
            {mutation.isPending ? 'Creating…' : 'Create Club'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function Clubs() {
  const [showCreate, setShowCreate] = useState(false)
  const [search, setSearch] = useState('')
  const [codeInput, setCodeInput] = useState('')
  const [code, setCode] = useState('')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['clubs', code || null],
    queryFn: () => clubsApi.list(code ? { code } : undefined),
  })

  function applyCode(e: React.FormEvent) {
    e.preventDefault()
    setCode(codeInput.trim().toUpperCase())
  }

  function clearCode() {
    setCodeInput('')
    setCode('')
  }

  const filtered: Club[] = useMemo(() => {
    const all = data?.items ?? []
    if (code) return all
    const q = search.trim().toLowerCase()
    if (!q) return all
    return all.filter((c) => c.name.toLowerCase().includes(q) || (c.description ?? '').toLowerCase().includes(q))
  }, [data, search, code])

  const stats: StatCell[] = useMemo(() => {
    const total = data?.items?.length ?? 0
    const totalMembers = (data?.items ?? []).reduce((s, c) => s + c.member_count, 0)
    const totalLeagues = (data?.items ?? []).reduce((s, c) => s + (c.league_count ?? 0), 0)
    return [
      { label: 'Member Of', value: total, sub: total === 0 ? 'no clubs yet' : `${total} club${total !== 1 ? 's' : ''}` },
      { label: 'Total Shooters', value: totalMembers, sub: 'across your clubs' },
      { label: 'Active Leagues', value: totalLeagues, sub: 'in your clubs' },
      { label: 'Top Card', value: '—', sub: 'best across clubs' },
    ]
  }, [data])

  return (
    <PageGrid>
      <PageHeader
        title="Clubs"
        info={<HelpIcon content={pageHelp.clubs} />}
        action={<button className="lc-action-ghost" onClick={() => setShowCreate(true)}><Plus size={14} /> New</button>}
      />

      <div className="lc-stack">
        <StatsStrip cells={stats} />
        <FilterRow search={search} onSearch={setSearch} placeholder="Search clubs…" />

        <form onSubmit={applyCode} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <KeyRound size={14} style={{ position: 'absolute', top: '50%', left: 10, transform: 'translateY(-50%)', color: 'var(--muted)' }} />
            <input
              type="text"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              placeholder="Find club by code"
              className="font-mono"
              style={{ width: '100%', background: 'var(--lc-surface)', border: '1px solid var(--line)', borderRadius: 6, color: 'var(--ink)', fontSize: 13, padding: '8px 10px 8px 32px', textTransform: 'uppercase' }}
              aria-label="Find club by code"
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

        {isError && <p style={{ color: 'var(--red)' }}>Failed to load clubs.</p>}

        {data && filtered.length === 0 && (
          <EmptyState
            icon={<Trophy size={42} />}
            title={code ? 'No club with that code' : 'No clubs here'}
            body={code ? 'Double-check the code and try again.' : (search ? 'Try a different search.' : 'Create the first club to get started.')}
            cta={code
              ? <button className="lc-action-ghost" onClick={clearCode}><X size={14} /> Clear code</button>
              : <button className="lc-action-ghost" onClick={() => setShowCreate(true)}><Plus size={14} /> New club</button>}
          />
        )}

        {data && filtered.length > 0 && (
          <div className="lc-stack">
            {filtered.map((club) => {
              const isPrivate = club.type === 'private'
              const meta = [
                { icon: <Users size={12} />, text: `${club.member_count} member${club.member_count !== 1 ? 's' : ''}` },
                ...(club.league_count != null ? [{ icon: <Trophy size={12} />, text: `${club.league_count} league${club.league_count !== 1 ? 's' : ''}` }] : []),
              ]
              return (
                <EntityCard
                  key={club.id}
                  to="/clubs/$id"
                  toParams={{ id: club.id }}
                  thumbImage={club.image_url}
                  thumbIcon={<Users size={24} />}
                  name={club.name}
                  badges={isPrivate ? <Badge variant="neutral"><Lock size={10} /> Private</Badge> : null}
                  meta={[
                    ...meta,
                    ...(club.description ? [{ icon: null, text: <span style={{ color: 'var(--muted-2)' }}>{club.description}</span> }] : []),
                  ]}
                  rightRail="chevron"
                />
              )
            })}
          </div>
        )}
      </div>

      {showCreate && <CreateClubModal onClose={() => setShowCreate(false)} />}
    </PageGrid>
  )
}
