import { useState, useRef, useEffect } from 'react'
import { useParams, Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, RefreshCw, ChevronDown, ChevronRight, Plus, Check, X, Shield, Camera, Trash2 } from 'lucide-react'
import { leagueApi, LeagueConfig, League } from '../api/leagues'
import { useAuthStore } from '../store/auth'

const inputCls = 'w-full bg-surface border border-subtle rounded px-3 py-2.5 text-sm text-primary placeholder-muted focus:outline-none focus:border-[var(--brass)]/50 transition-colors'
const labelCls = 'text-[11px] tracking-widest uppercase text-muted'
const sectionCls = 'border border-subtle rounded bg-surface p-4 space-y-4'
const btnPrimary = 'bg-[var(--brass)] hover:opacity-90 disabled:opacity-50 text-inverse font-medium text-[11px] tracking-widest uppercase py-2.5 px-4 rounded transition-opacity'
const btnSecondary = 'border border-subtle hover:border-strong text-secondary hover:text-primary text-[11px] tracking-widest uppercase py-2 px-3 rounded transition-colors'

// ---------------------------------------------------------------------------
// League Image Section
// ---------------------------------------------------------------------------

function LeagueImageSection({ leagueId, league }: { leagueId: string; league: League }) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const mutation = useMutation({
    mutationFn: (file: File) => leagueApi.uploadImage(leagueId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId] })
    },
  })

  return (
    <div className={sectionCls}>
      <h2 className="text-[11px] tracking-widest uppercase text-muted">League Image</h2>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) {
            if (file.size > 5 * 1024 * 1024) {
              alert('Image must be under 5 MB')
            } else {
              mutation.mutate(file)
            }
          }
          e.target.value = ''
        }}
      />
      <div className="flex items-center gap-4">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={mutation.isPending}
          className="relative w-16 h-16 rounded-lg overflow-hidden border-2 border-subtle hover:border-[var(--brass)]/50 transition-colors disabled:opacity-50"
          aria-label="Upload league image"
        >
          {league.image_url ? (
            <img src={league.image_url} alt={league.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-surface-hover flex items-center justify-center">
              <Camera size={20} className="text-muted" />
            </div>
          )}
        </button>
        <div className="flex-1">
          <p className="text-sm text-secondary">
            {league.image_url ? 'Click to change image' : 'Add a profile picture for this league'}
          </p>
          <p className="text-[11px] text-muted">JPEG, PNG, or WebP. Max 5MB.</p>
          {mutation.isPending && <p className="text-[11px] text-muted mt-1">Uploading...</p>}
          {mutation.isError && <p className="text-[11px] text-[var(--error-text)] mt-1">{mutation.error instanceof Error ? mutation.error.message : 'Upload failed. Please try again.'}</p>}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Config Section
// ---------------------------------------------------------------------------

function ConfigSection({ leagueId, config }: { leagueId: string; config: LeagueConfig }) {
  const queryClient = useQueryClient()
  const [startsOn, setStartsOn] = useState(config.starts_on ?? '')
  const [endsOn, setEndsOn] = useState(config.ends_on ?? '')
  const [maxSubs, setMaxSubs] = useState(config.max_submissions_per_round)
  const [scoringRule, setScoringRule] = useState(config.scoring_rule)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const mutation = useMutation({
    mutationFn: (payload: Parameters<typeof leagueApi.updateConfig>[1]) =>
      leagueApi.updateConfig(leagueId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'config'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
    onError: () => setError('Failed to save.'),
  })

  function handleSave() {
    setError('')
    mutation.mutate({
      starts_on: startsOn || undefined,
      ends_on: endsOn || undefined,
      max_submissions_per_round: maxSubs,
      scoring_rule: scoringRule,
    })
  }

  return (
    <div className={sectionCls}>
      <h2 className="text-[11px] tracking-widest uppercase text-muted">General</h2>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className={labelCls}>Start Date</label>
          <input type="date" value={startsOn} onChange={e => setStartsOn(e.target.value)} className={inputCls} />
        </div>
        <div className="space-y-1.5">
          <label className={labelCls}>End Date</label>
          <input type="date" value={endsOn} onChange={e => setEndsOn(e.target.value)} className={inputCls} />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className={labelCls}>Max Submissions Per Round</label>
        <input type="number" min={1} value={maxSubs} onChange={e => setMaxSubs(Number(e.target.value))} className={inputCls} />
      </div>

      <div className="space-y-1.5">
        <label className={labelCls}>Scoring Rule</label>
        <div className="flex gap-2">
          {(['highest', 'average'] as const).map(rule => (
            <button
              key={rule}
              onClick={() => setScoringRule(rule)}
              className={[
                'flex-1 py-2 rounded text-[11px] tracking-widest uppercase font-medium transition-colors border',
                scoringRule === rule
                  ? 'bg-[var(--brass)]/15 border-[var(--brass)]/50 text-[var(--brass)]'
                  : 'bg-surface border-subtle text-muted hover:text-secondary',
              ].join(' ')}
            >
              {rule}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-red-400 text-xs">{error}</p>}
      {saved && <p className="text-green-400 text-xs">Saved</p>}

      <button onClick={handleSave} disabled={mutation.isPending} className={btnPrimary}>
        {mutation.isPending ? 'Saving...' : 'Save General'}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Join Policy Section
// ---------------------------------------------------------------------------

function JoinPolicySection({ leagueId, config, joinCode }: { leagueId: string; config: LeagueConfig; joinCode?: string }) {
  const queryClient = useQueryClient()
  const [joinPolicy, setJoinPolicy] = useState(config.join_policy)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const saveMutation = useMutation({
    mutationFn: () => leagueApi.updateConfig(leagueId, { join_policy: joinPolicy }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'config'] })
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
    onError: () => setError('Failed to save.'),
  })

  const regenMutation = useMutation({
    mutationFn: () => leagueApi.regenerateJoinCode(leagueId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId] })
    },
  })

  return (
    <div className={sectionCls}>
      <h2 className="text-[11px] tracking-widest uppercase text-muted">Join Policy</h2>

      <div className="space-y-2">
        {(['open', 'invite_code', 'approval'] as const).map(policy => (
          <button
            key={policy}
            onClick={() => setJoinPolicy(policy)}
            className={[
              'w-full text-left py-2.5 px-3 rounded text-sm transition-colors border',
              joinPolicy === policy
                ? 'bg-[var(--brass)]/15 border-[var(--brass)]/50 text-[var(--brass)]'
                : 'bg-surface border-subtle text-muted hover:text-secondary',
            ].join(' ')}
          >
            {policy === 'open' && 'Open - Anyone can join'}
            {policy === 'invite_code' && 'Invite Code - Requires code to join'}
            {policy === 'approval' && 'Approval - Requires admin approval'}
          </button>
        ))}
      </div>

      {joinPolicy === 'invite_code' && (
        <div className="flex items-center gap-2 bg-surface rounded p-3">
          <span className="text-[11px] tracking-widest uppercase text-muted">Code:</span>
          <code className="font-mono text-sm text-[var(--brass)] flex-1">{joinCode || '—'}</code>
          <button
            onClick={() => regenMutation.mutate()}
            disabled={regenMutation.isPending}
            className="text-muted hover:text-secondary transition-colors"
            title="Regenerate code"
          >
            <RefreshCw size={14} className={regenMutation.isPending ? 'animate-spin' : ''} />
          </button>
        </div>
      )}

      {error && <p className="text-red-400 text-xs">{error}</p>}
      {saved && <p className="text-green-400 text-xs">Saved</p>}

      <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className={btnPrimary}>
        {saveMutation.isPending ? 'Saving...' : 'Save Join Policy'}
      </button>

      {joinPolicy === 'approval' && <JoinRequestsList leagueId={leagueId} />}
    </div>
  )
}

function JoinRequestsList({ leagueId }: { leagueId: string }) {
  const queryClient = useQueryClient()

  const { data } = useQuery({
    queryKey: ['leagues', leagueId, 'join-requests', 'pending'],
    queryFn: () => leagueApi.listJoinRequests(leagueId, 'pending'),
  })

  const decideMutation = useMutation({
    mutationFn: ({ requestId, decision }: { requestId: string; decision: string }) =>
      leagueApi.decideJoinRequest(leagueId, requestId, decision),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'join-requests'] })
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'members'] })
    },
  })

  const requests = data?.items ?? []

  if (requests.length === 0) {
    return <p className="text-muted text-xs">No pending requests.</p>
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] tracking-widest uppercase text-muted">Pending Requests</p>
      {requests.map(jr => (
        <div key={jr.id} className="flex items-center justify-between bg-surface rounded p-2.5">
          <span className="text-sm text-secondary">{jr.display_name}</span>
          <div className="flex gap-1.5">
            <button
              onClick={() => decideMutation.mutate({ requestId: jr.id, decision: 'approved' })}
              className="p-1.5 rounded bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors"
              title="Approve"
            >
              <Check size={14} />
            </button>
            <button
              onClick={() => decideMutation.mutate({ requestId: jr.id, decision: 'rejected' })}
              className="p-1.5 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
              title="Reject"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Score Verification Section
// ---------------------------------------------------------------------------

function VerificationSection({ leagueId, config }: { leagueId: string; config: LeagueConfig }) {
  const queryClient = useQueryClient()
  const [requireVerification, setRequireVerification] = useState(config.require_score_verification)
  const [confirmations, setConfirmations] = useState(config.required_confirmations)
  const [requireImage, setRequireImage] = useState(config.require_image_upload)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const mutation = useMutation({
    mutationFn: () =>
      leagueApi.updateConfig(leagueId, {
        require_score_verification: requireVerification,
        required_confirmations: confirmations,
        require_image_upload: requireImage,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'config'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
    onError: () => setError('Failed to save.'),
  })

  return (
    <div className={sectionCls}>
      <h2 className="text-[11px] tracking-widest uppercase text-muted">Score Verification</h2>

      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={requireVerification}
          onChange={e => setRequireVerification(e.target.checked)}
          className="accent-[var(--brass)] w-4 h-4"
        />
        <span className="text-sm text-secondary">Require independent user confirmations</span>
      </label>

      {requireVerification && (
        <div className="space-y-1.5 pl-7">
          <label className={labelCls}>Number of Confirmations Required</label>
          <input
            type="number"
            min={1}
            value={confirmations}
            onChange={e => setConfirmations(Number(e.target.value))}
            className={inputCls}
          />
        </div>
      )}

      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={requireImage}
          onChange={e => setRequireImage(e.target.checked)}
          className="accent-[var(--brass)] w-4 h-4"
        />
        <span className="text-sm text-secondary">Require image upload with submissions</span>
      </label>

      {error && <p className="text-red-400 text-xs">{error}</p>}
      {saved && <p className="text-green-400 text-xs">Saved</p>}

      <button onClick={() => mutation.mutate()} disabled={mutation.isPending} className={btnPrimary}>
        {mutation.isPending ? 'Saving...' : 'Save Verification'}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Seasons Section
// ---------------------------------------------------------------------------

function SeasonsSection({ leagueId }: { leagueId: string }) {
  const queryClient = useQueryClient()
  const [showNew, setShowNew] = useState(false)
  const [name, setName] = useState('')
  const [startsOn, setStartsOn] = useState('')
  const [endsOn, setEndsOn] = useState('')
  const [expandedSeason, setExpandedSeason] = useState<string | null>(null)

  const { data } = useQuery({
    queryKey: ['leagues', leagueId, 'seasons'],
    queryFn: () => leagueApi.listSeasons(leagueId),
  })

  const createMutation = useMutation({
    mutationFn: () => leagueApi.createSeason(leagueId, { name, starts_on: startsOn, ends_on: endsOn || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'seasons'] })
      setShowNew(false)
      setName('')
      setStartsOn('')
      setEndsOn('')
    },
  })

  const seasons = data?.items ?? []

  return (
    <div className={sectionCls}>
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] tracking-widest uppercase text-muted">Seasons</h2>
        <button onClick={() => setShowNew(!showNew)} className="text-[var(--brass)] hover:text-[var(--brass)] transition-colors">
          <Plus size={16} />
        </button>
      </div>

      {showNew && (
        <div className="space-y-3 bg-surface rounded p-3">
          <input type="text" placeholder="Season name" value={name} onChange={e => setName(e.target.value)} className={inputCls} autoFocus />
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className={labelCls}>Start</label>
              <input type="date" value={startsOn} onChange={e => setStartsOn(e.target.value)} className={inputCls} />
            </div>
            <div className="space-y-1">
              <label className={labelCls}>End</label>
              <input type="date" value={endsOn} onChange={e => setEndsOn(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => createMutation.mutate()}
              disabled={!name.trim() || !startsOn || createMutation.isPending}
              className={btnPrimary}
            >
              {createMutation.isPending ? 'Creating...' : 'Add Season'}
            </button>
            <button onClick={() => setShowNew(false)} className={btnSecondary}>Cancel</button>
          </div>
        </div>
      )}

      {seasons.length === 0 && !showNew && (
        <p className="text-muted text-xs">No seasons yet.</p>
      )}

      {seasons.map(season => (
        <div key={season.id} className="border border-subtle rounded">
          <button
            onClick={() => setExpandedSeason(expandedSeason === season.id ? null : season.id)}
            className="w-full flex items-center justify-between p-3 text-left"
          >
            <div>
              <p className="text-sm text-secondary">{season.name}</p>
              <p className="text-[11px] text-muted">
                {season.starts_on}{season.ends_on ? ` — ${season.ends_on}` : ''}
                {season.is_active && <span className="ml-2 text-green-400">Active</span>}
              </p>
            </div>
            {expandedSeason === season.id ? <ChevronDown size={16} className="text-muted" /> : <ChevronRight size={16} className="text-muted" />}
          </button>
          {expandedSeason === season.id && (
            <RoundsSection leagueId={leagueId} seasonId={season.id} />
          )}
        </div>
      ))}
    </div>
  )
}

function RoundsSection({ leagueId, seasonId }: { leagueId: string; seasonId: string }) {
  const queryClient = useQueryClient()
  const [showNew, setShowNew] = useState(false)
  const [name, setName] = useState('')
  const [opensAt, setOpensAt] = useState('')
  const [closesAt, setClosesAt] = useState('')

  const { data } = useQuery({
    queryKey: ['leagues', leagueId, 'seasons', seasonId, 'rounds'],
    queryFn: () => leagueApi.listRounds(leagueId, seasonId),
  })

  const createMutation = useMutation({
    mutationFn: () =>
      leagueApi.createRound(leagueId, seasonId, {
        name,
        opens_at: opensAt || undefined,
        closes_at: closesAt || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'seasons', seasonId, 'rounds'] })
      setShowNew(false)
      setName('')
      setOpensAt('')
      setClosesAt('')
    },
  })

  const rounds = data?.items ?? []

  return (
    <div className="px-3 pb-3 space-y-2 border-t border-subtle">
      <div className="flex items-center justify-between pt-2">
        <p className="text-[11px] tracking-widest uppercase text-muted">Rounds</p>
        <button onClick={() => setShowNew(!showNew)} className="text-[var(--brass)] hover:text-[var(--brass)] transition-colors">
          <Plus size={14} />
        </button>
      </div>

      {showNew && (
        <div className="space-y-2 bg-surface rounded p-2.5">
          <input type="text" placeholder="Round name" value={name} onChange={e => setName(e.target.value)} className={inputCls} autoFocus />
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className={labelCls}>Opens</label>
              <input type="datetime-local" value={opensAt} onChange={e => setOpensAt(e.target.value)} className={inputCls} />
            </div>
            <div className="space-y-1">
              <label className={labelCls}>Closes</label>
              <input type="datetime-local" value={closesAt} onChange={e => setClosesAt(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => createMutation.mutate()}
              disabled={!name.trim() || createMutation.isPending}
              className={btnPrimary}
            >
              {createMutation.isPending ? 'Adding...' : 'Add Round'}
            </button>
            <button onClick={() => setShowNew(false)} className={btnSecondary}>Cancel</button>
          </div>
        </div>
      )}

      {rounds.length === 0 && !showNew && (
        <p className="text-muted text-xs">No rounds.</p>
      )}

      {rounds.map(round => (
        <div key={round.id} className="bg-surface rounded p-2.5">
          <p className="text-sm text-secondary">{round.name}</p>
          <p className="text-[11px] text-muted">
            {round.opens_at ? round.opens_at : 'No start'}
            {' — '}
            {round.closes_at ? round.closes_at : 'No end'}
          </p>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Members Section
// ---------------------------------------------------------------------------

function MembersSection({ leagueId, currentUserId }: { leagueId: string; currentUserId: string }) {
  const queryClient = useQueryClient()

  const { data } = useQuery({
    queryKey: ['leagues', leagueId, 'members'],
    queryFn: () => leagueApi.listMembers(leagueId),
  })

  const removeMutation = useMutation({
    mutationFn: (userId: string) => leagueApi.removeMember(leagueId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'members'] })
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'standings'] })
    },
  })

  const members = data?.items ?? []

  return (
    <div className={sectionCls}>
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] tracking-widest uppercase text-muted">Members</h2>
        <span className="text-[11px] text-muted font-mono">{members.length}</span>
      </div>

      {members.map(member => (
        <div key={member.user_id} className="flex items-center justify-between py-2 border-b border-subtle last:border-0">
          <div className="flex items-center gap-2">
            <span className="text-sm text-secondary">{member.display_name}</span>
            {member.is_admin && (
              <span className="inline-flex items-center gap-1 text-[10px] tracking-widest uppercase text-[var(--brass)] bg-[var(--brass-dim)] px-1.5 py-0.5 rounded">
                <Shield size={10} /> Admin
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-muted font-mono">
              {new Date(member.joined_at).toLocaleDateString()}
            </span>
            {!member.is_admin && member.user_id !== currentUserId && (
              <button
                onClick={() => removeMutation.mutate(member.user_id)}
                disabled={removeMutation.isPending}
                className="p-1 rounded text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                title="Remove member"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function LeagueSettings() {
  const { id } = useParams({ from: '/app/leagues/$id/settings' })
  const navigate = useNavigate()
  const currentUser = useAuthStore(s => s.user)

  const { data: league, isLoading: leagueLoading } = useQuery({
    queryKey: ['leagues', id],
    queryFn: () => leagueApi.get(id),
  })

  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ['leagues', id, 'config'],
    queryFn: () => leagueApi.getConfig(id),
  })

  const isLoading = leagueLoading || configLoading
  const isAdmin = !isLoading && league && currentUser ? league.created_by === currentUser.id : null

  useEffect(() => {
    if (isAdmin === false) {
      navigate({ to: '/leagues/$id', params: { id } })
    }
  }, [isAdmin, navigate, id])

  if (isLoading || isAdmin === null) {
    return (
      <div className="p-4 lg:p-8 space-y-4 max-w-lg lg:max-w-3xl mx-auto">
        <div className="h-6 w-40 bg-surface rounded animate-pulse" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-32 bg-surface rounded animate-pulse" />
        ))}
      </div>
    )
  }

  if (!league || !config) {
    return (
      <div className="p-4 text-center py-16">
        <p className="text-red-400 text-sm">League not found.</p>
        <Link to="/leagues" className="block mt-4 text-[11px] tracking-widest uppercase text-[var(--brass)]">Back</Link>
      </div>
    )
  }

  if (isAdmin === false) return null

  return (
    <div className="p-4 lg:p-8 space-y-4 lg:space-y-6 max-w-lg lg:max-w-3xl mx-auto pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/leagues/$id" params={{ id }} className="text-muted hover:text-secondary transition-colors">
          <ChevronLeft size={20} />
        </Link>
        <h1 className="text-lg font-medium tracking-widest uppercase text-secondary">Settings</h1>
      </div>

      <p className="text-xs text-muted">{league.name}</p>

      <LeagueImageSection leagueId={id} league={league} />
      <ConfigSection leagueId={id} config={config} />
      <JoinPolicySection leagueId={id} config={config} joinCode={league.join_code} />
      <VerificationSection leagueId={id} config={config} />
      <SeasonsSection leagueId={id} />
      <MembersSection leagueId={id} currentUserId={currentUser!.id} />
    </div>
  )
}
