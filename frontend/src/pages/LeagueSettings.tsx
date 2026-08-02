import { useState, useRef, useEffect } from 'react'
import { useParams, Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, RefreshCw, Check, X, Shield, ShieldOff, Camera, Trash2, Flag, CalendarRange, Pencil, Archive, ArchiveRestore } from 'lucide-react'
import { leagueApi, LeagueConfig, League, LeagueMember, Round, Season, UpdateSeasonPayload } from '../api/leagues'
import { useAuthStore } from '../store/auth'
import { toast } from '../store/toast'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { DATE_FORMAT_OPTIONS, DEFAULT_PREFS, formatDate, useRegionalPrefs, type DateFormat, type TimeFormat } from '../utils/date'
import { can, PERM } from '../utils/moderators'
import { ModeratorPermissionEditor, PermissionSummary, RoleBadge } from '../components/ModeratorPermissions'
import AnnouncementComposer from '../components/AnnouncementComposer'

const TIMEZONES: string[] = (() => {
  const fn = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf
  if (typeof fn === 'function') return fn('timeZone')
  return ['Europe/London', 'Europe/Dublin', 'Europe/Paris', 'America/New_York', 'America/Los_Angeles', 'Australia/Sydney', 'UTC']
})()

const inputCls = 'w-full bg-surface border border-subtle rounded px-3 py-2.5 text-sm text-primary placeholder-muted focus:outline-none focus:border-[var(--brass)]/50 transition-colors'
const labelCls = 't-section-title'
const sectionCls = 'border border-subtle rounded bg-surface p-4 space-y-4'
const btnPrimary = 'btn-brass disabled:opacity-50 disabled:cursor-not-allowed text-inverse font-medium text-[11px] tracking-widest uppercase py-2.5 px-4 rounded transition-all'

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
      // The global staleTime is 5 minutes, so without this the Dashboard and
      // Leagues 'my-leagues' widgets (which cache this league's own image_url)
      // would keep showing the old image until it lapses.
      queryClient.invalidateQueries({ queryKey: ['my-leagues'] })
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
      // The global staleTime is 5 minutes, so without this the Dashboard and
      // Leagues 'my-leagues' widgets (which cache this league's own name/
      // description) would keep showing the pre-edit text until it lapses.
      queryClient.invalidateQueries({ queryKey: ['my-leagues'] })
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
      // The global staleTime is 5 minutes, so without this the Dashboard's
      // 'my-leagues' widget (which caches this league's own starts_on/ends_on
      // and uses them to compute "active" status and days-remaining) would
      // keep showing the pre-edit season dates until it lapses.
      queryClient.invalidateQueries({ queryKey: ['my-leagues'] })
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

function JoinPolicySection({ leagueId, config, joinCode, isClubLeague }: {
  leagueId: string
  config: LeagueConfig
  joinCode?: string
  isClubLeague: boolean
}) {
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

      {isClubLeague && (
        <p className="text-[10px] text-muted -mt-2">
          Club league — only club members can join, whatever this policy says.
          Members reach it from the club page.
        </p>
      )}

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

      {joinPolicy === 'invite_code' && !isClubLeague && (
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

      {/* Keyed off the saved policy as well as the local selection: requests
          raised under a previous "approval" policy still need deciding even
          after an admin clicks a different radio. */}
      {(joinPolicy === 'approval' || config.join_policy === 'approval') && (
        <JoinRequestsList leagueId={leagueId} />
      )}
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
// Seasons & Rounds Section
// ---------------------------------------------------------------------------

/** True when now falls inside the round's open/close window. */
function isRoundOpen(round: Round): boolean {
  const now = Date.now()
  if (round.opens_at && new Date(round.opens_at).getTime() > now) return false
  if (round.closes_at && new Date(round.closes_at).getTime() <= now) return false
  return true
}

/**
 * Renders a stored timestamp into the value a datetime-local input wants,
 * which is the admin's own wall clock with no zone. An unparseable stamp comes
 * back empty, and the diffing in the edit form then leaves the field alone
 * rather than sending the blank on as a clear.
 */
function toLocalInput(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Builds the value a PATCH should carry for one field: undefined leaves it
 * untouched, an empty string clears it. Only a field the admin actually
 * changed is sent, so a form that failed to render a stored value can never
 * wipe it on save.
 */
function patched(next: string, initial: string, transform?: (v: string) => string): string | undefined {
  if (next === initial) return undefined
  if (!next) return ''
  return transform ? transform(next) : next
}

const localToISO = (v: string) => new Date(v).toISOString()

function RoundRow({
  leagueId,
  seasonId,
  round,
  canManage,
  onDelete,
}: {
  leagueId: string
  seasonId: string
  round: Round
  canManage: boolean
  onDelete: (round: Round) => void
}) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const initial = {
    name: round.name,
    opensAt: toLocalInput(round.opens_at),
    closesAt: toLocalInput(round.closes_at),
  }
  const [name, setName] = useState(initial.name)
  const [opensAt, setOpensAt] = useState(initial.opensAt)
  const [closesAt, setClosesAt] = useState(initial.closesAt)

  const mutation = useMutation({
    mutationFn: () =>
      leagueApi.updateRound(leagueId, seasonId, round.id, {
        name: patched(name.trim(), initial.name),
        opens_at: patched(opensAt, initial.opensAt, localToISO),
        closes_at: patched(closesAt, initial.closesAt, localToISO),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'seasons', seasonId, 'rounds'] })
      // Moving a round's window can change which round new cards land in.
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'ensure-round'] })
      setEditing(false)
      toast('Round updated', 'success')
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Failed to update round', 'error'),
  })

  function startEditing() {
    setName(initial.name)
    setOpensAt(initial.opensAt)
    setClosesAt(initial.closesAt)
    setEditing(true)
  }

  if (editing) {
    return (
      <div className="space-y-2 py-1">
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Round name"
          aria-label="Round name"
          className={inputCls}
          autoFocus
        />
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label htmlFor={`round-edit-opens-${round.id}`} className="text-[10px] text-muted">Opens</label>
            <input
              id={`round-edit-opens-${round.id}`}
              type="datetime-local"
              value={opensAt}
              onChange={e => setOpensAt(e.target.value)}
              className={inputCls}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={`round-edit-closes-${round.id}`} className="text-[10px] text-muted">Closes</label>
            <input
              id={`round-edit-closes-${round.id}`}
              type="datetime-local"
              value={closesAt}
              onChange={e => setClosesAt(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>
        <p className="text-[10px] text-muted">Clear both dates to keep this round permanently open.</p>
        <div className="flex gap-2">
          <button
            onClick={() => mutation.mutate()}
            disabled={!name.trim() || mutation.isPending}
            className={btnPrimary}
          >
            {mutation.isPending ? 'Saving…' : 'Save round'}
          </button>
          <button onClick={() => setEditing(false)} className="text-[11px] tracking-widest uppercase text-muted px-3">
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-secondary">{round.name}</span>
      {isRoundOpen(round) ? (
        <span className="text-[9px] tracking-widest uppercase text-green-500">Open</span>
      ) : (
        <span className="text-[9px] tracking-widest uppercase text-muted">Closed</span>
      )}
      <span className="ml-auto text-[10px] text-muted font-mono">
        {round.opens_at ? round.opens_at.slice(0, 10) : 'always'}
        {round.closes_at ? ` → ${round.closes_at.slice(0, 10)}` : ''}
      </span>
      {canManage && (
        <>
          <button
            onClick={startEditing}
            className="text-muted hover:text-[var(--brass)] transition-colors"
            aria-label={`Edit ${round.name}`}
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={() => onDelete(round)}
            className="text-muted hover:text-[var(--error-text)] transition-colors"
            aria-label={`Delete ${round.name}`}
          >
            <Trash2 size={13} />
          </button>
        </>
      )}
    </div>
  )
}

function RoundList({ leagueId, seasonId, canManage }: { leagueId: string; seasonId: string; canManage: boolean }) {
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [opensAt, setOpensAt] = useState('')
  const [closesAt, setClosesAt] = useState('')
  const [pendingDelete, setPendingDelete] = useState<Round | null>(null)

  const { data } = useQuery({
    queryKey: ['leagues', leagueId, 'seasons', seasonId, 'rounds'],
    queryFn: () => leagueApi.listRounds(leagueId, seasonId),
  })

  const deleteMutation = useMutation({
    mutationFn: (roundId: string) => leagueApi.deleteRound(leagueId, seasonId, roundId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'seasons', seasonId, 'rounds'] })
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'ensure-round'] })
      setPendingDelete(null)
      toast('Round deleted', 'success')
    },
    onError: (err) => {
      setPendingDelete(null)
      toast(err instanceof Error ? err.message : 'Failed to delete round', 'error')
    },
  })

  const createMutation = useMutation({
    mutationFn: () =>
      leagueApi.createRound(leagueId, seasonId, {
        name: name.trim(),
        // datetime-local has no zone; treat what the admin typed as their
        // local wall clock and send the resolved instant.
        opens_at: opensAt ? new Date(opensAt).toISOString() : undefined,
        closes_at: closesAt ? new Date(closesAt).toISOString() : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'seasons', seasonId, 'rounds'] })
      // Which round new cards land in can change the moment a round opens.
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'ensure-round'] })
      setAdding(false)
      setName('')
      setOpensAt('')
      setClosesAt('')
      toast('Round created', 'success')
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Failed to create round', 'error'),
  })

  const rounds = data?.items ?? []

  return (
    <div className="pl-3 border-l border-subtle space-y-2">
      {rounds.length === 0 && !adding && (
        <p className="text-[11px] text-muted">No rounds in this season.</p>
      )}
      {rounds.map(round => (
        <RoundRow
          key={round.id}
          leagueId={leagueId}
          seasonId={seasonId}
          round={round}
          canManage={canManage}
          onDelete={setPendingDelete}
        />
      ))}

      {!canManage ? null : adding ? (
        <div className="space-y-2 pt-1">
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Round name"
            className={inputCls}
            autoFocus
          />
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label htmlFor={`round-opens-${seasonId}`} className="text-[10px] text-muted">Opens</label>
              <input
                id={`round-opens-${seasonId}`}
                type="datetime-local"
                value={opensAt}
                onChange={e => setOpensAt(e.target.value)}
                className={inputCls}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor={`round-closes-${seasonId}`} className="text-[10px] text-muted">Closes</label>
              <input
                id={`round-closes-${seasonId}`}
                type="datetime-local"
                value={closesAt}
                onChange={e => setClosesAt(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => createMutation.mutate()}
              disabled={!name.trim() || createMutation.isPending}
              className={btnPrimary}
            >
              {createMutation.isPending ? 'Adding…' : 'Add Round'}
            </button>
            <button onClick={() => setAdding(false)} className="text-[11px] tracking-widest uppercase text-muted px-3">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="text-[10px] tracking-widest uppercase text-[var(--brass)] hover:opacity-80 transition-opacity"
        >
          + Add round
        </button>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete round?"
        message={
          pendingDelete
            ? `"${pendingDelete.name}" will be removed from this season. A round that already has cards in it cannot be deleted — close it instead.`
            : ''
        }
        confirmLabel="Delete"
        confirmDisabled={deleteMutation.isPending}
        onConfirm={() => {
          if (pendingDelete) deleteMutation.mutate(pendingDelete.id)
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}

function SeasonRow({
  leagueId,
  season,
  canManage,
  expanded,
  onToggle,
  onDelete,
}: {
  leagueId: string
  season: Season
  canManage: boolean
  expanded: boolean
  onToggle: () => void
  onDelete: (season: Season) => void
}) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const initial = { name: season.name, startsOn: season.starts_on, endsOn: season.ends_on ?? '' }
  const [name, setName] = useState(initial.name)
  const [startsOn, setStartsOn] = useState(initial.startsOn)
  const [endsOn, setEndsOn] = useState(initial.endsOn)

  const mutation = useMutation({
    mutationFn: (payload: UpdateSeasonPayload) => leagueApi.updateSeason(leagueId, season.id, payload),
    onSuccess: (_data, payload) => {
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'seasons'] })
      // Archiving takes a season's rounds out of the running for new cards.
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'ensure-round'] })
      setEditing(false)
      toast(payload.is_active === undefined ? 'Season updated' : payload.is_active ? 'Season restored' : 'Season archived', 'success')
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Failed to update season', 'error'),
  })

  function startEditing() {
    setName(initial.name)
    setStartsOn(initial.startsOn)
    setEndsOn(initial.endsOn)
    setEditing(true)
  }

  return (
    <div className="space-y-2 py-2 border-b border-subtle last:border-0">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 w-full text-left"
        aria-expanded={expanded}
      >
        <CalendarRange size={13} className={`shrink-0 ${season.is_active ? 'text-[var(--brass)]' : 'text-muted'}`} />
        <span className={`text-sm ${season.is_active ? 'text-secondary' : 'text-muted'}`}>{season.name}</span>
        {!season.is_active && (
          <span className="text-[9px] tracking-widest uppercase text-muted border border-subtle rounded px-1.5 py-0.5">
            Archived
          </span>
        )}
        <span className="ml-auto text-[10px] text-muted font-mono">
          {season.starts_on}{season.ends_on ? ` → ${season.ends_on}` : ''}
        </span>
        <ChevronLeft
          size={14}
          className={`text-muted transition-transform ${expanded ? '-rotate-90' : 'rotate-180'}`}
        />
      </button>

      {canManage && !editing && (
        <div className="flex items-center gap-3 pl-5">
          <button
            onClick={startEditing}
            className="flex items-center gap-1 text-[10px] tracking-widest uppercase text-muted hover:text-[var(--brass)] transition-colors"
          >
            <Pencil size={11} /> Edit
          </button>
          <button
            onClick={() => mutation.mutate({ is_active: !season.is_active })}
            disabled={mutation.isPending}
            className="flex items-center gap-1 text-[10px] tracking-widest uppercase text-muted hover:text-[var(--brass)] transition-colors disabled:opacity-50"
          >
            {season.is_active ? <><Archive size={11} /> Archive</> : <><ArchiveRestore size={11} /> Restore</>}
          </button>
          <button
            onClick={() => onDelete(season)}
            className="flex items-center gap-1 text-[10px] tracking-widest uppercase text-muted hover:text-[var(--error-text)] transition-colors"
          >
            <Trash2 size={11} /> Delete
          </button>
        </div>
      )}

      {editing && (
        <div className="space-y-2 pl-5">
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Season name"
            aria-label="Season name"
            className={inputCls}
            autoFocus
          />
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label htmlFor={`season-edit-starts-${season.id}`} className="text-[10px] text-muted">Starts</label>
              <input
                id={`season-edit-starts-${season.id}`}
                type="date"
                value={startsOn}
                onChange={e => setStartsOn(e.target.value)}
                className={inputCls}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor={`season-edit-ends-${season.id}`} className="text-[10px] text-muted">Ends (optional)</label>
              <input
                id={`season-edit-ends-${season.id}`}
                type="date"
                value={endsOn}
                onChange={e => setEndsOn(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() =>
                mutation.mutate({
                  name: patched(name.trim(), initial.name),
                  starts_on: patched(startsOn, initial.startsOn),
                  ends_on: patched(endsOn, initial.endsOn),
                })
              }
              disabled={!name.trim() || !startsOn || mutation.isPending}
              className={btnPrimary}
            >
              {mutation.isPending ? 'Saving…' : 'Save season'}
            </button>
            <button onClick={() => setEditing(false)} className="text-[11px] tracking-widest uppercase text-muted px-3">
              Cancel
            </button>
          </div>
        </div>
      )}

      {expanded && <RoundList leagueId={leagueId} seasonId={season.id} canManage={canManage} />}
    </div>
  )
}

function SeasonsSection({ leagueId, canManage }: { leagueId: string; canManage: boolean }) {
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [startsOn, setStartsOn] = useState('')
  const [endsOn, setEndsOn] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Season | null>(null)

  const { data } = useQuery({
    queryKey: ['leagues', leagueId, 'seasons'],
    queryFn: () => leagueApi.listSeasons(leagueId),
  })

  const deleteMutation = useMutation({
    mutationFn: (seasonId: string) => leagueApi.deleteSeason(leagueId, seasonId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'seasons'] })
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'ensure-round'] })
      setPendingDelete(null)
      toast('Season deleted', 'success')
    },
    onError: (err) => {
      setPendingDelete(null)
      toast(err instanceof Error ? err.message : 'Failed to delete season', 'error')
    },
  })

  const createMutation = useMutation({
    mutationFn: () =>
      leagueApi.createSeason(leagueId, {
        name: name.trim(),
        starts_on: startsOn,
        ends_on: endsOn || undefined,
      }),
    onSuccess: (season) => {
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'seasons'] })
      setAdding(false)
      setName('')
      setStartsOn('')
      setEndsOn('')
      setExpanded(season.id)
      toast('Season created', 'success')
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Failed to create season', 'error'),
  })

  const seasons = data?.items ?? []

  return (
    <div className={sectionCls}>
      <div className="flex items-center justify-between">
        <h2 className="t-section-title">Seasons &amp; Rounds</h2>
        <span className="text-[11px] text-muted font-mono">{seasons.length}</span>
      </div>
      <p className="text-[10px] text-muted -mt-2">
        {canManage
          ? 'New cards land in whichever round is open now. Leave a round’s dates blank to keep it permanently open — a league with a single open round behaves exactly as before.'
          : 'New cards land in whichever round is open now. The league owner has not given you the seasons capability, so this is read-only.'}
      </p>

      {seasons.map(season => (
        <SeasonRow
          key={season.id}
          leagueId={leagueId}
          season={season}
          canManage={canManage}
          expanded={expanded === season.id}
          onToggle={() => setExpanded(expanded === season.id ? null : season.id)}
          onDelete={setPendingDelete}
        />
      ))}

      {seasons.length === 0 && !canManage && (
        <p className="text-[11px] text-muted">No seasons yet.</p>
      )}

      {!canManage ? null : adding ? (
        <div className="space-y-2">
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Season name (e.g. Winter 2026)"
            className={inputCls}
            autoFocus
          />
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label htmlFor="season-starts-on" className="text-[10px] text-muted">Starts</label>
              <input
                id="season-starts-on"
                type="date"
                value={startsOn}
                onChange={e => setStartsOn(e.target.value)}
                className={inputCls}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="season-ends-on" className="text-[10px] text-muted">Ends (optional)</label>
              <input
                id="season-ends-on"
                type="date"
                value={endsOn}
                onChange={e => setEndsOn(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => createMutation.mutate()}
              disabled={!name.trim() || !startsOn || createMutation.isPending}
              className={btnPrimary}
            >
              {createMutation.isPending ? 'Adding…' : 'Add Season'}
            </button>
            <button onClick={() => setAdding(false)} className="text-[11px] tracking-widest uppercase text-muted px-3">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="text-[11px] tracking-widest uppercase text-[var(--brass)] hover:opacity-80 transition-opacity"
        >
          + Add season
        </button>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete season?"
        message={
          pendingDelete
            ? `"${pendingDelete.name}" and its rounds will be removed. A season that already has cards in it cannot be deleted — archive it instead to keep the results.`
            : ''
        }
        confirmLabel="Delete"
        confirmDisabled={deleteMutation.isPending}
        onConfirm={() => {
          if (pendingDelete) deleteMutation.mutate(pendingDelete.id)
        }}
        onCancel={() => setPendingDelete(null)}
      />
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
  const [pendingRole, setPendingRole] = useState<LeagueMember | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const { data } = useQuery({
    queryKey: ['leagues', leagueId, 'members'],
    queryFn: () => leagueApi.listMembers(leagueId),
  })

  const { data: permissionData } = useQuery({
    queryKey: ['leagues', leagueId, 'moderator-permissions'],
    queryFn: () => leagueApi.getModeratorPermissions(leagueId),
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

  const roleMutation = useMutation({
    mutationFn: (member: LeagueMember) =>
      leagueApi.updateMember(leagueId, member.user_id, { is_moderator: !member.is_moderator }),
    onSuccess: (_data, member) => {
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'members'] })
      toast(member.is_moderator ? 'Demoted to member' : 'Promoted to moderator', 'success')
      setPendingRole(null)
    },
    onError: (err) => {
      toast(err instanceof Error ? err.message : 'Failed to update role', 'error')
      setPendingRole(null)
    },
  })

  const permissionMutation = useMutation({
    mutationFn: ({ userId, permissions }: { userId: string; permissions: string[] }) =>
      leagueApi.updateMember(leagueId, userId, { permissions }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'members'] })
      toast('Permissions updated', 'success')
    },
    onError: (err) => {
      toast(err instanceof Error ? err.message : 'Failed to update permissions', 'error')
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'members'] })
    },
  })

  const members = data?.items ?? []
  const moderatorCount = members.filter(m => m.is_moderator).length
  const catalogue = permissionData?.catalogue ?? []
  const viewerRole = permissionData?.role ?? null
  const canDelegate = can(viewerRole, PERM.manageModerators)
  // Owners delegate anything; a moderator may only pass on what they hold.
  const grantable = viewerRole?.is_owner ? null : (viewerRole?.permissions ?? [])

  const togglePermission = (member: LeagueMember, key: string, next: boolean) => {
    const current = member.permissions ?? []
    const permissions = next ? [...current, key] : current.filter(p => p !== key)
    permissionMutation.mutate({ userId: member.user_id, permissions })
  }

  return (
    <div className={sectionCls}>
      <div className="flex items-center justify-between">
        <h2 className="t-section-title">Members</h2>
        <span className="text-[11px] text-muted font-mono">{members.length}</span>
      </div>
      <p className="text-[10px] text-muted -mt-2">
        Promote a moderator to help run the league, then choose exactly what they
        can do. The owner always holds every capability, and the last moderator
        cannot leave or be demoted.
      </p>

      {members.map(member => {
        const isSelf = member.user_id === currentUserId
        const lastModerator = member.is_moderator && moderatorCount <= 1
        const roleLocked = member.is_owner || lastModerator || !canDelegate
        const showPermissions = member.is_moderator && !member.is_owner && expanded === member.user_id
        return (
          <div key={member.user_id} className="py-2 border-b border-subtle last:border-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm text-secondary">{member.display_name}</span>
                <RoleBadge member={member} />
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-muted font-mono">
                  {formatDate(member.joined_at, prefs)}
                </span>
                {!isSelf && !member.is_owner && canDelegate && (
                  <button
                    onClick={() => setPendingRole(member)}
                    disabled={roleMutation.isPending || roleLocked}
                    className="p-1 rounded text-muted hover:text-[var(--brass)] hover:bg-[var(--brass-dim)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    title={lastModerator ? 'Cannot demote the last moderator' : member.is_moderator ? 'Demote to member' : 'Promote to moderator'}
                    aria-label={member.is_moderator ? `Demote ${member.display_name} to member` : `Promote ${member.display_name} to moderator`}
                  >
                    {member.is_moderator ? <ShieldOff size={14} /> : <Shield size={14} />}
                  </button>
                )}
                {!member.is_moderator && !isSelf && (
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

            {member.is_owner && (
              <p className="text-[10px] text-muted mt-1">Full access — the owner's role cannot be changed.</p>
            )}

            {member.is_moderator && !member.is_owner && (
              <div className="mt-1">
                <PermissionSummary
                  permissions={member.permissions}
                  catalogue={catalogue}
                  open={showPermissions}
                  onToggle={() => setExpanded(showPermissions ? null : member.user_id)}
                />
                {showPermissions && (
                  <ModeratorPermissionEditor
                    catalogue={catalogue}
                    granted={member.permissions ?? []}
                    grantable={grantable}
                    disabled={!canDelegate || permissionMutation.isPending}
                    onToggle={(key, next) => togglePermission(member, key, next)}
                  />
                )}
              </div>
            )}
          </div>
        )
      })}

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

      <ConfirmDialog
        open={pendingRole !== null}
        title={pendingRole?.is_moderator ? 'Demote to member?' : 'Promote to moderator?'}
        message={
          pendingRole
            ? pendingRole.is_moderator
              ? `${pendingRole.display_name} will no longer help run this league, and their permissions will be cleared.`
              : `${pendingRole.display_name} will start with the day-to-day permissions. You can change exactly what they can do afterwards.`
            : ''
        }
        confirmLabel={pendingRole?.is_moderator ? 'Demote' : 'Promote'}
        onConfirm={() => {
          if (pendingRole) roleMutation.mutate(pendingRole)
        }}
        onCancel={() => setPendingRole(null)}
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

  const { data: permissionData, isLoading: permissionsLoading } = useQuery({
    queryKey: ['leagues', id, 'moderator-permissions'],
    queryFn: () => leagueApi.getModeratorPermissions(id),
  })

  const isLoading = leagueLoading || configLoading || permissionsLoading
  // The role endpoint is the authority on who runs the league. Reading it off
  // the members list locks out whoever runs the club hosting it, who holds
  // every capability here without ever having entered the league.
  const viewerRole = permissionData?.role ?? null
  const isModerator = !isLoading && viewerRole && currentUser ? viewerRole.is_moderator : null

  useEffect(() => {
    if (isModerator === false) {
      navigate({ to: '/leagues/$id', params: { id } })
    }
  }, [isModerator, navigate, id])

  if (isLoading || isModerator === null) {
    return (
      <div className="p-4 lg:p-8 space-y-4 max-w-lg lg:max-w-3xl mx-auto">
        <div className="h-6 w-40 skeleton rounded" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-32 skeleton rounded" />
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

  if (isModerator === false) return null

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
      <SeasonsSection leagueId={id} canManage={can(viewerRole, PERM.manageSeasons)} />
      <RegionalSection leagueId={id} league={league} />
      <JoinPolicySection leagueId={id} config={config} joinCode={league.join_code} isClubLeague={!!league.club_id} />
      <MembersSection leagueId={id} currentUserId={currentUser!.id} />

      <div className={sectionCls}>
        <h2 className={labelCls}>Announcements</h2>
        <AnnouncementComposer
          scope="league"
          scopeId={id}
          audienceLabel={`every member of ${league.name}`}
          canSend={can(permissionData?.role, PERM.sendAnnouncements)}
        />
      </div>

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
