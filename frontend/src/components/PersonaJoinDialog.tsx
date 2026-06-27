import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { UsersRound } from 'lucide-react'
import { clubsApi, type Club } from '../api/clubs'
import { leagueApi, type League } from '../api/leagues'
import type { SimulatedPersona } from '../api/adminSimulation'

interface PersonaJoinDialogProps {
  open: boolean
  persona: SimulatedPersona | null
  kind: 'league' | 'club'
  pending: boolean
  onJoin: (targetId: string) => void
  onKindChange: (kind: 'league' | 'club') => void
  onCancel: () => void
}

export function PersonaJoinDialog({ open, persona, kind, pending, onJoin, onKindChange, onCancel }: PersonaJoinDialogProps) {
  const [selected, setSelected] = useState('')

  const { data: leaguesData } = useQuery({
    queryKey: ['public-leagues-for-sim'],
    queryFn: () => leagueApi.list(),
    enabled: open && kind === 'league',
    retry: false,
  })

  const { data: clubsData } = useQuery({
    queryKey: ['public-clubs-for-sim'],
    queryFn: () => clubsApi.list(),
    enabled: open && kind === 'club',
    retry: false,
  })

  useEffect(() => {
    if (open) setSelected('')
  }, [open, kind])

  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onCancel])

  if (!open || !persona) return null

  const items: (League | Club)[] = kind === 'league' ? leaguesData?.items ?? [] : clubsData?.items ?? []

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div
        className="relative bg-surface border border-subtle rounded-lg shadow-xl w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="persona-join-title"
      >
        <div className="flex items-center gap-2">
          <UsersRound size={18} className="text-[var(--brass)]" />
          <h3 id="persona-join-title" className="t-subsection-title">
            Add {persona.display_name} to a league or club
          </h3>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onKindChange('league')}
            className={`flex-1 text-xs tracking-widest uppercase py-2 rounded border transition-colors ${
              kind === 'league' ? 'border-[var(--brass)]/50 text-[var(--brass)] bg-[var(--brass)]/5' : 'border-subtle text-muted hover:text-secondary'
            }`}
          >
            Leagues
          </button>
          <button
            type="button"
            onClick={() => onKindChange('club')}
            className={`flex-1 text-xs tracking-widest uppercase py-2 rounded border transition-colors ${
              kind === 'club' ? 'border-[var(--brass)]/50 text-[var(--brass)] bg-[var(--brass)]/5' : 'border-subtle text-muted hover:text-secondary'
            }`}
          >
            Clubs
          </button>
        </div>

        <p className="text-xs text-muted">
          The persona will be enrolled directly, bypassing the join policy, so it can interact with
          the {kind}'s content.
        </p>

        {items.length === 0 ? (
          <p className="text-sm text-muted">No public {kind}s available.</p>
        ) : (
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {items.map((it) => (
              <label
                key={it.id}
                className={`flex items-center gap-3 p-2 rounded border cursor-pointer transition-colors ${
                  selected === it.id ? 'border-[var(--brass)]/50 bg-[var(--brass)]/5' : 'border-subtle hover:border-strong'
                }`}
              >
                <input
                  type="radio"
                  name="join-target"
                  checked={selected === it.id}
                  onChange={() => setSelected(it.id)}
                  className="accent-[var(--brass)]"
                />
                <span className="text-sm text-primary truncate">{it.name}</span>
                {'member_count' in it && (
                  <span className="text-xs text-muted ml-auto">{it.member_count} members</span>
                )}
              </label>
            ))}
          </div>
        )}

        <div className="flex gap-2 justify-end pt-1">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded border border-subtle text-sm text-muted hover:text-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => selected && onJoin(selected)}
            disabled={pending || !selected}
            className="px-4 py-2 rounded bg-[var(--brass)] text-inverse text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {pending ? 'Adding…' : `Add to ${kind}`}
          </button>
        </div>
      </div>
    </div>
  )
}

export default PersonaJoinDialog