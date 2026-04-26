import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Trophy, Check } from 'lucide-react'
import { leagueApi } from '../api/leagues'
import { scoreCardApi } from '../api/scoreCards'
import { ApiError } from '../api/client'
import { toast } from '../store/toast'

interface SubmitToLeagueDialogProps {
  open: boolean
  scoreCardId: string
  onClose: () => void
  onSuccess?: () => void
}

export function SubmitToLeagueDialog({ open, scoreCardId, onClose, onSuccess }: SubmitToLeagueDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['my-leagues'],
    queryFn: () => leagueApi.listMine(),
    enabled: open,
  })
  const leagues = useMemo(() => data?.items ?? [], [data])

  useEffect(() => {
    if (!open) {
      setSelectedLeagueId(null)
      return
    }
    returnFocusRef.current = document.activeElement as HTMLElement | null
    cancelRef.current?.focus()
    return () => {
      returnFocusRef.current?.focus?.()
    }
  }, [open])

  // Auto-select when there's exactly one league.
  useEffect(() => {
    if (!open) return
    if (leagues.length === 1 && !selectedLeagueId) {
      setSelectedLeagueId(leagues[0].id)
    }
  }, [open, leagues, selectedLeagueId])

  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab' || !dialogRef.current) return
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
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

  const submitMutation = useMutation({
    mutationFn: async (leagueId: string) => {
      const { round_id } = await leagueApi.ensureDefaultRound(leagueId)
      return scoreCardApi.submitToLeague(scoreCardId, round_id)
    },
    onSuccess: () => {
      toast('Score card submitted to league', 'success')
      onSuccess?.()
      onClose()
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        toast(err.message, 'error')
      } else {
        toast('Failed to submit to league', 'error')
      }
    },
  })

  if (!open) return null

  const submitting = submitMutation.isPending
  const empty = !isLoading && leagues.length === 0

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={dialogRef}
        className="relative bg-surface border border-subtle rounded-lg shadow-xl w-full max-w-sm p-5 space-y-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="submit-league-title"
        aria-describedby="submit-league-desc"
      >
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-[var(--gold-tint)] flex items-center justify-center shrink-0">
            <Trophy size={18} className="text-brass" />
          </div>
          <div>
            <h3 id="submit-league-title" className="t-subsection-title">Submit to League</h3>
            <p id="submit-league-desc" className="text-sm text-muted mt-1">
              Choose a league to submit this score card to. Only leagues you've joined are shown.
            </p>
          </div>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-8" role="status" aria-label="Loading leagues">
            <div className="w-5 h-5 border-2 border-subtle border-t-[var(--brass)] rounded-full animate-spin" />
          </div>
        )}

        {empty && (
          <div className="rounded border border-subtle bg-surface-hover p-4 text-center space-y-2">
            <p className="text-sm text-secondary">You're not a member of any leagues yet.</p>
            <Link
              to="/leagues"
              onClick={onClose}
              className="inline-block text-sm text-brass hover:underline"
            >
              Browse leagues →
            </Link>
          </div>
        )}

        {!isLoading && leagues.length > 0 && (
          <div
            className="max-h-64 overflow-y-auto -mx-1 px-1 space-y-2"
            role="radiogroup"
            aria-label="Your leagues"
          >
            {leagues.map((league) => {
              const selected = selectedLeagueId === league.id
              return (
                <button
                  key={league.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setSelectedLeagueId(league.id)}
                  className={[
                    'w-full text-left rounded border px-3 py-2.5 transition-colors flex items-center gap-3',
                    selected
                      ? 'border-brass bg-[var(--gold-tint)]'
                      : 'border-subtle bg-surface hover:bg-surface-hover',
                  ].join(' ')}
                >
                  <div className="flex-1 min-w-0">
                    <div className="t-subsection-title truncate">{league.name}</div>
                    {league.description && (
                      <div className="text-xs text-muted truncate mt-0.5">{league.description}</div>
                    )}
                  </div>
                  {selected && <Check size={16} className="text-brass shrink-0" />}
                </button>
              )
            })}
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded border border-subtle text-sm text-muted hover:text-secondary transition-colors"
          >
            Cancel
          </button>
          {!empty && (
            <button
              type="button"
              onClick={() => selectedLeagueId && submitMutation.mutate(selectedLeagueId)}
              disabled={!selectedLeagueId || submitting}
              className="px-4 py-2 rounded bg-brass text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              {submitting ? 'Submitting…' : 'Submit'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
