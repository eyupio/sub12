import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { adminEmailApi, UpdateSMTPSettingsInput } from '../api/adminEmail'
import { SMTPSettingsFormState, validateSMTPSettingsForm } from './adminEmailValidation'
import { SkeletonPage } from '../components/Skeleton'

const inputCls = 'w-full bg-surface border border-subtle rounded px-3 py-2.5 text-sm text-primary placeholder-muted focus:outline-none focus:border-[var(--brass)]/50 transition-colors'
const labelCls = 't-section-title'
const btnPrimary = 'btn-brass disabled:opacity-50 disabled:cursor-not-allowed text-inverse font-medium text-[11px] tracking-widest uppercase py-2.5 px-4 rounded transition-all'
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

export default function AdminEmailSettings() {
  const [form, setForm] = useState<SMTPSettingsFormState>({
    host: '',
    port: '587',
    username: '',
    password: '',
    from_email: '',
    from_name: '',
    use_tls: false,
    use_starttls: true,
    updatePassword: false,
  })
  const [formErrors, setFormErrors] = useState<string[]>([])
  const [serverError, setServerError] = useState<string | null>(null)
  const [saveOk, setSaveOk] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [hasPersistedPassword, setHasPersistedPassword] = useState(false)
  const [savedSnapshot, setSavedSnapshot] = useState<string>('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-email-settings'],
    queryFn: async () => {
      try {
        return await adminEmailApi.getSettings()
      } catch (err) {
        if (err instanceof Error && err.message.includes('API error 404')) return null
        throw err
      }
    },
    retry: false,
  })

  useEffect(() => {
    if (!data) return

    const next = {
      host: data.host ?? '',
      port: String(data.port ?? 587),
      username: data.username ?? '',
      password: '',
      from_email: data.from_email ?? '',
      from_name: data.from_name ?? '',
      use_tls: data.use_tls,
      use_starttls: data.use_starttls,
      updatePassword: false,
    }
    setForm(next)
    setHasPersistedPassword(data.has_password)
    setSavedSnapshot(JSON.stringify(next))
  }, [data])

  const isDirty = useMemo(() => JSON.stringify(form) !== savedSnapshot, [form, savedSnapshot])

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [isDirty])

  const saveMutation = useMutation({
    mutationFn: (payload: UpdateSMTPSettingsInput) => adminEmailApi.patchSettings(payload),
    onSuccess: (updated) => {
      const next = {
        host: updated.host,
        port: String(updated.port),
        username: updated.username ?? '',
        password: '',
        from_email: updated.from_email,
        from_name: updated.from_name ?? '',
        use_tls: updated.use_tls,
        use_starttls: updated.use_starttls,
        updatePassword: false,
      }
      setForm(next)
      setSavedSnapshot(JSON.stringify(next))
      setHasPersistedPassword(updated.has_password)
      setSaveOk('Saved SMTP settings.')
      setServerError(null)
      setTimeout(() => setSaveOk(null), 2500)
    },
    onError: (err) => {
      setServerError(parseError(err))
      setSaveOk(null)
    },
  })

  const testMutation = useMutation({
    mutationFn: adminEmailApi.testSettings,
    onSuccess: (result) => {
      if (result.ok) {
        setTestResult(`Test succeeded: ${result.message} (${result.host}:${result.port})`)
      } else {
        setTestResult(`Test failed: ${result.message} (${result.host}:${result.port})`)
      }
      setServerError(null)
    },
    onError: (err) => {
      setTestResult(null)
      setServerError(parseError(err))
    },
  })

  function updateField<K extends keyof SMTPSettingsFormState>(key: K, value: SMTPSettingsFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setServerError(null)
    setTestResult(null)

    const errors = validateSMTPSettingsForm(form)
    setFormErrors(errors)
    if (errors.length > 0) return

    const sendPassword = form.updatePassword || !hasPersistedPassword
    saveMutation.mutate({
      host: form.host.trim(),
      port: Number(form.port),
      username: form.username.trim() || undefined,
      password_encrypted: sendPassword ? form.password || undefined : undefined,
      from_email: form.from_email.trim(),
      from_name: form.from_name.trim() || undefined,
      use_tls: form.use_tls,
      use_starttls: form.use_starttls,
    })
  }

  if (isLoading) {
    return <SkeletonPage />
  }

  if (error) {
    return <div className="p-6 text-sm text-[var(--error-text)]">{parseError(error)}</div>
  }

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-5">
      <div>
        <h1 className="t-page-title">Admin • Email Settings</h1>
        <p className="text-sm text-muted mt-1">Manage SMTP connection and sender defaults.</p>
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
        {testResult && <p className="text-sm text-secondary">{testResult}</p>}

        <div className="grid md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className={labelCls} htmlFor="smtp-host">Host</label>
            <input id="smtp-host" value={form.host} onChange={(e) => updateField('host', e.target.value)} className={inputCls} />
          </div>
          <div className="space-y-1">
            <label className={labelCls} htmlFor="smtp-port">Port</label>
            <input id="smtp-port" value={form.port} onChange={(e) => updateField('port', e.target.value)} className={inputCls} inputMode="numeric" />
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className={labelCls} htmlFor="smtp-username">Username</label>
            <input id="smtp-username" value={form.username} onChange={(e) => updateField('username', e.target.value)} className={inputCls} />
          </div>

          <div className="space-y-1">
            <label className={labelCls}>Password</label>
            {hasPersistedPassword && !form.updatePassword ? (
              <div className="flex items-center gap-2">
                <div className={`${inputCls} text-muted`}>Stored (hidden)</div>
                <button type="button" className={btnSecondary} onClick={() => updateField('updatePassword', true)}>
                  Update Password
                </button>
              </div>
            ) : (
              <input
                type="password"
                value={form.password}
                onChange={(e) => updateField('password', e.target.value)}
                className={inputCls}
                placeholder={hasPersistedPassword ? 'Enter new password' : 'Enter password'}
              />
            )}
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className={labelCls} htmlFor="from-email">From Email</label>
            <input id="from-email" type="email" value={form.from_email} onChange={(e) => updateField('from_email', e.target.value)} className={inputCls} />
          </div>
          <div className="space-y-1">
            <label className={labelCls} htmlFor="from-name">From Name</label>
            <input id="from-name" value={form.from_name} onChange={(e) => updateField('from_name', e.target.value)} className={inputCls} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <label className="text-sm text-secondary inline-flex items-center gap-2">
            <input type="checkbox" checked={form.use_tls} onChange={(e) => updateField('use_tls', e.target.checked)} />
            Use TLS
          </label>
          <label className="text-sm text-secondary inline-flex items-center gap-2">
            <input type="checkbox" checked={form.use_starttls} onChange={(e) => updateField('use_starttls', e.target.checked)} />
            Use STARTTLS
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="submit" className={btnPrimary} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? 'Saving…' : 'Save Settings'}
          </button>
          <button type="button" className={btnSecondary} disabled={testMutation.isPending} onClick={() => testMutation.mutate()}>
            {testMutation.isPending ? 'Testing...' : 'Test Send'}
          </button>
          {isDirty && <span className="text-xs text-amber-400 self-center">You have unsaved changes.</span>}
        </div>
      </form>
    </div>
  )
}
