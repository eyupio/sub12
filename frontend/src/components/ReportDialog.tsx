import { useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { AlertTriangle, X } from 'lucide-react'
import { reportsApi, ReportTargetType } from '../api/reports'
import { toast } from '../store/toast'

interface ReportDialogProps {
  open: boolean
  targetType: ReportTargetType
  targetId: string
  onClose: () => void
}

const REASONS = [
  'Spam or commercial',
  'Harassment or hate',
  'Sexual or violent content',
  'Cheating or fake score',
  'Other',
]

export function ReportDialog({ open, targetType, targetId, onClose }: ReportDialogProps) {
  const [reason, setReason] = useState(REASONS[0])
  const [notes, setNotes] = useState('')
  const firstRef = useRef<HTMLSelectElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    returnFocusRef.current = document.activeElement as HTMLElement | null
    firstRef.current?.focus()
    return () => {
      returnFocusRef.current?.focus?.()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab' || !dialogRef.current) return
      const nodes = dialogRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      if (nodes.length === 0) return
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  const mutation = useMutation({
    mutationFn: () => reportsApi.create({
      target_type: targetType,
      target_id: targetId,
      reason,
      notes: notes.trim() || undefined,
    }),
    onSuccess: () => {
      toast('Report submitted — thanks', 'success')
      setNotes('')
      onClose()
    },
    onError: () => toast('Failed to submit report', 'error'),
  })

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-title"
        className="relative bg-surface border border-subtle rounded-lg shadow-xl w-full max-w-sm p-5 space-y-4"
      >
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-[var(--error-bg)] flex items-center justify-center shrink-0">
            <AlertTriangle size={18} className="text-[var(--error-text)]" />
          </div>
          <div className="flex-1">
            <h3 id="report-title" className="text-sm font-medium text-primary">Report content</h3>
            <p className="text-xs text-muted mt-1">We review reports regularly. False reports may restrict your account.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-muted hover:text-secondary">
            <X size={14} />
          </button>
        </div>

        <label className="block space-y-1">
          <span className="text-[10px] tracking-widest uppercase text-muted">Reason</span>
          <select
            ref={firstRef}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full bg-page border border-subtle rounded px-2 py-1.5 text-sm text-secondary focus:outline-none focus:border-[var(--brass)]/50"
          >
            {REASONS.map((r) => <option key={r}>{r}</option>)}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-[10px] tracking-widest uppercase text-muted">Additional detail (optional)</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={1000}
            className="w-full bg-page border border-subtle rounded px-2 py-1.5 text-sm text-secondary focus:outline-none focus:border-[var(--brass)]/50 resize-none placeholder-muted"
          />
        </label>

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded border border-subtle text-sm text-muted hover:text-secondary transition-colors">Cancel</button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="px-4 py-2 rounded bg-[var(--error-text)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {mutation.isPending ? 'Submitting…' : 'Report'}
          </button>
        </div>
      </div>
    </div>
  )
}
