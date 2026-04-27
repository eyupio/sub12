import { useState, useRef, useEffect } from 'react'
import { useParams, Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, RefreshCw, Check, X, Shield, Camera, Trash2, Flag } from 'lucide-react'
import { leagueApi, LeagueConfig, League, LeagueMember } from '../api/leagues'
import { useAuthStore } from '../store/auth'
import { toast } from '../store/toast'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { DATE_FORMAT_OPTIONS, DEFAULT_PREFS, formatDate, useRegionalPrefs, type DateFormat, type TimeFormat } from '../utils/date'

const TIMEZONES: string[] = (() => {
  const fn = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf
  if (typeof fn === 'function') return fn('timeZone')
  return ['Europe/London', 'Europe/Dublin', 'Europe/Paris', 'America/New_York', 'America/Los_Angeles', 'Australia/Sydney', 'UTC']
})()

const inputCls = 'w-full bg-surface border border-subtle rounded px-3 py-2.5 text-sm text-primary placeholder-muted focus:outline-none focus:border-[var(--brass)]/50 transition-colors'
const labelCls = 't-section-title'
const sectionCls = 'border border-subtle rounded bg-surface p-4 space-y-4'
const btnPrimary = 'bg-[var(--brass)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-inverse font-medium text-[11px] tracking-widest uppercase py-2.5 px-4 rounded transition-opacity'

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
      toast('League image updated', 'success')
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Failed to upload image', 'error'),
  })

  return (
    <div className={sectionCls}>
      <h2 className="t-section-title">League Image</h2>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) {
            if (file.size > 5 * 1024 * 1024) {
              toast('Image must be under 5 MB', 'error')
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
          className="relative w-16 h-16 rounded-lg overflow-hidden border-2 border-subtle hover:border-[var(--brass)]/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
          {mutation.isPending && <p className="text-[11px] text-muted mt-1">Uploading…</p>}
          {mutation.isError && <p className="text-[11px] text-[var(--error-text)] mt-1">{mutation.error instanceof Error ? mutation.error.message : 'Upload failed. Please try again.'}</p>}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// General Info Section
// ---------------------------------------------------------------------------

function GeneralInfoSection({ leagueId, league }: { leagueId: string; league: League }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(league.name)
  const [description, setDescription] = useState(league.description ?? '')

  const mutation = useMutation({
    mutationFn: (input: { name?: string; description?: string }) =>
      leagueApi.update(leagueId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId] })
      queryClient.invalidateQueries({ queryKey: ['leagues'] })
      toast('League saved', 'success')
    },
    onError: () => toast('Failed to save league', 'error'),
  })

  function handleSave() {
    mutation.mutate({
      name: name.trim() || undefined,
      description: description.trim() || undefined,
    })
  }

  return (
    <div className={sectionCls}>
      <h2 className="t-section-title">General</h2>

      <div className="space-y-1.5">
        <label htmlFor="league-name" className={labelCls}>Name</label>
        <input
          id="league-name"
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          className={inputCls}
          placeholder="League name"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="league-description" className={labelCls}>Description</label>
        <textarea
          id="league-description"
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={3}
          className={inputCls + ' resize-none'}
          placeholder="Describe this league (optional)"
        />
      </div>

      <button
        onClick={handleSave}
        disabled={!name.trim() || mutation.isPending}
        className={btnPrimary}
      >
        {mutation.isPending ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Privacy Section
// ---------------------------------------------------------------------------

function PrivacySection({ leagueId, league }: { leagueId: string; league: League }) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (input: { type?: 'public' | 'private'; post_visibility?: 'members' | 'public' }) =>
      leagueApi.update(leagueId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId] })
      queryClient.invalidateQueries({ queryKey: ['leagues'] })
      toast('Privacy updated', 'success')
    },
    onError: () => toast('Failed to update privacy', 'error'),
  })

  return (
    <div className={sectionCls}>
      <h2 className="t-section-title">Privacy</h2>

      <div className="space-y-1.5">
        <label className={labelCls}>Visibility</label>
        <div className="grid grid-cols-2 gap-2">
          {(['public', 'private'] as const).map(value => (
            <button
              key={value}
              type="button"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate({ type: value })}
              className={`px-3 py-2 rounded border text-[11px] tracking-widest uppercase transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                league.type === value
                  ? 'border-[var(--brass)] bg-[var(--brass)] text-inverse'
                  : 'border-subtle text-muted hover:text-secondary'
              }`}
            >
              {value}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-muted">
          {league.type === 'private'
            ? 'Private leagues are hidden from the directory. Only members see standings and scores.'
            : 'Public leagues appear in the leagues directory.'}
        </p>
      </div>

      <div className="space-y-1.5">
        <label className={labelCls}>Post Visibility</label>
        <div className="grid grid-cols-2 gap-2">
          {(['members', 'public'] as const).map(value => (
            <button
              key={value}
              type="button"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate({ post_visibility: value })}
              className={`px-3 py-2 rounded border text-[11px] tracking-widest uppercase transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                league.post_visibility === value
                  ? 'border-[var(--brass)] bg-[var(--brass)] text-inverse'
                  : 'border-subtle text-muted hover:text-secondary'
              }`}
            >
              {value}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-muted">
          {league.post_visibility === 'public'
            ? 'Posts and their activity may appear on the public feed. Members’ own privacy settings still apply.'
            : 'Posts are only visible to league members.'}
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Regional Defaults Section
// ---------------------------------------------------------------------------

function RegionalSection({ leagueId, league }: { leagueId: string; league: League }) {
  const queryClient = useQueryClient()
  const currentDateFormat = (league.date_format as DateFormat | undefined) ?? DEFAULT_PREFS.dateFormat
  const currentTimeFormat = (league.time_format as TimeFormat | undefined) ?? DEFAULT_PREFS.timeFormat
  const currentTimezone = league.timezone || DEFAULT_PREFS.timezone

  const mutation = useMutation({
    mutationFn: (input: { date_format?: string; time_format?: string; timezone?: string }) =>
      leagueApi.update(leagueId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId] })
      toast('Regional defaults saved', 'success')
    },
    onError: () => toast('Failed to save regional defaults', 'error'),
  })

  return (
    <div className={sectionCls}>
      <h2 className="t-section-title">Regional Defaults</h2>
      <p className="text-[10px] text-muted -mt-2">
        Applied on public pages for this league. Logged-in users see their own preference.
      </p>

      <div className="space-y-1.5">
        <label className={labelCls}>Date Format</label>
        <div className="flex flex-wrap gap-2">
          {DATE_FORMAT_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate({ date_format: value })}
              className={`px-3 py-2 rounded border text-[11px] tracking-widest uppercase transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                currentDateFormat === value
                  ? 'border-[var(--brass)] bg-[var(--brass)] text-inverse'
                  : 'border-subtle text-muted hover:text-secondary'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className={labelCls}>Time Format</label>
        <div className="flex gap-2">
          {(['24h', '12h'] as const).map((v) => (
            <button
              key={v}
              type="button"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate({ time_format: v })}
              className={`px-3 py-2 rounded border text-[11px] tracking-widest uppercase transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                currentTimeFormat === v
                  ? 'border-[var(--brass)] bg-[var(--brass)] text-inverse'
                  : 'border-subtle text-muted hover:text-secondary'
              }`}
            >
              {v === '24h' ? '24-hour' : '12-hour'}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="league-timezone" className={labelCls}>Timezone</label>
        <select
          id="league-timezone"
          value={currentTimezone}
          onChange={(e) => mutation.mutate({ timezone: e.target.value })}
          disabled={mutation.isPending}
          className={inputCls}
        >
          {!TIMEZONES.includes(currentTimezone) && (
            <option value={currentTimezone}>{currentTimezone}</option>
          )}
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>{tz}</option>
          ))}
        </select>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Rules Section (consolidated from General + Score Verification)
// ---------------------------------------------------------------------------

function RulesSection({ leagueId, config }: { leagueId: string; config: LeagueConfig }) {
  const queryClient = useQueryClient()
  const [scoringRule, setScoringRule] = useState(config.scoring_rule)
  const [maxSubs, setMaxSubs] = useState(config.max_submissions_per_round)
  const [startsOn, setStartsOn] = useState(config.starts_on ?? '')
  const [endsOn, setEndsOn] = useState(config.ends_on ?? '')
  const [requireVerification, setRequireVerification] = useState(config.require_score_verification)
  const [confirmations, setConfirmations] = useState(config.required_confirmations)
  const [requireImage, setRequireImage] = useState(config.require_image_upload)
  const [lockAfterVerification, setLockAfterVerification] = useState(config.lock_edits_after_verification)

  const mutation = useMutation({
    mutationFn: (payload: Parameters<typeof leagueApi.updateConfig>[1]) =>
      leagueApi.updateConfig(leagueId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'config'] })
      toast('Rules saved', 'success')
    },
    onError: () => toast('Failed to save rules', 'error'),
  })

  function handleSave() {
    mutation.mutate({
      scoring_rule: scoringRule,
      max_submissions_per_round: maxSubs,
      starts_on: startsOn || undefined,
      ends_on: endsOn || undefined,
      require_score_verification: requireVerification,
      required_confirmations: confirmations,
      require_image_upload: requireImage,
      lock_edits_after_verification: lockAfterVerification,
    })
  }

  return (
    <div className={sectionCls}>
      <h2 className="t-section-title">Rules</h2>

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
                  ? 'bg-[var(--brass)] border-[var(--brass)] text-inverse'
                  : 'bg-surface border-subtle text-muted hover:text-secondary',
              ].join(' ')}
            >
              {rule === 'highest' ? 'Best Score' : 'Average'}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className={labelCls}>Max Submissions</label>
        <input type="number" min={1} value={maxSubs} onChange={e => setMaxSubs(Number(e.target.value))} className={inputCls} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className={labelCls}>Competition Start</label>
          <input type="date" value={startsOn} onChange={e => setStartsOn(e.target.value)} className={inputCls} />
        </div>
        <div className="space-y-1.5">
          <label className={labelCls}>Competition End</label>
          <input type="date" value={endsOn} onChange={e => setEndsOn(e.target.value)} className={inputCls} />
        </div>
      </div>

      <div className="border-t border-subtle" />

      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={requireVerification}
          onChange={e => setRequireVerification(e.target.checked)}
          className="accent-[var(--brass)] w-4 h-4"
        />
        <span className="text-sm text-secondary">Require score verification</span>
      </label>

      {requireVerification && (
        <div className="space-y-1.5 pl-7">
          <label className={labelCls}>Confirmations Required</label>
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

      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={lockAfterVerification}
          onChange={e => setLockAfterVerification(e.target.checked)}
          className="accent-[var(--brass)] w-4 h-4 mt-0.5"
        />
        <span className="text-sm text-secondary">
          Lock score edits after verification
          <span className="block text-xs text-muted">Once a score reaches verified status, owners can no longer edit or delete it.</span>
        </span>
      </label>

      <button onClick={handleSave} disabled={mutation.isPending} className={btnPrimary}>
        {mutation.isPending ? 'Saving…' : 'Save Rules'}
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

  const saveMutation = useMutation({
    mutationFn: () => leagueApi.updateConfig(leagueId, { join_policy: joinPolicy }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'config'] })
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId] })
      toast('Join policy saved', 'success')
    },
    onError: () => toast('Failed to save join policy', 'error'),
  })

  const regenMutation = useMutation({
    mutationFn: () => leagueApi.regenerateJoinCode(leagueId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId] })
      toast('Join code regenerated', 'success')
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Failed to regenerate code', 'error'),
  })

  return (
    <div className={sectionCls}>
      <h2 className="t-section-title">Join Policy</h2>

      <div className="space-y-2">
        {(['open', 'invite_code', 'approval'] as const).map(policy => (
          <button
            key={policy}
            onClick={() => setJoinPolicy(policy)}
            className={[
              'w-full text-left py-2.5 px-3 rounded text-sm transition-colors border',
              joinPolicy === policy
                ? 'bg-[var(--brass)] border-[var(--brass)] text-inverse'
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
          <span className="t-section-title">Code:</span>
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

      <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className={btnPrimary}>
        {saveMutation.isPending ? 'Saving…' : 'Save Join Policy'}
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
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'join-requests'] })
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'members'] })
      toast(variables.decision === 'approved' ? 'Request approved' : 'Request rejected', 'success')
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Failed to update request', 'error'),
  })

  const requests = data?.items ?? []
  const pendingId = decideMutation.isPending ? decideMutation.variables?.requestId : undefined

  if (requests.length === 0) {
    return <p className="text-muted text-xs">No pending requests.</p>
  }

  return (
    <div className="space-y-2">
      <p className="t-section-title">Pending Requests</p>
      {requests.map(jr => {
        const busy = pendingId === jr.id
        return (
          <div key={jr.id} className="flex items-center justify-between bg-surface rounded p-2.5">
            <span className="text-sm text-secondary">{jr.display_name}</span>
            <div className="flex gap-1.5">
              <button
                onClick={() => decideMutation.mutate({ requestId: jr.id, decision: 'approved' })}
                disabled={decideMutation.isPending}
                className="p-1.5 rounded bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Approve"
                aria-label={`Approve ${jr.display_name}`}
              >
                <Check size={14} className={busy ? 'animate-pulse' : ''} />
              </button>
              <button
                onClick={() => decideMutation.mutate({ requestId: jr.id, decision: 'rejected' })}
                disabled={decideMutation.isPending}
                className="p-1.5 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Reject"
                aria-label={`Reject ${jr.display_name}`}
              >
                <X size={14} className={busy ? 'animate-pulse' : ''} />
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Members Section
// ---------------------------------------------------------------------------

function MembersSection({ leagueId, currentUserId }: { leagueId: string; currentUserId: string }) {
  const queryClient = useQueryClient()
  const prefs = useRegionalPrefs()
  const [pendingRemove, setPendingRemove] = useState<LeagueMember | null>(null)

  const { data } = useQuery({
    queryKey: ['leagues', leagueId, 'members'],
    queryFn: () => leagueApi.listMembers(leagueId),
  })

  const removeMutation = useMutation({
    mutationFn: (userId: string) => leagueApi.removeMember(leagueId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'members'] })
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'standings'] })
      toast('Member removed', 'success')
      setPendingRemove(null)
    },
    onError: (err) => {
      toast(err instanceof Error ? err.message : 'Failed to remove member', 'error')
      setPendingRemove(null)
    },
  })

  const members = data?.items ?? []

  return (
    <div className={sectionCls}>
      <div className="flex items-center justify-between">
        <h2 className="t-section-title">Members</h2>
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
              {formatDate(member.joined_at, prefs)}
            </span>
            {!member.is_admin && member.user_id !== currentUserId && (
              <button
                onClick={() => setPendingRemove(member)}
                disabled={removeMutation.isPending}
                className="p-1 rounded text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Remove member"
                aria-label={`Remove ${member.display_name} from league`}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>
      ))}

      <ConfirmDialog
        open={pendingRemove !== null}
        title="Remove member?"
        message={
          pendingRemove
            ? `${pendingRemove.display_name} will lose access to this league. They can rejoin if the join policy allows.`
            : ''
        }
        confirmLabel="Remove"
        onConfirm={() => {
          if (pendingRemove) removeMutation.mutate(pendingRemove.user_id)
        }}
        onCancel={() => setPendingRemove(null)}
      />
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

  const { data: members, isLoading: membersLoading } = useQuery({
    queryKey: ['leagues', id, 'members'],
    queryFn: () => leagueApi.listMembers(id),
  })

  const isLoading = leagueLoading || configLoading || membersLoading
  const isAdmin = !isLoading && members && currentUser
    ? members.items.some(m => m.user_id === currentUser.id && m.is_admin)
    : null

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
        <h1 className="t-page-title">Settings</h1>
      </div>

      <p className="text-xs text-muted">{league.name}</p>

      <LeagueImageSection leagueId={id} league={league} />
      <GeneralInfoSection leagueId={id} league={league} />
      <PrivacySection leagueId={id} league={league} />
      <RulesSection leagueId={id} config={config} />
      <RegionalSection leagueId={id} league={league} />
      <JoinPolicySection leagueId={id} config={config} joinCode={league.join_code} />
      <MembersSection leagueId={id} currentUserId={currentUser!.id} />

      <Link
        to="/leagues/$id/reports"
        params={{ id }}
        className="flex items-center justify-between gap-2 border border-subtle rounded bg-surface p-4 hover:border-[var(--brass)]/30 transition-colors"
      >
        <span className="flex items-center gap-2 text-[11px] tracking-widest uppercase text-secondary">
          <Flag size={14} className="text-[var(--brass)]" />
          Member reports
        </span>
        <span className="text-[10px] tracking-widest uppercase text-muted">Review &rarr;</span>
      </Link>
    </div>
  )
}
