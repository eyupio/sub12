import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Pencil, Trash2, UsersRound } from 'lucide-react'
import { adminSimulationApi, SimulatedPersona, UpdateSimulationSettingsInput } from '../api/adminSimulation'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { PersonaEditDialog, PersonaEditState } from '../components/PersonaEditDialog'
import { PersonaJoinDialog } from '../components/PersonaJoinDialog'
import { identiconDataUri } from '../utils/identicon'

const inputCls = 'w-full bg-surface border border-subtle rounded px-3 py-2.5 text-sm text-primary placeholder-muted focus:outline-none focus:border-[var(--brass)]/50 transition-colors'
const labelCls = 't-section-title'
const btnPrimary = 'bg-[var(--brass)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-inverse font-medium text-[11px] tracking-widest uppercase py-2.5 px-4 rounded transition-opacity'
const btnSecondary = 'border border-subtle hover:border-strong text-secondary hover:text-primary text-[11px] tracking-widest uppercase py-2.5 px-4 rounded transition-colors'
const btnDanger = 'border border-[var(--error-border)] text-[var(--error-text)] hover:bg-[var(--error-bg)] text-[11px] tracking-widest uppercase py-2.5 px-4 rounded transition-colors'

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

interface FormState {
  enabled: boolean
  persona_count: string
  actions_per_hour: string
  post_weight: string
  like_weight: string
  comment_weight: string
  follow_weight: string
  unfollow_weight: string
  share_weight: string
  active_start_hour: string
  active_end_hour: string
  interact_with_real_users: boolean
  max_cards_per_persona: string
  include_in_public_stats: boolean
  hourly_multipliers: string[] // 24 entries
}

function validate(values: FormState): string[] {
  const errors: string[] = []
  const num = (v: string) => Number(v)
  const isInt = (v: string) => Number.isInteger(num(v))

  const persona = num(values.persona_count)
  if (!isInt(values.persona_count) || persona < 0 || persona > 1000) {
    errors.push('Persona count must be a whole number between 0 and 1000.')
  }
  const aph = num(values.actions_per_hour)
  if (!isInt(values.actions_per_hour) || aph < 0 || aph > 10000) {
    errors.push('Actions per hour must be a whole number between 0 and 10000.')
  }
  for (const [label, key] of [
    ['Post', 'post_weight'],
    ['Like', 'like_weight'],
    ['Comment', 'comment_weight'],
    ['Follow', 'follow_weight'],
    ['Unfollow', 'unfollow_weight'],
    ['Share', 'share_weight'],
  ] as const) {
    const w = num(values[key])
    if (!isInt(values[key]) || w < 0) {
      errors.push(`${label} weight must be a whole number of 0 or more.`)
    }
  }
  if (
    num(values.post_weight) + num(values.like_weight) +
    num(values.comment_weight) + num(values.follow_weight) +
    num(values.unfollow_weight) + num(values.share_weight) === 0
  ) {
    errors.push('At least one action weight must be greater than 0.')
  }
  const start = num(values.active_start_hour)
  if (!isInt(values.active_start_hour) || start < 0 || start > 23) {
    errors.push('Active start hour must be between 0 and 23.')
  }
  const end = num(values.active_end_hour)
  if (!isInt(values.active_end_hour) || end < 1 || end > 24) {
    errors.push('Active end hour must be between 1 and 24.')
  }
  const maxCards = num(values.max_cards_per_persona)
  if (!isInt(values.max_cards_per_persona) || maxCards < 0) {
    errors.push('Max cards per persona must be 0 or more.')
  }
  for (let i = 0; i < values.hourly_multipliers.length; i++) {
    const m = Number(values.hourly_multipliers[i])
    if (!Number.isFinite(m) || m < 0) {
      errors.push(`Hourly multiplier ${i} must be a number of 0 or more.`)
      break
    }
  }
  return errors
}

function defaultMultipliers(): string[] {
  return Array.from({ length: 24 }, () => '1')
}

// "Evening" preset: quiet overnight, baseline daytime, busier evenings.
function eveningPreset(): string[] {
  return [
    '0.2', '0.1', '0.1', '0.1', '0.1', '0.2', '0.4', '0.6',
    '0.8', '1.0', '1.0', '1.0', '1.0', '1.0', '1.0', '1.2',
    '1.6', '2.0', '2.0', '1.6', '1.2', '0.8', '0.4', '0.2',
  ]
}

// Formats an hour (0-24) as a local-time label for the active-window helper.
function localWindowLabel(start: number, end: number): string {
  if (start === end) return 'all day (local time)'
  const fmt = (h: number) => {
    const hh = h % 24
    const ampm = hh < 12 ? 'AM' : 'PM'
    const display = hh % 12 === 0 ? 12 : hh % 12
    return `${display} ${ampm}`
  }
  if (start < end) return `${fmt(start)} – ${fmt(end)} (local time)`
  return `${fmt(start)} – ${fmt(end)} next day (local time)`
}

const AUDIT_LABELS: Record<string, string> = {
  settings_updated: 'Settings updated',
  purged: 'Purged all',
  cleanup: 'Cleanup',
  persona_deleted: 'Persona deleted',
  persona_updated: 'Persona profile updated',
  persona_avatar: 'Persona avatar updated',
  persona_joined_league: 'Persona joined league',
  persona_joined_club: 'Persona joined club',
  run_now: 'Run now',
}

export default function AdminSimulation() {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<FormState>({
    enabled: false,
    persona_count: '12',
    actions_per_hour: '20',
    post_weight: '2',
    like_weight: '5',
    comment_weight: '2',
    follow_weight: '1',
    unfollow_weight: '0',
    share_weight: '0',
    active_start_hour: '0',
    active_end_hour: '24',
    interact_with_real_users: false,
    max_cards_per_persona: '30',
    include_in_public_stats: true,
    hourly_multipliers: defaultMultipliers(),
  })
  const [formErrors, setFormErrors] = useState<string[]>([])
  const [serverError, setServerError] = useState<string | null>(null)
  const [saveOk, setSaveOk] = useState<string | null>(null)
  const [runResult, setRunResult] = useState<string | null>(null)
  const [runActions, setRunActions] = useState('10')
  const [savedSnapshot, setSavedSnapshot] = useState('')

  // Pending high-impact toggle changes awaiting confirmation.
  const [pendingToggle, setPendingToggle] = useState<'enabled' | 'interact' | null>(null)
  const [pendingForm, setPendingForm] = useState<FormState | null>(null)

  // Danger-zone confirmations.
  const [confirmPurge, setConfirmPurge] = useState(false)
  const [confirmCleanup, setConfirmCleanup] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Persona edit dialog.
  const [editingPersona, setEditingPersona] = useState<SimulatedPersona | null>(null)

  // Persona join-to-league/club dialog.
  const [joinTarget, setJoinTarget] = useState<{ persona: SimulatedPersona; kind: 'league' | 'club' } | null>(null)

  // Persona list pagination.
  const [personaOffset, setPersonaOffset] = useState(0)
  const personaLimit = 20

  // Audit list pagination.
  const [auditOffset, setAuditOffset] = useState(0)
  const auditLimit = 20

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-simulation-settings'],
    queryFn: adminSimulationApi.getSettings,
    retry: false,
  })

  const { data: status } = useQuery({
    queryKey: ['admin-simulation-status'],
    queryFn: adminSimulationApi.getStatus,
    retry: false,
    refetchInterval: 10000,
  })

  const { data: personasData } = useQuery({
    queryKey: ['admin-simulation-personas', personaOffset],
    queryFn: () => adminSimulationApi.listPersonas(personaLimit, personaOffset),
    retry: false,
  })

  const { data: auditData } = useQuery({
    queryKey: ['admin-simulation-audit', auditOffset],
    queryFn: () => adminSimulationApi.listAudit(auditLimit, auditOffset),
    retry: false,
  })

  useEffect(() => {
    if (!data) return
    const next: FormState = {
      enabled: data.enabled,
      persona_count: String(data.persona_count),
      actions_per_hour: String(data.actions_per_hour),
      post_weight: String(data.post_weight),
      like_weight: String(data.like_weight),
      comment_weight: String(data.comment_weight),
      follow_weight: String(data.follow_weight),
      unfollow_weight: String(data.unfollow_weight),
      share_weight: String(data.share_weight),
      active_start_hour: String(data.active_start_hour),
      active_end_hour: String(data.active_end_hour),
      interact_with_real_users: data.interact_with_real_users,
      max_cards_per_persona: String(data.max_cards_per_persona),
      include_in_public_stats: data.include_in_public_stats,
      hourly_multipliers: (data.hourly_multipliers?.length === 24
        ? data.hourly_multipliers
        : Array.from({ length: 24 }, () => 1)
      ).map(String),
    }
    setForm(next)
    setSavedSnapshot(JSON.stringify(next))
  }, [data])

  const isDirty = useMemo(() => JSON.stringify(form) !== savedSnapshot, [form, savedSnapshot])

  // activeNow reports whether the current UTC hour falls inside the configured
  // active window (supports wrap-around). Recomputed on each render; the 10s
  // status poll keeps it reasonably fresh.
  const activeNow = useMemo(() => {
    const hour = new Date().getUTCHours()
    const start = Number(form.active_start_hour)
    const end = Number(form.active_end_hour)
    if (start === end) return true
    if (start < end) return hour >= start && hour < end
    return hour >= start || hour < end
  }, [form.active_start_hour, form.active_end_hour])

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ['admin-simulation-status'] })
    queryClient.invalidateQueries({ queryKey: ['admin-simulation-personas', personaOffset] })
    queryClient.invalidateQueries({ queryKey: ['admin-simulation-audit', auditOffset] })
  }

  const saveMutation = useMutation({
    mutationFn: (payload: UpdateSimulationSettingsInput) => adminSimulationApi.patchSettings(payload),
    onSuccess: (updated) => {
      const next: FormState = {
        enabled: updated.enabled,
        persona_count: String(updated.persona_count),
        actions_per_hour: String(updated.actions_per_hour),
        post_weight: String(updated.post_weight),
        like_weight: String(updated.like_weight),
        comment_weight: String(updated.comment_weight),
        follow_weight: String(updated.follow_weight),
        unfollow_weight: String(updated.unfollow_weight),
        share_weight: String(updated.share_weight),
        active_start_hour: String(updated.active_start_hour),
        active_end_hour: String(updated.active_end_hour),
        interact_with_real_users: updated.interact_with_real_users,
        max_cards_per_persona: String(updated.max_cards_per_persona),
        include_in_public_stats: updated.include_in_public_stats,
        hourly_multipliers: (updated.hourly_multipliers?.length === 24
          ? updated.hourly_multipliers
          : Array.from({ length: 24 }, () => 1)
        ).map(String),
      }
      setForm(next)
      setSavedSnapshot(JSON.stringify(next))
      setSaveOk('Saved simulation settings.')
      setServerError(null)
      setRunResult(null)
      invalidateAll()
      setTimeout(() => setSaveOk(null), 2500)
    },
    onError: (err) => {
      setServerError(parseError(err))
      setSaveOk(null)
    },
  })

  const runMutation = useMutation({
    mutationFn: (n: number) => adminSimulationApi.runNow(n),
    onSuccess: (res) => {
      const parts = res.counts
        ? Object.entries(res.counts)
            .filter(([, v]) => v > 0)
            .map(([k, v]) => `${k}: ${v}`)
            .join(', ')
        : ''
      setRunResult(
        `Performed ${res.performed} action${res.performed === 1 ? '' : 's'}${parts ? ` (${parts})` : ''}.`,
      )
      setServerError(null)
      setSaveOk(null)
      invalidateAll()
    },
    onError: (err) => {
      setRunResult(null)
      setSaveOk(null)
      setServerError(parseError(err))
    },
  })

  const deletePersonaMutation = useMutation({
    mutationFn: (id: string) => adminSimulationApi.deletePersona(id),
    onSuccess: () => {
      setConfirmDeleteId(null)
      invalidateAll()
    },
    onError: (err) => setServerError(parseError(err)),
  })

  const savePersonaMutation = useMutation({
    mutationFn: async ({ persona, state }: { persona: SimulatedPersona; state: PersonaEditState }) => {
      const { avatarFile, ...fields } = state
      // Only send fields that changed from the persona's current value, so we
      // don't clobber untouched nullable columns with empty strings.
      const payload: Record<string, string> = {}
      if (fields.display_name != null && fields.display_name !== persona.display_name) {
        payload.display_name = fields.display_name
      }
      if (fields.bio != null && fields.bio !== (persona.bio ?? '')) {
        payload.bio = fields.bio
      }
      if (fields.location != null && fields.location !== (persona.location ?? '')) {
        payload.location = fields.location
      }
      if (fields.club != null && fields.club !== (persona.club ?? '')) {
        payload.club = fields.club
      }
      if (Object.keys(payload).length > 0) {
        await adminSimulationApi.updatePersona(persona.id, payload)
      }
      if (avatarFile) {
        const fd = new FormData()
        fd.append('image', avatarFile)
        await adminSimulationApi.uploadPersonaAvatar(persona.id, fd)
      }
      if (state.removeAvatar) {
        await adminSimulationApi.removePersonaAvatar(persona.id)
      }
    },
    onSuccess: () => {
      setEditingPersona(null)
      setRunResult('Persona updated.')
      setServerError(null)
      invalidateAll()
      setTimeout(() => setRunResult(null), 2500)
    },
    onError: (err) => setServerError(parseError(err)),
  })

  const joinLeagueMutation = useMutation({
    mutationFn: ({ persona, targetId }: { persona: SimulatedPersona; targetId: string }) =>
      adminSimulationApi.joinPersonaToLeague(persona.id, targetId),
    onSuccess: () => {
      setJoinTarget(null)
      setRunResult('Persona added to league.')
      setServerError(null)
      setTimeout(() => setRunResult(null), 2500)
    },
    onError: (err) => setServerError(parseError(err)),
  })

  const joinClubMutation = useMutation({
    mutationFn: ({ persona, targetId }: { persona: SimulatedPersona; targetId: string }) =>
      adminSimulationApi.joinPersonaToClub(persona.id, targetId),
    onSuccess: () => {
      setJoinTarget(null)
      setRunResult('Persona added to club.')
      setServerError(null)
      setTimeout(() => setRunResult(null), 2500)
    },
    onError: (err) => setServerError(parseError(err)),
  })

  const purgeMutation = useMutation({
    mutationFn: () => adminSimulationApi.purgeAll(),
    onSuccess: (res) => {
      setConfirmPurge(false)
      setRunResult(`Purged ${res.deleted} simulated account${res.deleted === 1 ? '' : 's'}.`)
      setPersonaOffset(0)
      invalidateAll()
    },
    onError: (err) => setServerError(parseError(err)),
  })

  const cleanupMutation = useMutation({
    mutationFn: () => adminSimulationApi.cleanup(),
    onSuccess: (res) => {
      setConfirmCleanup(false)
      setRunResult(`Trimmed ${res.deleted} account${res.deleted === 1 ? '' : 's'} (target ${res.target}).`)
      setPersonaOffset(0)
      invalidateAll()
    },
    onError: (err) => setServerError(parseError(err)),
  })

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  // High-impact toggles (enable, interact-with-real-users) require confirmation.
  function attemptToggle<K extends 'enabled' | 'interact_with_real_users'>(key: K, value: boolean) {
    const next = { ...form, [key]: value }
    setPendingForm(next)
    setPendingToggle(key === 'interact_with_real_users' ? 'interact' : 'enabled')
  }

  function confirmToggle() {
    if (!pendingForm) return
    setForm(pendingForm)
    setPendingToggle(null)
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setServerError(null)
    setRunResult(null)
    setSaveOk(null)
    const errors = validate(form)
    setFormErrors(errors)
    if (errors.length > 0) return

    saveMutation.mutate({
      enabled: form.enabled,
      persona_count: Number(form.persona_count),
      actions_per_hour: Number(form.actions_per_hour),
      post_weight: Number(form.post_weight),
      like_weight: Number(form.like_weight),
      comment_weight: Number(form.comment_weight),
      follow_weight: Number(form.follow_weight),
      unfollow_weight: Number(form.unfollow_weight),
      share_weight: Number(form.share_weight),
      active_start_hour: Number(form.active_start_hour),
      active_end_hour: Number(form.active_end_hour),
      interact_with_real_users: form.interact_with_real_users,
      max_cards_per_persona: Number(form.max_cards_per_persona),
      include_in_public_stats: form.include_in_public_stats,
      hourly_multipliers: form.hourly_multipliers.map(Number),
    })
  }

  if (isLoading) {
    return <div className="p-6 text-sm text-muted">Loading simulation settings…</div>
  }
  if (error) {
    return <div className="p-6 text-sm text-[var(--error-text)]">{parseError(error)}</div>
  }

  const personas = personasData?.items ?? []
  const personaTotal = personasData?.total ?? 0
  const auditEntries = auditData?.items ?? []
  const auditTotal = auditData?.total ?? 0

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-5">
      <div>
        <h1 className="t-page-title">Admin • Activity Simulation</h1>
        <p className="text-sm text-muted mt-1">
          Provision flagged simulated accounts that post, like, comment and follow to demonstrate
          a lively community. Every simulated account is tagged in the database so its content stays
          auditable and can be filtered or removed.
        </p>
      </div>

      {/* Status snapshot */}
      <div className="bg-surface border border-subtle rounded-lg p-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <div className={labelCls}>Status</div>
          <div className="text-sm text-primary mt-1 flex items-center gap-2">
            {status?.enabled ? 'Enabled' : 'Disabled'}
            {status?.enabled && activeNow && (
              <span className="inline-block w-2 h-2 rounded-full bg-green-500" title="Within active window" />
            )}
          </div>
        </div>
        <div>
          <div className={labelCls}>Simulated Users</div>
          <div className="text-sm text-primary mt-1">{status?.simulated_user_count ?? '—'} / {status?.persona_count ?? '—'}</div>
        </div>
        <div>
          <div className={labelCls}>Simulated Cards</div>
          <div className="text-sm text-primary mt-1">{status?.simulated_card_count ?? '—'}</div>
        </div>
        <div>
          <div className={labelCls}>Last Run</div>
          <div className="text-sm text-primary mt-1">
            {status?.last_run_at ? new Date(status.last_run_at).toLocaleString() : 'Never'}
            {status?.last_action ? ` (${status.last_action})` : ''}
          </div>
        </div>
        <div className="lg:col-span-4 grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-subtle">
          <div>
            <div className={labelCls}>Total Actions</div>
            <div className="text-sm text-primary mt-1">{status?.total_actions ?? '—'}</div>
          </div>
          <div>
            <div className={labelCls}>Posts</div>
            <div className="text-sm text-primary mt-1">{status?.post_count ?? '—'}</div>
          </div>
          <div>
            <div className={labelCls}>Likes</div>
            <div className="text-sm text-primary mt-1">{status?.like_count ?? '—'}</div>
          </div>
          <div>
            <div className={labelCls}>Comments</div>
            <div className="text-sm text-primary mt-1">{status?.comment_count ?? '—'}</div>
          </div>
          <div>
            <div className={labelCls}>Follows</div>
            <div className="text-sm text-primary mt-1">{status?.follow_count ?? '—'}</div>
          </div>
          <div>
            <div className={labelCls}>Unfollows</div>
            <div className="text-sm text-primary mt-1">{status?.unfollow_count ?? '—'}</div>
          </div>
          <div>
            <div className={labelCls}>Shares</div>
            <div className="text-sm text-primary mt-1">{status?.share_count ?? '—'}</div>
          </div>
          <div>
            <div className={labelCls}>Last Tick</div>
            <div className="text-sm text-primary mt-1">
              {status?.last_tick_at ? new Date(status.last_tick_at).toLocaleTimeString() : '—'}
            </div>
          </div>
          <div className="col-span-2 sm:col-span-4">
            <div className={labelCls}>Last Error</div>
            <div className="text-sm text-primary mt-1">
              {status?.last_error ? (
                <span className="text-[var(--error-text)]">
                  {status.last_error}
                  {status.last_error_at ? ` · ${new Date(status.last_error_at).toLocaleString()}` : ''}
                </span>
              ) : 'None'}
            </div>
          </div>
        </div>
      </div>

      {/* Settings form */}
      <form onSubmit={handleSubmit} className="bg-surface border border-subtle rounded-lg p-4 space-y-4">
        {formErrors.length > 0 && (
          <div className="bg-[var(--error-bg)] border border-[var(--error-border)] text-[var(--error-text)] text-sm rounded p-3">
            <ul className="list-disc pl-5 space-y-1">
              {formErrors.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        )}
        {serverError && (
          <div className="bg-[var(--error-bg)] border border-[var(--error-border)] text-[var(--error-text)] text-sm rounded p-3">
            {serverError}
          </div>
        )}
        {saveOk && <p className="text-green-400 text-sm">{saveOk}</p>}
        {runResult && <p className="text-sm text-secondary">{runResult}</p>}

        <label className="text-sm text-secondary inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => attemptToggle('enabled', e.target.checked)}
          />
          Enable simulation engine
        </label>

        <div className="grid md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className={labelCls} htmlFor="persona-count">Persona Count</label>
            <input id="persona-count" value={form.persona_count} onChange={(e) => updateField('persona_count', e.target.value)} className={inputCls} inputMode="numeric" />
            <p className="text-xs text-muted">Number of simulated accounts to maintain.</p>
          </div>
          <div className="space-y-1">
            <label className={labelCls} htmlFor="actions-per-hour">Actions Per Hour</label>
            <input id="actions-per-hour" value={form.actions_per_hour} onChange={(e) => updateField('actions_per_hour', e.target.value)} className={inputCls} inputMode="numeric" />
            <p className="text-xs text-muted">Overall pace of simulated activity.</p>
          </div>
        </div>

        <div>
          <div className={labelCls}>Action Weights</div>
          <p className="text-xs text-muted mb-2">Relative likelihood of each action type. Personalities further bias these per persona.</p>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-secondary" htmlFor="post-weight">Post</label>
              <input id="post-weight" value={form.post_weight} onChange={(e) => updateField('post_weight', e.target.value)} className={inputCls} inputMode="numeric" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-secondary" htmlFor="like-weight">Like</label>
              <input id="like-weight" value={form.like_weight} onChange={(e) => updateField('like_weight', e.target.value)} className={inputCls} inputMode="numeric" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-secondary" htmlFor="comment-weight">Comment</label>
              <input id="comment-weight" value={form.comment_weight} onChange={(e) => updateField('comment_weight', e.target.value)} className={inputCls} inputMode="numeric" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-secondary" htmlFor="follow-weight">Follow</label>
              <input id="follow-weight" value={form.follow_weight} onChange={(e) => updateField('follow_weight', e.target.value)} className={inputCls} inputMode="numeric" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-secondary" htmlFor="unfollow-weight">Unfollow</label>
              <input id="unfollow-weight" value={form.unfollow_weight} onChange={(e) => updateField('unfollow_weight', e.target.value)} className={inputCls} inputMode="numeric" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-secondary" htmlFor="share-weight">Share</label>
              <input id="share-weight" value={form.share_weight} onChange={(e) => updateField('share_weight', e.target.value)} className={inputCls} inputMode="numeric" />
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className={labelCls} htmlFor="active-start">Active Start Hour (UTC)</label>
            <input id="active-start" value={form.active_start_hour} onChange={(e) => updateField('active_start_hour', e.target.value)} className={inputCls} inputMode="numeric" />
          </div>
          <div className="space-y-1">
            <label className={labelCls} htmlFor="active-end">Active End Hour (UTC)</label>
            <input id="active-end" value={form.active_end_hour} onChange={(e) => updateField('active_end_hour', e.target.value)} className={inputCls} inputMode="numeric" />
            <p className="text-xs text-muted">Set start = end for all-day activity.</p>
          </div>
        </div>
        <p className="text-xs text-muted -mt-2">
          Active window: {localWindowLabel(Number(form.active_start_hour), Number(form.active_end_hour))}
        </p>

        {/* Time-of-day shaping */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <div className={labelCls}>Hourly Multipliers (UTC)</div>
              <p className="text-xs text-muted">Scales the action budget per hour. 1 = baseline, 0 = quiet, 2 = double.</p>
            </div>
            <button
              type="button"
              className="text-[11px] tracking-widest uppercase text-secondary border border-subtle rounded px-2 py-1 hover:border-strong transition-colors"
              onClick={() => updateField('hourly_multipliers', eveningPreset())}
            >
              Evening preset
            </button>
          </div>
          <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
            {form.hourly_multipliers.map((m, i) => (
              <div key={i} className="space-y-0.5">
                <input
                  aria-label={`multiplier hour ${i}`}
                  value={m}
                  onChange={(e) => {
                    const next = [...form.hourly_multipliers]
                    next[i] = e.target.value
                    updateField('hourly_multipliers', next)
                  }}
                  className={`${inputCls} px-1 py-1 text-xs`}
                  inputMode="decimal"
                />
                <div className="text-[9px] text-muted text-center">{i}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <label className={labelCls} htmlFor="max-cards">Max Cards Per Persona</label>
          <input id="max-cards" value={form.max_cards_per_persona} onChange={(e) => updateField('max_cards_per_persona', e.target.value)} className={inputCls} inputMode="numeric" />
          <p className="text-xs text-muted">Caps how many score cards each simulated account posts (0 = unlimited).</p>
        </div>

        <label className="text-sm text-secondary inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.interact_with_real_users}
            onChange={(e) => attemptToggle('interact_with_real_users', e.target.checked)}
          />
          Allow simulated accounts to like, comment on and follow real users
        </label>
        <p className="text-xs text-muted -mt-2">
          When off, simulated accounts only interact with each other's content.
        </p>

        <label className="text-sm text-secondary inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.include_in_public_stats}
            onChange={(e) => updateField('include_in_public_stats', e.target.checked)}
          />
          Include simulated content in public feed and leaderboards
        </label>
        <p className="text-xs text-muted -mt-2">
          When off, simulated activity is hidden from the public feed and pellet leaderboard.
        </p>

        <div className="flex flex-wrap gap-2 items-center">
          <button type="submit" className={btnPrimary} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? 'Saving…' : 'Save Settings'}
          </button>
          <div className="flex items-center gap-2">
            <input
              aria-label="actions"
              value={runActions}
              onChange={(e) => setRunActions(e.target.value)}
              className={`${inputCls} w-20`}
              inputMode="numeric"
            />
            <button
              type="button"
              className={btnSecondary}
              disabled={runMutation.isPending}
              onClick={() => {
                const n = Number(runActions)
                runMutation.mutate(Number.isInteger(n) && n > 0 ? Math.min(n, 100) : 10)
              }}
            >
              {runMutation.isPending ? 'Running…' : 'Run Now'}
            </button>
          </div>
          {isDirty && <span className="text-xs text-amber-400 self-center">You have unsaved changes.</span>}
        </div>
      </form>

      {/* Personas */}
      <div className="bg-surface border border-subtle rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className={labelCls}>Simulated Personas</h2>
          <span className="text-xs text-muted">{personaTotal} total</span>
        </div>
        {personas.length === 0 ? (
          <p className="text-sm text-muted">No simulated accounts yet.</p>
        ) : (
          <div className="space-y-1">
            {personas.map((p) => (
              <div key={p.id} className="flex items-center gap-3 p-2 rounded border border-subtle">
                <div className="w-8 h-8 rounded-full overflow-hidden border border-subtle bg-surface-hover shrink-0">
                  <img
                    src={p.avatar_url || identiconDataUri(p.id || p.display_name || '')}
                    alt={p.display_name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-primary truncate">{p.display_name}</div>
                  <div className="text-xs text-muted truncate">{p.email} · {p.card_count} cards</div>
                </div>
                <button
                  type="button"
                  className="text-muted hover:text-[var(--brass)] transition-colors p-1"
                  aria-label="Add to league or club"
                  title="Add to league / club"
                  onClick={() => setJoinTarget({ persona: p, kind: 'league' })}
                >
                  <UsersRound size={14} />
                </button>
                <button
                  type="button"
                  className="text-muted hover:text-[var(--brass)] transition-colors p-1"
                  aria-label="Edit persona"
                  onClick={() => setEditingPersona(p)}
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  className="text-muted hover:text-[var(--error-text)] transition-colors p-1"
                  aria-label="Delete persona"
                  onClick={() => setConfirmDeleteId(p.id)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
        {(personaOffset > 0 || personaOffset + personaLimit < personaTotal) && (
          <div className="flex items-center justify-between pt-1">
            <button
              onClick={() => setPersonaOffset(o => Math.max(0, o - personaLimit))}
              disabled={personaOffset <= 0}
              className="flex items-center gap-1 text-[11px] tracking-widest uppercase text-secondary disabled:text-muted transition-colors"
            >
              <ChevronLeft size={14} /> Prev
            </button>
            <span className="text-xs text-muted">
              {personaOffset + 1}–{Math.min(personaOffset + personaLimit, personaTotal)} of {personaTotal}
            </span>
            <button
              onClick={() => setPersonaOffset(o => o + personaLimit)}
              disabled={personaOffset + personaLimit >= personaTotal}
              className="flex items-center gap-1 text-[11px] tracking-widest uppercase text-secondary disabled:text-muted transition-colors"
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Danger zone */}
      <div className="bg-surface border border-[var(--error-border)]/40 rounded-lg p-4 space-y-3">
        <h2 className={labelCls}>Danger Zone</h2>
        <p className="text-xs text-muted">
          Purge removes every simulated account and all of its content (cards, comments, likes, follows).
          Cleanup trims the roster down to the configured persona count, removing the newest accounts first.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnDanger} onClick={() => setConfirmCleanup(true)} disabled={cleanupMutation.isPending}>
            {cleanupMutation.isPending ? 'Trimming…' : 'Trim to Persona Count'}
          </button>
          <button type="button" className={btnDanger} onClick={() => setConfirmPurge(true)} disabled={purgeMutation.isPending}>
            {purgeMutation.isPending ? 'Purging…' : 'Purge All'}
          </button>
        </div>
      </div>

      {/* Audit log */}
      <div className="bg-surface border border-subtle rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className={labelCls}>Audit Log</h2>
          <span className="text-xs text-muted">{auditTotal} entries</span>
        </div>
        {auditEntries.length === 0 ? (
          <p className="text-sm text-muted">No admin operations logged yet.</p>
        ) : (
          <div className="space-y-1">
            {auditEntries.map((a) => (
              <div key={a.id} className="flex items-start gap-3 p-2 rounded border border-subtle">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-primary">{AUDIT_LABELS[a.event] ?? a.event}</div>
                  <div className="text-xs text-muted truncate">
                    {new Date(a.created_at).toLocaleString()}
                    {a.detail ? ` · ${a.detail}` : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {(auditOffset > 0 || auditOffset + auditLimit < auditTotal) && (
          <div className="flex items-center justify-between pt-1">
            <button
              onClick={() => setAuditOffset(o => Math.max(0, o - auditLimit))}
              disabled={auditOffset <= 0}
              className="flex items-center gap-1 text-[11px] tracking-widest uppercase text-secondary disabled:text-muted transition-colors"
            >
              <ChevronLeft size={14} /> Prev
            </button>
            <span className="text-xs text-muted">
              {auditOffset + 1}–{Math.min(auditOffset + auditLimit, auditTotal)} of {auditTotal}
            </span>
            <button
              onClick={() => setAuditOffset(o => o + auditLimit)}
              disabled={auditOffset + auditLimit >= auditTotal}
              className="flex items-center gap-1 text-[11px] tracking-widest uppercase text-secondary disabled:text-muted transition-colors"
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Confirm dialogs */}
      <ConfirmDialog
        open={pendingToggle === 'enabled'}
        title={pendingForm?.enabled ? 'Enable simulation?' : 'Disable simulation?'}
        message={
          pendingForm?.enabled
            ? 'Simulated accounts will start posting, liking, commenting and following on the configured schedule.'
            : 'The simulation engine will stop. Existing simulated accounts and content are kept.'
        }
        confirmLabel="Confirm"
        onConfirm={confirmToggle}
        onCancel={() => { setPendingToggle(null); setPendingForm(null) }}
      />
      <ConfirmDialog
        open={pendingToggle === 'interact'}
        title={pendingForm?.interact_with_real_users ? 'Allow interaction with real users?' : 'Restrict to simulated-only?'}
        message={
          pendingForm?.interact_with_real_users
            ? 'Simulated accounts will be able to like, comment on and follow real users\' content.'
            : 'Simulated accounts will only interact with each other\'s content.'
        }
        confirmLabel="Confirm"
        onConfirm={confirmToggle}
        onCancel={() => { setPendingToggle(null); setPendingForm(null) }}
      />
      <ConfirmDialog
        open={confirmPurge}
        title="Purge all simulated accounts?"
        message="This permanently deletes every simulated user and all of their content. This cannot be undone."
        confirmLabel="Purge All"
        onConfirm={() => purgeMutation.mutate()}
        onCancel={() => setConfirmPurge(false)}
      />
      <ConfirmDialog
        open={confirmCleanup}
        title="Trim simulated accounts?"
        message={`Removes the newest excess accounts so only the configured persona count remains. This cannot be undone.`}
        confirmLabel="Trim"
        onConfirm={() => cleanupMutation.mutate()}
        onCancel={() => setConfirmCleanup(false)}
      />
      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Delete this persona?"
        message="The account and all of its content will be permanently removed. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => confirmDeleteId && deletePersonaMutation.mutate(confirmDeleteId)}
        onCancel={() => setConfirmDeleteId(null)}
      />
      <PersonaEditDialog
        open={editingPersona !== null}
        persona={editingPersona}
        pending={savePersonaMutation.isPending}
        onSave={(state) => editingPersona && savePersonaMutation.mutate({ persona: editingPersona, state })}
        onCancel={() => setEditingPersona(null)}
      />
      {joinTarget && (
        <PersonaJoinDialog
          open={joinTarget !== null}
          persona={joinTarget.persona}
          kind={joinTarget.kind}
          pending={joinTarget.kind === 'league' ? joinLeagueMutation.isPending : joinClubMutation.isPending}
          onJoin={(targetId) => {
            if (joinTarget.kind === 'league') {
              joinLeagueMutation.mutate({ persona: joinTarget.persona, targetId })
            } else {
              joinClubMutation.mutate({ persona: joinTarget.persona, targetId })
            }
          }}
          onKindChange={(k) => setJoinTarget({ persona: joinTarget.persona, kind: k })}
          onCancel={() => setJoinTarget(null)}
        />
      )}
    </div>
  )
}
