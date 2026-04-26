import { useState, FormEvent } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ShieldCheck, ShieldOff, Copy, Download, KeyRound } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { ApiError } from '../api/client'
import { twoFactorApi, type EnrollBeginResponse } from '../api/twoFactor'
import { useAuthStore } from '../store/auth'
import { toast } from '../store/toast'
import { ConfirmDialog } from '../components/ConfirmDialog'

type EnrollStep = 'idle' | 'qr' | 'codes'
type DisableMode = 'password' | 'code'

export default function SecuritySettings() {
  const queryClient = useQueryClient()
  const updateUser = useAuthStore((s) => s.updateUser)

  const { data: status, isLoading } = useQuery({
    queryKey: ['2fa-status'],
    queryFn: () => twoFactorApi.getStatus(),
  })

  // Enrollment
  const [enrollStep, setEnrollStep] = useState<EnrollStep>('idle')
  const [enrollData, setEnrollData] = useState<EnrollBeginResponse | null>(null)
  const [confirmCode, setConfirmCode] = useState('')
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [newBackupCodes, setNewBackupCodes] = useState<string[]>([])
  const [savedAck, setSavedAck] = useState(false)

  // Disable: two steps - warning dialog, then re-auth form
  const [disableWarnOpen, setDisableWarnOpen] = useState(false)
  const [disableFormOpen, setDisableFormOpen] = useState(false)
  const [disableMode, setDisableMode] = useState<DisableMode>('password')
  const [disableSecret, setDisableSecret] = useState('')
  const [disableError, setDisableError] = useState<string | null>(null)

  // Regenerate
  const [regenOpen, setRegenOpen] = useState(false)
  const [regenCode, setRegenCode] = useState('')
  const [regenError, setRegenError] = useState<string | null>(null)
  const [regenCodes, setRegenCodes] = useState<string[]>([])

  const beginMutation = useMutation({
    mutationFn: () => twoFactorApi.enrollBegin(),
    onSuccess: (data) => {
      setEnrollData(data)
      setConfirmCode('')
      setConfirmError(null)
      setEnrollStep('qr')
    },
    onError: (err) => {
      toast(err instanceof ApiError ? err.message : 'Failed to start enrollment', 'error')
    },
  })

  const confirmMutation = useMutation({
    mutationFn: (code: string) => twoFactorApi.enrollConfirm(code),
    onSuccess: (data) => {
      setNewBackupCodes(data.backup_codes)
      setSavedAck(false)
      setEnrollStep('codes')
      updateUser({ totp_enabled: true })
      queryClient.invalidateQueries({ queryKey: ['2fa-status'] })
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setConfirmError(err.message || 'Invalid code')
      } else {
        setConfirmError('Failed to verify code')
      }
    },
  })

  const disableMutation = useMutation({
    mutationFn: (input: { password?: string; code?: string }) => twoFactorApi.disable(input),
    onSuccess: () => {
      toast('Two-factor authentication disabled', 'success')
      setDisableFormOpen(false)
      setDisableSecret('')
      setDisableError(null)
      updateUser({ totp_enabled: false })
      queryClient.invalidateQueries({ queryKey: ['2fa-status'] })
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setDisableError(err.message || 'Could not disable 2FA')
      } else {
        setDisableError('Could not disable 2FA')
      }
    },
  })

  const regenMutation = useMutation({
    mutationFn: (code: string) => twoFactorApi.regenerateBackupCodes(code),
    onSuccess: (data) => {
      setRegenCodes(data.backup_codes)
      setRegenCode('')
      setRegenError(null)
      queryClient.invalidateQueries({ queryKey: ['2fa-status'] })
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setRegenError(err.message || 'Invalid code')
      } else {
        setRegenError('Could not regenerate codes')
      }
    },
  })

  function handleConfirm(e: FormEvent) {
    e.preventDefault()
    if (!confirmCode.trim()) return
    confirmMutation.mutate(confirmCode.trim())
  }

  function handleDisable(e: FormEvent) {
    e.preventDefault()
    setDisableError(null)
    if (!disableSecret.trim()) {
      setDisableError(disableMode === 'password' ? 'Password is required' : 'Code is required')
      return
    }
    disableMutation.mutate(
      disableMode === 'password' ? { password: disableSecret } : { code: disableSecret.trim() },
    )
  }

  function handleRegenSubmit(e: FormEvent) {
    e.preventDefault()
    if (!regenCode.trim()) return
    regenMutation.mutate(regenCode.trim())
  }

  function copyCodes(codes: string[]) {
    navigator.clipboard.writeText(codes.join('\n'))
      .then(() => toast('Backup codes copied to clipboard', 'success'))
      .catch(() => toast('Could not copy to clipboard', 'error'))
  }

  function downloadCodes(codes: string[]) {
    const blob = new Blob([`SUB12 backup codes\n\n${codes.join('\n')}\n`], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sub12-backup-codes-${new Date().toISOString().slice(0, 10)}.txt`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  function finishEnrollment() {
    setEnrollStep('idle')
    setEnrollData(null)
    setConfirmCode('')
    setNewBackupCodes([])
    setSavedAck(false)
  }

  const inputCls = 'w-full bg-surface border border-subtle rounded px-3 py-2 text-sm text-primary placeholder-muted focus:outline-none focus:border-[var(--brass)]'

  return (
    <div className="p-4 lg:p-8 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <Link
          to="/profile"
          className="text-muted hover:text-secondary transition-colors"
          aria-label="Back to profile"
        >
          <ChevronLeft size={18} />
        </Link>
        <h1 className="text-xl lg:text-2xl font-medium tracking-widest uppercase text-secondary">Security</h1>
      </div>

      <section className="space-y-3 p-4 rounded border border-subtle bg-surface">
        <h2 className="text-[11px] tracking-widest uppercase text-muted flex items-center gap-2">
          <ShieldCheck size={12} /> Two-factor authentication
        </h2>

        {isLoading && <p className="text-xs text-muted">Loading…</p>}

        {!isLoading && status && !status.enabled && enrollStep === 'idle' && (
          <>
            <p className="text-sm text-muted">
              Add a second step at sign-in using an authenticator app like Google Authenticator,
              Authy, or 1Password. We strongly recommend it.
            </p>
            <button
              onClick={() => beginMutation.mutate()}
              disabled={beginMutation.isPending}
              className="px-4 py-2 rounded bg-[var(--brass)] text-inverse text-[11px] tracking-widest uppercase font-medium disabled:opacity-50"
            >
              {beginMutation.isPending ? 'Starting…' : 'Enable 2FA'}
            </button>
          </>
        )}

        {!isLoading && status && status.enabled && enrollStep === 'idle' && (
          <>
            <p className="text-sm text-secondary">
              <span className="text-[var(--brass)]">●</span> Two-factor authentication is{' '}
              <strong>enabled</strong>.
            </p>
            {status.enrolled_at && (
              <p className="text-xs text-muted">
                Set up on {new Date(status.enrolled_at).toLocaleDateString()}.
              </p>
            )}
            <p className="text-xs text-muted">
              {status.backup_codes_remaining} unused backup code{status.backup_codes_remaining === 1 ? '' : 's'} remaining.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                onClick={() => { setRegenOpen(true); setRegenCode(''); setRegenError(null); setRegenCodes([]) }}
                className="px-3 py-1.5 rounded border border-subtle text-[11px] tracking-widest uppercase text-secondary hover:text-[var(--brass)] hover:border-[var(--brass)]/40 transition-colors"
              >
                <KeyRound size={12} className="inline mr-1" />
                Regenerate backup codes
              </button>
              <button
                onClick={() => { setDisableWarnOpen(true); setDisableSecret(''); setDisableError(null); setDisableMode('password') }}
                className="px-3 py-1.5 rounded border border-[var(--error-text)]/30 text-[11px] tracking-widest uppercase text-[var(--error-text)] hover:bg-[var(--error-bg)] transition-colors"
              >
                <ShieldOff size={12} className="inline mr-1" />
                Disable 2FA
              </button>
            </div>
          </>
        )}

        {enrollStep === 'qr' && enrollData && (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Scan this QR code with your authenticator app, then enter the 6-digit code it shows.
            </p>
            <div className="flex justify-center bg-white p-4 rounded">
              <QRCodeSVG value={enrollData.otpauth_uri} size={192} level="M" />
            </div>
            <details className="text-xs text-muted">
              <summary className="cursor-pointer hover:text-secondary">Can't scan? Enter the secret manually</summary>
              <pre className="mt-2 bg-page border border-subtle rounded p-2 font-mono text-[11px] text-secondary break-all whitespace-pre-wrap">{enrollData.secret}</pre>
            </details>

            <form onSubmit={handleConfirm} className="space-y-2">
              <label className="text-xs tracking-wide text-muted" htmlFor="enroll-code">Verification code</label>
              <input
                id="enroll-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={confirmCode}
                onChange={(e) => setConfirmCode(e.target.value)}
                placeholder="••••••"
                className={`${inputCls} text-center tracking-[0.4em] font-mono`}
              />
              {confirmError && (
                <p className="text-xs text-[var(--error-text)]">{confirmError}</p>
              )}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={confirmMutation.isPending || confirmCode.length === 0}
                  className="px-4 py-2 rounded bg-[var(--brass)] text-inverse text-[11px] tracking-widest uppercase font-medium disabled:opacity-50"
                >
                  {confirmMutation.isPending ? 'Verifying…' : 'Verify and enable'}
                </button>
                <button
                  type="button"
                  onClick={finishEnrollment}
                  className="px-4 py-2 rounded border border-subtle text-[11px] tracking-widest uppercase text-muted"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {enrollStep === 'codes' && newBackupCodes.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm text-secondary">
              <strong>2FA is now enabled.</strong> Save these backup codes somewhere safe — each
              works once and they will <strong>not be shown again</strong>.
            </p>
            <pre className="bg-page border border-subtle rounded p-3 font-mono text-sm text-secondary grid grid-cols-2 gap-x-6 gap-y-1">
              {newBackupCodes.map((c) => <span key={c}>{c}</span>)}
            </pre>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => copyCodes(newBackupCodes)}
                className="px-3 py-1.5 rounded border border-subtle text-[11px] tracking-widest uppercase text-secondary hover:text-[var(--brass)] hover:border-[var(--brass)]/40 transition-colors"
              >
                <Copy size={12} className="inline mr-1" />
                Copy
              </button>
              <button
                onClick={() => downloadCodes(newBackupCodes)}
                className="px-3 py-1.5 rounded border border-subtle text-[11px] tracking-widest uppercase text-secondary hover:text-[var(--brass)] hover:border-[var(--brass)]/40 transition-colors"
              >
                <Download size={12} className="inline mr-1" />
                Download .txt
              </button>
            </div>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={savedAck}
                onChange={(e) => setSavedAck(e.target.checked)}
                className="mt-1"
              />
              <span className="text-xs text-secondary">I have saved these backup codes in a safe place.</span>
            </label>
            <button
              onClick={finishEnrollment}
              disabled={!savedAck}
              className="px-4 py-2 rounded bg-[var(--brass)] text-inverse text-[11px] tracking-widest uppercase font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Done
            </button>
          </div>
        )}
      </section>

      {/* Disable confirmation */}
      <ConfirmDialog
        open={disableWarnOpen}
        title="Disable two-factor authentication?"
        message="Your account will only be protected by your password. You can re-enable 2FA at any time."
        confirmLabel="Continue"
        onConfirm={() => { setDisableWarnOpen(false); setDisableFormOpen(true) }}
        onCancel={() => setDisableWarnOpen(false)}
      />

      {disableFormOpen && (
        <section className="space-y-3 p-4 rounded border border-subtle bg-surface">
          <h2 className="text-[11px] tracking-widest uppercase text-muted">Confirm to disable 2FA</h2>
          <div className="flex gap-2 text-[11px] tracking-widest uppercase">
            <button
              type="button"
              onClick={() => { setDisableMode('password'); setDisableSecret(''); setDisableError(null) }}
              aria-pressed={disableMode === 'password'}
              className={`px-3 py-1.5 rounded border ${disableMode === 'password' ? 'border-[var(--brass)]/40 text-[var(--brass)] bg-[var(--brass)]/5' : 'border-subtle text-muted hover:text-secondary'}`}
            >
              Password
            </button>
            <button
              type="button"
              onClick={() => { setDisableMode('code'); setDisableSecret(''); setDisableError(null) }}
              aria-pressed={disableMode === 'code'}
              className={`px-3 py-1.5 rounded border ${disableMode === 'code' ? 'border-[var(--brass)]/40 text-[var(--brass)] bg-[var(--brass)]/5' : 'border-subtle text-muted hover:text-secondary'}`}
            >
              Current 2FA code
            </button>
          </div>
          <form onSubmit={handleDisable} className="space-y-2">
            <input
              type={disableMode === 'password' ? 'password' : 'text'}
              autoComplete={disableMode === 'password' ? 'current-password' : 'one-time-code'}
              inputMode={disableMode === 'code' ? 'numeric' : undefined}
              maxLength={disableMode === 'code' ? 16 : undefined}
              value={disableSecret}
              onChange={(e) => setDisableSecret(e.target.value)}
              placeholder={disableMode === 'password' ? 'Your password' : '6-digit or backup code'}
              className={inputCls}
            />
            {disableError && <p className="text-xs text-[var(--error-text)]">{disableError}</p>}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={disableMutation.isPending || !disableSecret.trim()}
                className="px-3 py-1.5 rounded bg-[var(--error-text)] text-white text-[11px] tracking-widest uppercase font-medium disabled:opacity-50"
              >
                {disableMutation.isPending ? 'Disabling…' : 'Disable 2FA'}
              </button>
              <button
                type="button"
                onClick={() => { setDisableFormOpen(false); setDisableSecret(''); setDisableError(null) }}
                className="px-3 py-1.5 rounded border border-subtle text-[11px] tracking-widest uppercase text-muted"
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Regenerate backup codes */}
      {regenOpen && (
        <section className="space-y-3 p-4 rounded border border-subtle bg-surface">
          <h2 className="text-[11px] tracking-widest uppercase text-muted">Regenerate backup codes</h2>
          {regenCodes.length === 0 ? (
            <>
              <p className="text-sm text-muted">
                Existing backup codes will be invalidated. Enter your current 6-digit
                authenticator code to continue.
              </p>
              <form onSubmit={handleRegenSubmit} className="space-y-2">
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={regenCode}
                  onChange={(e) => setRegenCode(e.target.value)}
                  placeholder="••••••"
                  className={`${inputCls} text-center tracking-[0.4em] font-mono`}
                />
                {regenError && <p className="text-xs text-[var(--error-text)]">{regenError}</p>}
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={regenMutation.isPending || regenCode.length === 0}
                    className="px-3 py-1.5 rounded bg-[var(--brass)] text-inverse text-[11px] tracking-widest uppercase font-medium disabled:opacity-50"
                  >
                    {regenMutation.isPending ? 'Generating…' : 'Generate new codes'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setRegenOpen(false); setRegenCode(''); setRegenError(null) }}
                    className="px-3 py-1.5 rounded border border-subtle text-[11px] tracking-widest uppercase text-muted"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </>
          ) : (
            <>
              <p className="text-sm text-secondary">
                <strong>New backup codes</strong> — save them now. They will not be shown again.
              </p>
              <pre className="bg-page border border-subtle rounded p-3 font-mono text-sm text-secondary grid grid-cols-2 gap-x-6 gap-y-1">
                {regenCodes.map((c) => <span key={c}>{c}</span>)}
              </pre>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => copyCodes(regenCodes)}
                  className="px-3 py-1.5 rounded border border-subtle text-[11px] tracking-widest uppercase text-secondary hover:text-[var(--brass)] hover:border-[var(--brass)]/40"
                >
                  <Copy size={12} className="inline mr-1" />
                  Copy
                </button>
                <button
                  onClick={() => downloadCodes(regenCodes)}
                  className="px-3 py-1.5 rounded border border-subtle text-[11px] tracking-widest uppercase text-secondary hover:text-[var(--brass)] hover:border-[var(--brass)]/40"
                >
                  <Download size={12} className="inline mr-1" />
                  Download .txt
                </button>
                <button
                  onClick={() => { setRegenOpen(false); setRegenCodes([]) }}
                  className="px-3 py-1.5 rounded bg-[var(--brass)] text-inverse text-[11px] tracking-widest uppercase font-medium"
                >
                  Done
                </button>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  )
}
