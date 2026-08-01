import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Users, X, Trophy, Lock, MapPin, Navigation } from 'lucide-react'
import { clubsApi, type Club, type CreateClubInput } from '../api/clubs'
import { ApiError } from '../api/client'
import { HelpIcon } from '../components/Tooltip'
import { pageHelp } from '../components/tooltips'
import { useDebouncedEffect } from '../hooks/useDebouncedEffect'
import { requestPosition, type Coords } from '../utils/geolocation'
import { toast } from '../store/toast'
import {
  PageGrid,
  PageHeader,
  FilterRow,
  EmptyState,
  EntityCard,
  Badge,
} from '../components/leagues'
import { StatTile } from '../components/dashboard'

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
          <h2 id="new-club-modal-title" className="t-section-title">New Club</h2>
          <button onClick={onClose} aria-label="Close" className="text-muted hover:text-secondary transition-colors"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="t-section-title">Club Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Riverside Rifle Club" className="w-full bg-surface border border-subtle rounded px-3 py-2.5 text-sm text-primary placeholder-muted focus:outline-none focus:border-[var(--gold)]/50 transition-colors" autoFocus />
          </div>
          <div className="space-y-1.5">
            <label className="t-section-title">Description <span className="text-muted">(optional)</span></label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="A short description of your club" rows={2} className="w-full bg-surface border border-subtle rounded px-3 py-2.5 text-sm text-primary placeholder-muted focus:outline-none focus:border-[var(--gold)]/50 transition-colors resize-none" />
          </div>
          <div className="space-y-1.5">
            <label className="t-section-title">Visibility</label>
            <div className="flex gap-3">
              {(['public', 'private'] as const).map(value => (
                <button key={value} type="button" onClick={() => setType(value)} className={toggleCls(type === value)}>{value}</button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="t-section-title">How members join</label>
            <div className="space-y-1.5">
              {([
                { value: 'open' as const, label: 'Open', desc: 'Anyone can join' },
                { value: 'invite_code' as const, label: 'Invite Code', desc: 'Requires a code to join' },
                { value: 'approval' as const, label: 'Approval', desc: 'Moderators must approve requests' },
              ]).map(opt => (
                <button key={opt.value} type="button" onClick={() => setJoinPolicy(opt.value)} className={`w-full text-left px-3 py-2 rounded border text-sm transition-colors ${joinPolicy === opt.value ? 'border-[var(--gold)]/50 bg-[var(--gold-tint)] text-[var(--gold)]' : 'border-subtle text-muted hover:text-secondary'}`}>
                  <span className="text-[11px] tracking-widest uppercase font-medium">{opt.label}</span>
                  <span className="text-[10px] text-muted ml-2">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>
          {error && <p className="text-[var(--error-text)] text-xs">{error}</p>}
          <button type="submit" disabled={mutation.isPending} className="w-full btn-brass disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-[11px] tracking-widest uppercase py-3 rounded transition-all">
            {mutation.isPending ? 'Creating…' : 'Create Club'}
          </button>
        </form>
      </div>
    </div>
  )
}

/** Chip values for the discipline filter; `all` clears it. */
const DISCIPLINE_CHIPS = [
  { value: 'all', label: 'All' },
  { value: 'air rifle', label: 'Air Rifle' },
  { value: 'air pistol', label: 'Air Pistol' },
  { value: 'benchrest', label: 'Benchrest' },
  { value: 'field target', label: 'Field Target' },
  { value: 'hunter field target', label: 'HFT' },
  { value: 'rimfire', label: 'Rimfire' },
  { value: 'smallbore', label: 'Smallbore' },
  { value: 'fullbore', label: 'Fullbore' },
] as const

type DisciplineChip = (typeof DISCIPLINE_CHIPS)[number]['value']

/** Radius applied when a viewer asks for clubs near them. */
const NEAR_ME_RADIUS_KM = 80

export default function Clubs() {
  const [showCreate, setShowCreate] = useState(false)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [code, setCode] = useState('')
  const [discipline, setDiscipline] = useState<DisciplineChip>('all')
  const [coords, setCoords] = useState<Coords | null>(null)
  const [locating, setLocating] = useState(false)

  // Search now runs server-side so town, region and postcode match too — debounce
  // so a keystroke doesn't become a request.
  useDebouncedEffect(() => setDebouncedSearch(search), [search], 300)

  function handleSearch(v: string) {
    setSearch(v)
    if (code) setCode('')
  }

  function handleCodeSubmit() {
    const next = search.trim().toUpperCase()
    if (next) setCode(next)
  }

  function clearCode() {
    setSearch('')
    setCode('')
  }

  async function toggleNearMe() {
    if (coords) { setCoords(null); return }
    setLocating(true)
    try {
      setCoords(await requestPosition())
    } catch {
      toast('Could not get your location — check location permissions.', 'error')
    } finally {
      setLocating(false)
    }
  }

  const { data, isLoading, isError } = useQuery({
    queryKey: ['clubs', code || null, debouncedSearch, discipline, coords],
    queryFn: () => clubsApi.list(code
      ? { code }
      : {
          q: debouncedSearch,
          discipline: discipline === 'all' ? undefined : discipline,
          lat: coords?.lat,
          lng: coords?.lng,
          radiusKm: coords ? NEAR_ME_RADIUS_KM : undefined,
        }),
  })

  const filtered: Club[] = useMemo(() => data?.items ?? [], [data])

  const stats = useMemo(() => {
    const all = data?.items ?? []
    const mine = all.filter((c) => c.is_member)
    return {
      mine: mine.length,
      fellowMembers: mine.reduce((s, c) => s + c.member_count, 0),
      leagues: mine.reduce((s, c) => s + c.league_count, 0),
      directory: all.length,
    }
  }, [data])

  return (
    <PageGrid>
      <PageHeader
        title="Clubs"
        info={<HelpIcon content={pageHelp.clubs} />}
        description="Find your shooting community. Share scores. Connect with members."
        action={<button className="lc-action-ghost" onClick={() => setShowCreate(true)}><Plus size={14} /> New</button>}
      />

      <div className="lc-stack">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile
            label="Member Of"
            value={String(stats.mine)}
            sub={stats.mine === 0 ? 'no clubs yet' : `${stats.mine} club${stats.mine !== 1 ? 's' : ''}`}
          />
          <StatTile label="Fellow Members" value={String(stats.fellowMembers)} sub="across your clubs" />
          <StatTile label="Club Leagues" value={String(stats.leagues)} sub="in your clubs" />
          <StatTile
            label="In Directory"
            value={String(stats.directory)}
            sub={coords ? `within ${NEAR_ME_RADIUS_KM} km` : 'clubs you can browse'}
          />
        </div>
        <FilterRow
          search={search}
          onSearch={handleSearch}
          onSubmit={handleCodeSubmit}
          placeholder="Search name, town, postcode or code…"
          chips={DISCIPLINE_CHIPS.map((c) => ({ value: c.value, label: c.label }))}
          activeChip={discipline}
          onChip={(v) => setDiscipline(v)}
        />

        <button
          type="button"
          onClick={toggleNearMe}
          disabled={locating}
          className="lc-action-ghost self-start"
          style={coords ? { background: 'var(--gold)', color: 'white' } : undefined}
        >
          <MapPin size={12} />
          {locating ? 'Locating…' : coords ? `Near me · ${NEAR_ME_RADIUS_KM} km` : 'Near me'}
        </button>

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
              const place = [club.city, club.region].filter(Boolean).join(', ')
              const meta = [
                { icon: <Users size={12} />, text: `${club.member_count} member${club.member_count !== 1 ? 's' : ''}` },
                ...(club.league_count > 0 ? [{ icon: <Trophy size={12} />, text: `${club.league_count} league${club.league_count !== 1 ? 's' : ''}` }] : []),
                ...(place ? [{ icon: <MapPin size={12} />, text: place }] : []),
                ...(club.distance_km != null ? [{ icon: <Navigation size={12} />, text: `${club.distance_km.toFixed(1)} km away` }] : []),
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
