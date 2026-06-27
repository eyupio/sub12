import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { adminSimulationApi, UpdateSimulationSettingsInput } from '../api/adminSimulation'

const inputCls = 'w-full bg-surface border border-subtle rounded px-3 py-2.5 text-sm text-primary placeholder-muted focus:outline-none focus:border-[var(--brass)]/50 transition-colors'
const labelCls = 't-section-title'
const btnPrimary = 'bg-[var(--brass)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-inverse font-medium text-[11px] tracking-widest uppercase py-2.5 px-4 rounded transition-opacity'
const btnSecondary = 'border border-subtle hover:border-strong text-secondary hover:text-primary text-[11px] tracking-widest uppercase py-2.5 px-4 rounded transition-colors'

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
  active_start_hour: string
  active_end_hour: string
  interact_with_real_users: boolean
  max_cards_per_persona: string
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
  ] as const) {
    const w = num(values[key])
    if (!isInt(values[key]) || w < 0) {
      errors.push(`${label} weight must be a whole number of 0 or more.`)
    }
  }
  if (
    num(values.post_weight) + num(values.like_weight) +
    num(values.comment_weight) + num(values.follow_weight) === 0
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
  return errors
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
    active_start_hour: '0',
    active_end_hour: '24',
    interact_with_real_users: false,
    max_cards_per_persona: '30',
  })
  const [formErrors, setFormErrors] = useState<string[]>([])
  const [serverError, setServerError] = useState<string | null>(null)
  const [saveOk, setSaveOk] = useState<string | null>(null)
  const [runResult, setRunResult] = useState<string | null>(null)
  const [savedSnapshot, setSavedSnapshot] = useState('')

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
      active_start_hour: String(data.active_start_hour),
      active_end_hour: String(data.active_end_hour),
      interact_with_real_users: data.interact_with_real_users,
      max_cards_per_persona: String(data.max_cards_per_persona),
    }
    setForm(next)
    setSavedSnapshot(JSON.stringify(next))
  }, [data])

  const isDirty = useMemo(() => JSON.stringify(form) !== savedSnapshot, [form, savedSnapshot])

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
        active_start_hour: String(updated.active_start_hour),
        active_end_hour: String(updated.active_end_hour),
        interact_with_real_users: updated.interact_with_real_users,
        max_cards_per_persona: String(updated.max_cards_per_persona),
      }
      setForm(next)
      setSavedSnapshot(JSON.stringify(next))
      setSaveOk('Saved simulation settings.')
      setServerError(null)
      queryClient.invalidateQueries({ queryKey: ['admin-simulation-status'] })
      setTimeout(() => setSaveOk(null), 2500)
    },
    onError: (err) => {
      setServerError(parseError(err))
      setSaveOk(null)
    },
  })

  const runMutation = useMutation({
    mutationFn: adminSimulationApi.runNow,
    onSuccess: (res) => {
      setRunResult(`Performed ${res.performed} action${res.performed === 1 ? '' : 's'}.`)
      setServerError(null)
      queryClient.invalidateQueries({ queryKey: ['admin-simulation-status'] })
    },
    onError: (err) => {
      setRunResult(null)
      setServerError(parseError(err))
    },
  })

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setServerError(null)
    setRunResult(null)
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
      active_start_hour: Number(form.active_start_hour),
      active_end_hour: Number(form.active_end_hour),
      interact_with_real_users: form.interact_with_real_users,
      max_cards_per_persona: Number(form.max_cards_per_persona),
    })
  }

  if (isLoading) {
    return <div className="p-6 text-sm text-muted">Loading simulation settings…</div>
  }
  if (error) {
    return <div className="p-6 text-sm text-[var(--error-text)]">{parseError(error)}</div>
  }

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

      <div className="bg-surface border border-subtle rounded-lg p-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <div className={labelCls}>Status</div>
          <div className="text-sm text-primary mt-1">{status?.enabled ? 'Enabled' : 'Disabled'}</div>
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
      </div>

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
          <input type="checkbox" checked={form.enabled} onChange={(e) => updateField('enabled', e.target.checked)} />
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
          <p className="text-xs text-muted mb-2">Relative likelihood of each action type.</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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

        <div className="space-y-1">
          <label className={labelCls} htmlFor="max-cards">Max Cards Per Persona</label>
          <input id="max-cards" value={form.max_cards_per_persona} onChange={(e) => updateField('max_cards_per_persona', e.target.value)} className={inputCls} inputMode="numeric" />
          <p className="text-xs text-muted">Caps how many score cards each simulated account posts (0 = unlimited).</p>
        </div>

        <label className="text-sm text-secondary inline-flex items-center gap-2">
          <input type="checkbox" checked={form.interact_with_real_users} onChange={(e) => updateField('interact_with_real_users', e.target.checked)} />
          Allow simulated accounts to like, comment on and follow real users
        </label>
        <p className="text-xs text-muted -mt-2">
          When off, simulated accounts only interact with each other's content.
        </p>

        <div className="flex flex-wrap gap-2">
          <button type="submit" className={btnPrimary} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? 'Saving…' : 'Save Settings'}
          </button>
          <button type="button" className={btnSecondary} disabled={runMutation.isPending} onClick={() => runMutation.mutate()}>
            {runMutation.isPending ? 'Running…' : 'Run Now'}
          </button>
          {isDirty && <span className="text-xs text-amber-400 self-center">You have unsaved changes.</span>}
        </div>
      </form>
    </div>
  )
}
