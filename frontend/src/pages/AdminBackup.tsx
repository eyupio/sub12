import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  adminBackupApi,
  BackupRun,
  BackupSettings,
  UpdateBackupSettingsInput,
} from '../api/adminBackup'
import { useAuthStore } from '../store/auth'
import { ConfirmDialog } from '../components/ConfirmDialog'

const inputCls = 'w-full bg-surface border border-subtle rounded px-3 py-2.5 text-sm text-primary placeholder-muted focus:outline-none focus:border-[var(--brass)]/50 transition-colors'
const labelCls = 't-section-title'
const btnPrimary = 'bg-[var(--brass)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-inverse font-medium text-[11px] tracking-widest uppercase py-2.5 px-4 rounded transition-opacity'
const btnSecondary = 'border border-subtle hover:border-strong text-secondary hover:text-primary text-[11px] tracking-widest uppercase py-2.5 px-4 rounded transition-colors'
const btnDanger = 'border border-[var(--error-border)] hover:bg-[var(--error-bg)] text-[var(--error-text)] text-[11px] tracking-widest uppercase py-2.5 px-4 rounded transition-colors'

interface FormState {
  enabled: boolean
  frequency: BackupSettings['frequency']
  hour_of_day: string
  day_of_week: string
  destination: BackupSettings['destination']
  local_path: string
  s3_endpoint: string
  s3_region: string
  s3_bucket: string
  s3_prefix: string
  s3_access_key: string
  s3_secret_key: string
  s3_use_ssl: boolean
  s3_path_style: boolean
  passphrase: string
  retain_count: string
  retain_days: string
  updateAccessKey: boolean
  updateSecretKey: boolean
  updatePassphrase: boolean
}

const blankForm: FormState = {
  enabled: false,
  frequency: 'daily',
  hour_of_day: '3',
  day_of_week: '0',
  destination: 'local',
  local_path: '/var/lib/sub12/backups',
  s3_endpoint: '',
  s3_region: '',
  s3_bucket: '',
  s3_prefix: '',
  s3_access_key: '',
  s3_secret_key: '',
  s3_use_ssl: true,
  s3_path_style: false,
  passphrase: '',
  retain_count: '7',
  retain_days: '30',
  updateAccessKey: false,
  updateSecretKey: false,
  updatePassphrase: false,
}

function parseError(error: unknown): string {
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

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function formatDate(s?: string): string {
  if (!s) return '—'
  try {
    return new Date(s).toLocaleString()
  } catch {
    return s
  }
}

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

type ConfirmAction =
  | { type: 'restore'; run: BackupRun }
  | { type: 'delete'; run: BackupRun }
  | { type: 'upload-restore'; file: File }

export default function AdminBackup() {
  const qc = useQueryClient()
  const [form, setForm] = useState<FormState>(blankForm)
  const [savedSnapshot, setSavedSnapshot] = useState<string>('')
  const [serverError, setServerError] = useState<string | null>(null)
  const [saveOk, setSaveOk] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [runResult, setRunResult] = useState<string | null>(null)
  const [hasAccessKey, setHasAccessKey] = useState(false)
  const [hasSecretKey, setHasSecretKey] = useState(false)
  const [hasPassphrase, setHasPassphrase] = useState(false)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-backup-settings'],
    queryFn: () => adminBackupApi.getSettings(),
    retry: false,
  })

  useEffect(() => {
    if (!data) return
    const next: FormState = {
      enabled: data.enabled,
      frequency: data.frequency,
      hour_of_day: String(data.hour_of_day),
      day_of_week: String(data.day_of_week),
      destination: data.destination,
      local_path: data.local_path,
      s3_endpoint: data.s3_endpoint ?? '',
      s3_region: data.s3_region ?? '',
      s3_bucket: data.s3_bucket ?? '',
      s3_prefix: data.s3_prefix ?? '',
      s3_access_key: '',
      s3_secret_key: '',
      s3_use_ssl: data.s3_use_ssl,
      s3_path_style: data.s3_path_style,
      passphrase: '',
      retain_count: String(data.retain_count),
      retain_days: String(data.retain_days),
      updateAccessKey: false,
      updateSecretKey: false,
      updatePassphrase: false,
    }
    setForm(next)
    setSavedSnapshot(JSON.stringify(next))
    setHasAccessKey(data.has_s3_access_key)
    setHasSecretKey(data.has_s3_secret_key)
    setHasPassphrase(data.has_passphrase)
  }, [data])

  const isDirty = useMemo(() => JSON.stringify(form) !== savedSnapshot, [form, savedSnapshot])

  const runsQuery = useQuery({
    queryKey: ['admin-backup-runs'],
    queryFn: () => adminBackupApi.listRuns(50, 0),
    refetchInterval: 5000,
  })

  function buildPayload(): UpdateBackupSettingsInput {
    return {
      enabled: form.enabled,
      frequency: form.frequency,
      hour_of_day: Number(form.hour_of_day) || 0,
      day_of_week: Number(form.day_of_week) || 0,
      destination: form.destination,
      local_path: form.local_path.trim(),
      s3_endpoint: form.s3_endpoint.trim() || null,
      s3_region: form.s3_region.trim() || null,
      s3_bucket: form.s3_bucket.trim() || null,
      s3_prefix: form.s3_prefix.trim() || null,
      s3_access_key: form.updateAccessKey || !hasAccessKey ? form.s3_access_key || null : null,
      s3_secret_key: form.updateSecretKey || !hasSecretKey ? form.s3_secret_key || null : null,
      s3_use_ssl: form.s3_use_ssl,
      s3_path_style: form.s3_path_style,
      passphrase: form.updatePassphrase || !hasPassphrase ? form.passphrase || null : null,
      retain_count: Number(form.retain_count) || 0,
      retain_days: Number(form.retain_days) || 0,
    }
  }

  const saveMutation = useMutation({
    mutationFn: () => adminBackupApi.patchSettings(buildPayload()),
    onSuccess: (updated) => {
      qc.setQueryData(['admin-backup-settings'], updated)
      setSaveOk('Saved backup settings.')
      setServerError(null)
      setTimeout(() => setSaveOk(null), 2500)
    },
    onError: (err) => setServerError(parseError(err)),
  })

  const testMutation = useMutation({
    mutationFn: () => adminBackupApi.testS3(buildPayload()),
    onSuccess: (res) => {
      setTestResult((res.ok ? 'S3 OK: ' : 'S3 failed: ') + res.message)
      setServerError(null)
    },
    onError: (err) => setServerError(parseError(err)),
  })

  const runMutation = useMutation({
    mutationFn: () => adminBackupApi.run(),
    onSuccess: (run) => {
      setRunResult(`Backup ${run.status}: ${run.filename} (${formatBytes(run.size_bytes)})`)
      qc.invalidateQueries({ queryKey: ['admin-backup-runs'] })
      qc.invalidateQueries({ queryKey: ['admin-backup-settings'] })
    },
    onError: (err) => {
      setRunResult(null)
      setServerError(parseError(err))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminBackupApi.deleteRun(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-backup-runs'] }),
    onError: (err) => setServerError(parseError(err)),
    onSettled: () => setConfirmAction(null),
  })

  const restoreMutation = useMutation({
    mutationFn: (id: string) => adminBackupApi.restoreFromRun(id),
    onSuccess: () => setRunResult('Restore complete.'),
    onError: (err) => setServerError(parseError(err)),
    onSettled: () => setConfirmAction(null),
  })

  const uploadRestoreMutation = useMutation({
    mutationFn: (file: File) => adminBackupApi.restoreUpload(file),
    onSuccess: () => setRunResult('Restore from upload complete.'),
    onError: (err) => setServerError(parseError(err)),
    onSettled: () => setConfirmAction(null),
  })

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setServerError(null)
    setTestResult(null)
    saveMutation.mutate()
  }

  function handleDownload(run: BackupRun) {
    const url = adminBackupApi.downloadUrl(run.id)
    const token = useAuthStore.getState().accessToken
    fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : undefined })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Download failed: ${res.status}`)
        const blob = await res.blob()
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = run.filename
        document.body.appendChild(a)
        a.click()
        a.remove()
      })
      .catch((err) => setServerError(parseError(err)))
  }

  function handleRestoreClick(run: BackupRun) {
    setConfirmAction({ type: 'restore', run })
  }

  function handleDeleteClick(run: BackupRun) {
    setConfirmAction({ type: 'delete', run })
  }

  function handleUploadRestore() {
    const f = fileInputRef.current?.files?.[0]
    if (!f) return
    setConfirmAction({ type: 'upload-restore', file: f })
  }

  function handleConfirm() {
    if (!confirmAction) return
    if (confirmAction.type === 'restore') restoreMutation.mutate(confirmAction.run.id)
    else if (confirmAction.type === 'delete') deleteMutation.mutate(confirmAction.run.id)
    else uploadRestoreMutation.mutate(confirmAction.file)
  }

  const confirmPending =
    confirmAction?.type === 'restore' ? restoreMutation.isPending :
    confirmAction?.type === 'delete' ? deleteMutation.isPending :
    confirmAction?.type === 'upload-restore' ? uploadRestoreMutation.isPending : false

  if (isLoading) return <div className="p-6 text-sm text-muted">Loading backup settings…</div>
  if (error) return <div className="p-6 text-sm text-[var(--error-text)]">{parseError(error)}</div>

  const showS3 = form.destination === 's3' || form.destination === 'both'
  const showLocal = form.destination === 'local' || form.destination === 'both'

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-5">
      <div>
        <h1 className="t-page-title">Admin • Backups</h1>
        <p className="text-sm text-muted mt-1">Schedule, download, and restore site-wide PostgreSQL backups.</p>
      </div>

      {serverError && (
        <div className="bg-[var(--error-bg)] border border-[var(--error-border)] text-[var(--error-text)] text-sm rounded p-3">
          {serverError}
        </div>
      )}
      {saveOk && <p className="text-green-400 text-sm">{saveOk}</p>}
      {testResult && <p className="text-sm text-secondary">{testResult}</p>}
      {runResult && <p className="text-sm text-secondary">{runResult}</p>}

      <form onSubmit={handleSubmit} className="bg-surface border border-subtle rounded-lg p-4 space-y-4">
        <h2 className="t-section-title">Schedule</h2>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.enabled} onChange={(e) => updateField('enabled', e.target.checked)} />
          Enable scheduled backups
        </label>

        <div className="grid md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className={labelCls}>Frequency</label>
            <select className={inputCls} value={form.frequency} onChange={(e) => updateField('frequency', e.target.value as BackupSettings['frequency'])}>
              <option value="disabled">Disabled</option>
              <option value="hourly">Hourly</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className={labelCls}>Hour of day (UTC)</label>
            <input className={inputCls} value={form.hour_of_day} onChange={(e) => updateField('hour_of_day', e.target.value)} inputMode="numeric" />
          </div>
          {form.frequency === 'weekly' && (
            <div className="space-y-1">
              <label className={labelCls}>Day of week</label>
              <select className={inputCls} value={form.day_of_week} onChange={(e) => updateField('day_of_week', e.target.value)}>
                {dayNames.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
            </div>
          )}
        </div>

        <h2 className="t-section-title pt-2">Destination</h2>
        <div className="space-y-1">
          <label className={labelCls}>Destination</label>
          <select className={inputCls} value={form.destination} onChange={(e) => updateField('destination', e.target.value as BackupSettings['destination'])}>
            <option value="local">Local disk</option>
            <option value="s3">S3-compatible</option>
            <option value="both">Both</option>
          </select>
        </div>

        {showLocal && (
          <div className="space-y-1">
            <label className={labelCls}>Local path</label>
            <input className={inputCls} value={form.local_path} onChange={(e) => updateField('local_path', e.target.value)} placeholder="/var/lib/sub12/backups" />
          </div>
        )}

        {showS3 && (
          <div className="space-y-3 border border-subtle rounded p-3">
            <div className="grid md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className={labelCls}>Endpoint</label>
                <input className={inputCls} value={form.s3_endpoint} onChange={(e) => updateField('s3_endpoint', e.target.value)} placeholder="s3.amazonaws.com or minio.local:9000" />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>Region</label>
                <input className={inputCls} value={form.s3_region} onChange={(e) => updateField('s3_region', e.target.value)} placeholder="us-east-1" />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>Bucket</label>
                <input className={inputCls} value={form.s3_bucket} onChange={(e) => updateField('s3_bucket', e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>Prefix (optional)</label>
                <input className={inputCls} value={form.s3_prefix} onChange={(e) => updateField('s3_prefix', e.target.value)} placeholder="prod/backups" />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>
                  Access key {hasAccessKey && !form.updateAccessKey && <span className="text-muted">(saved)</span>}
                </label>
                <input className={inputCls} type="password" autoComplete="off" value={form.s3_access_key}
                  disabled={hasAccessKey && !form.updateAccessKey}
                  onChange={(e) => updateField('s3_access_key', e.target.value)} />
                {hasAccessKey && (
                  <label className="text-xs text-muted flex items-center gap-1">
                    <input type="checkbox" checked={form.updateAccessKey} onChange={(e) => updateField('updateAccessKey', e.target.checked)} />
                    Replace saved key
                  </label>
                )}
              </div>
              <div className="space-y-1">
                <label className={labelCls}>
                  Secret key {hasSecretKey && !form.updateSecretKey && <span className="text-muted">(saved)</span>}
                </label>
                <input className={inputCls} type="password" autoComplete="off" value={form.s3_secret_key}
                  disabled={hasSecretKey && !form.updateSecretKey}
                  onChange={(e) => updateField('s3_secret_key', e.target.value)} />
                {hasSecretKey && (
                  <label className="text-xs text-muted flex items-center gap-1">
                    <input type="checkbox" checked={form.updateSecretKey} onChange={(e) => updateField('updateSecretKey', e.target.checked)} />
                    Replace saved key
                  </label>
                )}
              </div>
            </div>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.s3_use_ssl} onChange={(e) => updateField('s3_use_ssl', e.target.checked)} />
                Use HTTPS
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.s3_path_style} onChange={(e) => updateField('s3_path_style', e.target.checked)} />
                Path-style URLs
              </label>
              <button type="button" className={btnSecondary} disabled={testMutation.isPending}
                onClick={() => testMutation.mutate()}>
                {testMutation.isPending ? 'Testing…' : 'Test S3'}
              </button>
            </div>
          </div>
        )}

        <h2 className="t-section-title pt-2">Encryption</h2>
        <div className="space-y-1">
          <label className={labelCls}>
            Passphrase {hasPassphrase && !form.updatePassphrase && <span className="text-muted">(saved)</span>}
          </label>
          <input className={inputCls} type="password" autoComplete="off" value={form.passphrase}
            disabled={hasPassphrase && !form.updatePassphrase}
            onChange={(e) => updateField('passphrase', e.target.value)} />
          {hasPassphrase && (
            <label className="text-xs text-muted flex items-center gap-1">
              <input type="checkbox" checked={form.updatePassphrase} onChange={(e) => updateField('updatePassphrase', e.target.checked)} />
              Replace saved passphrase
            </label>
          )}
          <p className="text-xs text-muted mt-1">Required. Backups are AES-256 encrypted with this passphrase. Losing it makes restores impossible.</p>
        </div>

        <h2 className="t-section-title pt-2">Retention</h2>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className={labelCls}>Keep at most (count)</label>
            <input className={inputCls} value={form.retain_count} onChange={(e) => updateField('retain_count', e.target.value)} inputMode="numeric" />
            <p className="text-xs text-muted">0 = no count limit</p>
          </div>
          <div className="space-y-1">
            <label className={labelCls}>Delete older than (days)</label>
            <input className={inputCls} value={form.retain_days} onChange={(e) => updateField('retain_days', e.target.value)} inputMode="numeric" />
            <p className="text-xs text-muted">0 = no age limit</p>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button type="submit" disabled={!isDirty || saveMutation.isPending} className={btnPrimary}>
            {saveMutation.isPending ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </form>

      <div className="bg-surface border border-subtle rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="t-section-title">Run now</h2>
          <button type="button" onClick={() => runMutation.mutate()} disabled={runMutation.isPending} className={btnPrimary}>
            {runMutation.isPending ? 'Running…' : 'Trigger backup'}
          </button>
        </div>
        {data?.last_run_at && (
          <p className="text-sm text-muted">
            Last run: {formatDate(data.last_run_at)} — {data.last_run_status}
            {data.last_run_error ? ` — ${data.last_run_error}` : ''}
          </p>
        )}
      </div>

      <div className="bg-surface border border-subtle rounded-lg p-4 space-y-3">
        <h2 className="t-section-title">Restore from upload</h2>
        <input type="file" ref={fileInputRef} className="text-sm text-secondary" />
        <button type="button" onClick={handleUploadRestore} disabled={uploadRestoreMutation.isPending} className={btnDanger}>
          {uploadRestoreMutation.isPending ? 'Restoring…' : 'Upload and restore'}
        </button>
      </div>

      <div className="bg-surface border border-subtle rounded-lg p-4 space-y-3">
        <h2 className="t-section-title">History</h2>
        {runsQuery.isLoading && <p className="text-sm text-muted">Loading…</p>}
        {runsQuery.data?.items?.length === 0 && <p className="text-sm text-muted">No backups yet.</p>}
        {runsQuery.data && runsQuery.data.items?.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted text-xs uppercase">
                <tr>
                  <th className="py-2 pr-3">Started</th>
                  <th className="py-2 pr-3">Trigger</th>
                  <th className="py-2 pr-3">Dest.</th>
                  <th className="py-2 pr-3">Size</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Filename</th>
                  <th className="py-2 pr-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {runsQuery.data.items.map((run) => (
                  <tr key={run.id} className="border-t border-subtle">
                    <td className="py-2 pr-3 whitespace-nowrap">{formatDate(run.started_at)}</td>
                    <td className="py-2 pr-3">{run.trigger}</td>
                    <td className="py-2 pr-3">{run.destination}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{formatBytes(run.size_bytes)}</td>
                    <td className="py-2 pr-3">
                      <span className={
                        run.status === 'success' ? 'text-green-400' :
                        run.status === 'failed' ? 'text-[var(--error-text)]' : 'text-secondary'
                      }>{run.status}</span>
                    </td>
                    <td className="py-2 pr-3 truncate max-w-[200px]" title={run.filename}>{run.filename}</td>
                    <td className="py-2 pr-3 text-right space-x-2 whitespace-nowrap">
                      {run.status === 'success' && (
                        <>
                          <button type="button" className={btnSecondary} onClick={() => handleDownload(run)}>Download</button>
                          <button type="button" className={btnDanger} onClick={() => handleRestoreClick(run)}>Restore</button>
                        </>
                      )}
                      <button type="button" className={btnDanger} onClick={() => handleDeleteClick(run)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmAction !== null}
        title={
          confirmAction?.type === 'restore' ? `Restore from "${confirmAction.run.filename}"?` :
          confirmAction?.type === 'delete' ? `Delete backup "${confirmAction.run.filename}"?` :
          confirmAction?.type === 'upload-restore' ? `Restore from uploaded file "${confirmAction.file.name}"?` : ''
        }
        message={
          confirmAction?.type === 'delete'
            ? 'This removes the file from disk and S3.'
            : 'This will OVERWRITE all current data.'
        }
        confirmLabel={confirmAction?.type === 'delete' ? 'Delete' : 'Restore'}
        confirmDisabled={confirmPending}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  )
}
