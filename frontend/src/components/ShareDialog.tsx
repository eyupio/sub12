import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { X, Share2 } from 'lucide-react'
import { postApi, SharePayload } from '../api/posts'
import { leagueApi } from '../api/leagues'
import { clubsApi } from '../api/clubs'
import { toast } from '../store/toast'

type Destination = 'personal' | 'league' | 'club'

interface ShareDialogProps {
  targetId: string
  targetType: 'score_card' | 'pellet_test'
  targetLabel: string
  onClose: () => void
}

export function ShareDialog({ targetId, targetType, targetLabel, onClose }: ShareDialogProps) {
  const [destination, setDestination] = useState<Destination>('personal')
  const [entityId, setEntityId] = useState('')
  const [body, setBody] = useState('')

  const { data: leagues } = useQuery({
    queryKey: ['my-leagues'],
    queryFn: () => leagueApi.listMine(),
    enabled: destination === 'league',
  })

  const { data: clubs } = useQuery({
    queryKey: ['clubs'],
    queryFn: () => clubsApi.list(),
    enabled: destination === 'club',
  })

  const shareMutation = useMutation({
    mutationFn: () => {
      const payload: SharePayload = {
        target_id: targetId,
        target_type: targetType,
        body: body.trim() || undefined,
      }
      if (destination === 'league' && entityId) payload.league_id = entityId
      if (destination === 'club' && entityId) payload.club_id = entityId
      return postApi.share(payload)
    },
    onSuccess: () => {
      toast('Shared successfully', 'success')
      onClose()
    },
    onError: () => {
      toast('Failed to share', 'error')
    },
  })

  const needsEntity = (destination === 'league' || destination === 'club') && !entityId

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay-bg)] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-card border border-subtle rounded-lg shadow-lg w-full max-w-md mx-4 p-4 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium tracking-widest uppercase text-secondary flex items-center gap-2">
            <Share2 size={14} />
            Share {targetLabel}
          </h2>
          <button onClick={onClose} className="text-muted hover:text-secondary transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Destination selector */}
        <div className="flex gap-1.5">
          {(['personal', 'league', 'club'] as Destination[]).map((d) => (
            <button
              key={d}
              onClick={() => { setDestination(d); setEntityId('') }}
              className={`px-3 py-1.5 rounded text-[11px] tracking-widest uppercase border transition-colors ${
                destination === d
                  ? 'border-[var(--brass)]/40 text-[var(--brass)] bg-[var(--brass)]/5'
                  : 'border-subtle text-muted hover:text-secondary'
              }`}
            >
              {d === 'personal' ? 'My Feed' : d}
            </button>
          ))}
        </div>

        {/* Entity selector */}
        {destination === 'league' && (
          <select
            value={entityId}
            onChange={(e) => setEntityId(e.target.value)}
            className="w-full rounded border border-subtle bg-surface px-3 py-1.5 text-sm text-primary"
          >
            <option value="">Select a league...</option>
            {(leagues?.items ?? []).map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        )}

        {destination === 'club' && (
          <select
            value={entityId}
            onChange={(e) => setEntityId(e.target.value)}
            className="w-full rounded border border-subtle bg-surface px-3 py-1.5 text-sm text-primary"
          >
            <option value="">Select a club...</option>
            {(clubs?.items ?? []).filter((c) => c.is_member).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}

        {/* Optional body */}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a message (optional)..."
          rows={2}
          className="w-full bg-surface border border-subtle rounded px-3 py-2 text-sm text-secondary focus:outline-none focus:border-[var(--brass)]/50 resize-none placeholder-muted"
        />

        {/* Submit */}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-2 rounded border border-subtle text-[11px] tracking-widest uppercase text-muted hover:text-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => shareMutation.mutate()}
            disabled={shareMutation.isPending || needsEntity}
            className="px-4 py-2 rounded bg-[var(--brass)] text-inverse text-[11px] tracking-widest uppercase font-medium disabled:opacity-40 transition-colors"
          >
            {shareMutation.isPending ? 'Sharing...' : 'Share'}
          </button>
        </div>

        {shareMutation.isError && (
          <p className="text-[var(--error-text)] text-xs">Failed to share. Please try again.</p>
        )}
      </div>
    </div>
  )
}
