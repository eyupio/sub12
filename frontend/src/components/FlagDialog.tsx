import { useEffect, useRef, useState } from 'react'
import { Flag, X } from 'lucide-react'
import { toast } from '../store/toast'

interface FlagDialogProps {
  open: boolean
  targetLabel: string // e.g. "comment" or "post"
  onClose: () => void
  onSubmit: (reason: string) => Promise<unknown>
}

const REASONS = [
  'Needs amendment',
  'Inappropriate language',
  'Off-topic',
  'Misleading or inaccurate',
  'Other',
]

export function FlagDialog({ open, targetLabel, onClose, onSubmit }: FlagDialogProps) {
  const [reason, setReason] = useState(REASONS[0])
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
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

  if (!open) return null

  const submit = async () => {
    const combined = notes.trim() ? `${reason} — ${notes.trim()}` : reason
    setSubmitting(true)
    try {
      await onSubmit(combined)
      toast(`Flagged — the author will be prompted to amend this ${targetLabel}.`, 'success')
      setNotes('')
      onClose()
    } catch {
      toast('Failed to flag', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="flag-title"
        className="relative bg-surface border border-subtle rounded-lg shadow-xl w-full max-w-sm p-5 space-y-4"
      >
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-[var(--warning-bg,rgba(234,179,8,0.15))] flex items-center justify-center shrink-0">
            <Flag size={18} className="text-[var(--warning-text,#b45309)]" />
          </div>
          <div className="flex-1">
            <h3 id="flag-title" className="text-sm font-medium text-primary">Flag for amendment</h3>
            <p className="text-xs text-muted mt-1">
              The author will see a banner asking them to reflect and amend. Editing the {targetLabel} clears the flag.
            </p>
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
            maxLength={450}
            placeholder="Tell the author what to reconsider"
            className="w-full bg-page border border-subtle rounded px-2 py-1.5 text-sm text-secondary focus:outline-none focus:border-[var(--brass)]/50 resize-none placeholder-muted"
          />
        </label>

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded border border-subtle text-sm text-muted hover:text-secondary transition-colors">Cancel</button>
          <button
            onClick={submit}
            disabled={submitting}
            className="px-4 py-2 rounded bg-[var(--warning-text,#b45309)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Flagging…' : 'Flag'}
          </button>
        </div>
      </div>
    </div>
  )
}
