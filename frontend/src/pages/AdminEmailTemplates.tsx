import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { adminEmailApi } from '../api/adminEmail'
import { TemplateFormState, validateTemplateForm } from './adminEmailValidation'
import { ConfirmDialog } from '../components/ConfirmDialog'

const inputCls = 'w-full bg-surface border border-subtle rounded px-3 py-2.5 text-sm text-primary placeholder-muted focus:outline-none focus:border-[var(--brass)]/50 transition-colors'
const textareaCls = `${inputCls} min-h-[130px] font-mono`
const labelCls = 'text-[11px] tracking-widest uppercase text-muted'
const btnPrimary = 'bg-[var(--brass)] hover:opacity-90 disabled:opacity-50 text-inverse font-medium text-[11px] tracking-widest uppercase py-2.5 px-4 rounded transition-opacity'
const btnSecondary = 'border border-subtle hover:border-strong text-secondary hover:text-primary text-[11px] tracking-widest uppercase py-2.5 px-4 rounded transition-colors'

const templateLabels: Record<string, string> = {
  forgot_password: 'Forgot password',
  welcome: 'Welcome',
  email_change_confirm: 'Email change confirmation',
  notification_generic: 'Generic notification',
  notification_report_filed: 'Report filed (admin)',
  ticket_created_confirmation: 'Ticket created confirmation',
  ticket_new_reply: 'Ticket new reply',
  ticket_assigned: 'Ticket assigned',
  ticket_status_changed: 'Ticket status changed',
  feature_request_accepted_for_refinement: 'Feature request accepted',
}

function parseError(error: unknown) {
  if (!(error instanceof Error)) return 'Request failed.'
  const match = error.message.match(/\{.*\}$/)
  if (!match) return error.message
  try {
    const parsed = JSON.parse(match[0]) as { error?: string }
    return parsed.error ?? error.message
  } catch {
    return error.message
  }
}

export default function AdminEmailTemplates() {
  const queryClient = useQueryClient()
  const [selectedKey, setSelectedKey] = useState<string>('')
  const [form, setForm] = useState<TemplateFormState>({
    subject_template: '',
    html_template: '',
    text_template: '',
    is_enabled: true,
  })
  const [savedSnapshot, setSavedSnapshot] = useState('')
  const [formErrors, setFormErrors] = useState<string[]>([])
  const [serverError, setServerError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [pendingSwitchKey, setPendingSwitchKey] = useState<string | null>(null)

  const templatesQuery = useQuery({
    queryKey: ['admin-email-templates'],
    queryFn: adminEmailApi.listTemplates,
  })

  useEffect(() => {
    if (templatesQuery.data?.items?.length && !selectedKey) {
      setSelectedKey(templatesQuery.data.items[0].key)
    }
  }, [templatesQuery.data, selectedKey])

  const templateQuery = useQuery({
    queryKey: ['admin-email-template', selectedKey],
    queryFn: () => adminEmailApi.getTemplate(selectedKey),
    enabled: Boolean(selectedKey),
  })

  const templateItems = useMemo(
    () =>
      [...(templatesQuery.data?.items ?? [])].sort((a, b) => {
        const aLabel = templateLabels[a.key] ?? a.key
        const bLabel = templateLabels[b.key] ?? b.key
        return aLabel.localeCompare(bLabel)
      }),
    [templatesQuery.data?.items],
  )

  useEffect(() => {
    if (!templateQuery.data) return

    const next = {
      subject_template: templateQuery.data.subject_template,
      html_template: templateQuery.data.html_template,
      text_template: templateQuery.data.text_template,
      is_enabled: templateQuery.data.is_enabled,
    }
    setForm(next)
    setSavedSnapshot(JSON.stringify(next))
  }, [templateQuery.data])

  const previewMutation = useMutation({
    mutationFn: () => adminEmailApi.previewTemplate(selectedKey, { payload: {} }),
    onError: (err) => {
      setServerError(parseError(err))
      setSuccessMessage(null)
    },
  })

  const saveMutation = useMutation({
    mutationFn: () => adminEmailApi.patchTemplate(selectedKey, form),
    onSuccess: (updated) => {
      const next = {
        subject_template: updated.subject_template,
        html_template: updated.html_template,
        text_template: updated.text_template,
        is_enabled: updated.is_enabled,
      }
      setForm(next)
      setSavedSnapshot(JSON.stringify(next))
      setSuccessMessage('Template updated.')
      setServerError(null)
      setTimeout(() => setSuccessMessage(null), 2500)
      queryClient.invalidateQueries({ queryKey: ['admin-email-templates'] })
      queryClient.invalidateQueries({ queryKey: ['admin-email-template', selectedKey] })
    },
    onError: (err) => {
      setServerError(parseError(err))
      setSuccessMessage(null)
    },
  })

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

  const renderedPreview = previewMutation.data

  function applyTemplateSwitch(key: string) {
    setSelectedKey(key)
    setFormErrors([])
    setServerError(null)
    setSuccessMessage(null)
    previewMutation.reset()
  }

  function trySelectTemplate(key: string) {
    if (key === selectedKey) return
    if (isDirty) {
      setPendingSwitchKey(key)
      return
    }
    applyTemplateSwitch(key)
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const validationErrors = validateTemplateForm(form)
    setFormErrors(validationErrors)
    setServerError(null)

    if (validationErrors.length > 0) return
    saveMutation.mutate()
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-primary">Admin • Email Templates</h1>
        <p className="text-sm text-muted mt-1">Edit subject/html/text templates and render previews.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <aside className="bg-surface border border-subtle rounded-lg p-3 space-y-1 h-fit">
          <h2 className="text-xs uppercase tracking-widest text-muted px-2 pb-2">Templates</h2>
          {templateItems.map((item) => (
            <button
              key={item.key}
              className={`w-full text-left rounded px-2.5 py-2 text-sm border transition-colors ${selectedKey === item.key ? 'border-[var(--brass)]/50 text-[var(--brass)] bg-[var(--brass)]/10' : 'border-transparent text-secondary hover:bg-surface-hover'}`}
              onClick={() => trySelectTemplate(item.key)}
            >
              <div className="font-medium">{templateLabels[item.key] ?? item.key}</div>
              <div className="text-[11px] text-muted">{item.key}</div>
              <div className="text-xs text-muted">{item.is_enabled ? 'Enabled' : 'Disabled'}</div>
            </button>
          ))}
          {!templateItems.length && (
            <p className="text-xs text-muted px-2 py-3">No templates found.</p>
          )}
        </aside>

        <section className="bg-surface border border-subtle rounded-lg p-4 space-y-4">
          {templateQuery.isLoading && <p className="text-sm text-muted">Loading template...</p>}

          {templateQuery.data && (
            <form onSubmit={handleSubmit} className="space-y-4">
              {formErrors.length > 0 && (
                <div className="bg-[var(--error-bg)] border border-[var(--error-border)] text-[var(--error-text)] text-sm rounded p-3">
                  <ul className="list-disc pl-5 space-y-1">
                    {formErrors.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
              )}

              {serverError && <p className="text-sm text-[var(--error-text)]">{serverError}</p>}
              {successMessage && <p className="text-sm text-green-400">{successMessage}</p>}

              <label className="text-sm text-secondary inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.is_enabled}
                  onChange={(e) => setForm((prev) => ({ ...prev, is_enabled: e.target.checked }))}
                />
                Enabled
              </label>

              <div className="space-y-1">
                <label className={labelCls}>Subject</label>
                <input
                  value={form.subject_template}
                  onChange={(e) => setForm((prev) => ({ ...prev, subject_template: e.target.value }))}
                  className={inputCls}
                />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <label className={labelCls}>HTML</label>
                  <textarea
                    value={form.html_template}
                    onChange={(e) => setForm((prev) => ({ ...prev, html_template: e.target.value }))}
                    className={textareaCls}
                  />
                </div>
                <div className="space-y-1">
                  <label className={labelCls}>Text</label>
                  <textarea
                    value={form.text_template}
                    onChange={(e) => setForm((prev) => ({ ...prev, text_template: e.target.value }))}
                    className={textareaCls}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button type="submit" disabled={saveMutation.isPending} className={btnPrimary}>
                  {saveMutation.isPending ? 'Saving...' : 'Save Template'}
                </button>
                <button
                  type="button"
                  disabled={previewMutation.isPending || !selectedKey}
                  className={btnSecondary}
                  onClick={() => previewMutation.mutate()}
                >
                  {previewMutation.isPending ? 'Rendering...' : 'Preview'}
                </button>
                {isDirty && <span className="text-xs text-amber-400 self-center">You have unsaved changes.</span>}
              </div>
            </form>
          )}

          {renderedPreview && (
            <div className="border border-subtle rounded p-3 bg-surface-hover space-y-3">
              <h3 className="text-xs tracking-widest uppercase text-muted">Preview</h3>
              <div>
                <p className="text-xs text-muted">Subject</p>
                <p className="text-sm text-primary">{renderedPreview.subject}</p>
              </div>
              <div>
                <p className="text-xs text-muted">HTML</p>
                <pre className="text-xs whitespace-pre-wrap text-secondary">{renderedPreview.html}</pre>
              </div>
              <div>
                <p className="text-xs text-muted">Text</p>
                <pre className="text-xs whitespace-pre-wrap text-secondary">{renderedPreview.text}</pre>
              </div>
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={pendingSwitchKey !== null}
        title="Discard unsaved changes?"
        message="Switching templates will lose your unsaved edits."
        confirmLabel="Discard"
        onConfirm={() => {
          if (pendingSwitchKey) applyTemplateSwitch(pendingSwitchKey)
          setPendingSwitchKey(null)
        }}
        onCancel={() => setPendingSwitchKey(null)}
      />
    </div>
  )
}
