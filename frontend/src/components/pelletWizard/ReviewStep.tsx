import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Camera, Check, Plus, Target, Trash2 } from 'lucide-react'
import {
  pelletTestApi,
  type PelletTestGroup,
  type PelletTestImage,
  type PelletTestSession,
} from '../../api/pelletTesting'
import { toast } from '../../store/toast'
import { WIZARD_INPUT_CLS, calcMOA } from './wizardShared'

interface Props {
  session: PelletTestSession | null
  distanceM: number
  defaultShotCount: number
}

function isFromImage(notes?: string): boolean {
  return !!notes && /\[source:image\]/.test(notes)
}

function cleanNotes(notes?: string): string {
  return (notes ?? '').replace(/\s*\[source:(manual|image)\]\s*/g, ' ').trim()
}

export function ReviewStep({ session, distanceM, defaultShotCount }: Props) {
  const qc = useQueryClient()
  const sessionId = session?.id
  const groups = session?.groups ?? []
  const images: PelletTestImage[] = session?.images ?? []

  const [showAdd, setShowAdd] = useState(false)
  const [shotCount, setShotCount] = useState(defaultShotCount)
  const [sizeMM, setSizeMM] = useState('')
  const [notes, setNotes] = useState('')

  const addGroupMutation = useMutation({
    mutationFn: () =>
      pelletTestApi.createGroup(sessionId!, {
        shot_count: shotCount,
        group_size_mm: Number(sizeMM),
        notes: notes ? `${notes} [source:manual]` : '[source:manual]',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pellet-test', sessionId] })
      qc.invalidateQueries({ queryKey: ['pellet-tests', sessionId] })
      setShowAdd(false)
      setShotCount(defaultShotCount)
      setSizeMM('')
      setNotes('')
    },
    onError: err => toast(err instanceof Error ? err.message : 'Failed to add group', 'error'),
  })

  const updateGroupMutation = useMutation({
    mutationFn: (payload: { id: string; sizeMM?: number; shotCount?: number; notes?: string }) =>
      pelletTestApi.updateGroup(sessionId!, payload.id, {
        group_size_mm: payload.sizeMM,
        shot_count: payload.shotCount,
        notes: payload.notes,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pellet-test', sessionId] })
      qc.invalidateQueries({ queryKey: ['pellet-tests', sessionId] })
    },
  })

  const deleteGroupMutation = useMutation({
    mutationFn: (id: string) => pelletTestApi.deleteGroup(sessionId!, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pellet-test', sessionId] })
      qc.invalidateQueries({ queryKey: ['pellet-tests', sessionId] })
    },
  })

  const totalShots = groups.reduce((sum, g) => sum + (g.shot_count ?? 0), 0)
  const bestMM = groups.reduce<number | null>(
    (best, g) => (best == null || g.group_size_mm < best ? g.group_size_mm : best),
    null,
  )
  const avgMM = groups.length > 0 ? groups.reduce((s, g) => s + g.group_size_mm, 0) / groups.length : null

  // Find which group came from which image (for the badge)
  function imageForGroup(g: PelletTestGroup): PelletTestImage | undefined {
    return images.find(img => img.group_id === g.id)
  }

  return (
    <section className="bg-surface border border-line rounded-lg p-5 lg:p-6 shadow-card space-y-5">
      <header>
        <h2 className="t-subsection-title">Groups &amp; review</h2>
        <p className="text-sm text-muted mt-0.5">
          {groups.length === 0
            ? 'Add at least one group manually, or measure a photo on the previous step.'
            : `${groups.length} group${groups.length === 1 ? '' : 's'} · ${totalShots} shots logged.`}
        </p>
      </header>

      {/* Summary tiles */}
      {groups.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <Tile label="Best" value={bestMM != null ? `${bestMM.toFixed(2)} mm` : '—'} accent />
          <Tile label="Average" value={avgMM != null ? `${avgMM.toFixed(2)} mm` : '—'} />
          <Tile
            label="Best MOA"
            value={
              bestMM != null && distanceM > 0 ? calcMOA(bestMM, distanceM).toFixed(3) : '—'
            }
          />
        </div>
      )}

      {/* Groups list */}
      <div className="space-y-2">
        {groups.length === 0 ? (
          <p className="text-sm text-muted text-center py-8 border border-dashed border-line rounded-lg">
            No groups yet.
          </p>
        ) : (
          groups
            .slice()
            .sort((a, b) => a.group_number - b.group_number)
            .map(g => {
              const fromImage = isFromImage(g.notes)
              const linked = imageForGroup(g)
              return (
                <GroupRow
                  key={g.id}
                  group={g}
                  distanceM={distanceM}
                  fromImage={fromImage}
                  linked={linked}
                  onUpdate={updateGroupMutation.mutate}
                  onDelete={() => deleteGroupMutation.mutate(g.id)}
                />
              )
            })
        )}
      </div>

      {/* Manual add */}
      {showAdd ? (
        <div className="p-3 rounded-lg border border-line bg-bg-2 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-muted tracking-wide">Shots</label>
              <input
                type="number"
                min="1"
                value={shotCount}
                onChange={e => setShotCount(Number(e.target.value) || defaultShotCount)}
                className={WIZARD_INPUT_CLS}
              />
            </div>
            <div>
              <label className="text-[10px] text-muted tracking-wide">Size (mm)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={sizeMM}
                onChange={e => setSizeMM(e.target.value)}
                placeholder="0.00"
                className={WIZARD_INPUT_CLS}
              />
            </div>
          </div>
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            className={`${WIZARD_INPUT_CLS} text-xs`}
          />
          <div className="flex gap-2">
            <button
              onClick={() => addGroupMutation.mutate()}
              disabled={addGroupMutation.isPending || !sizeMM || Number(sizeMM) <= 0 || !sessionId}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-gold text-inverse text-[11px] tracking-widest uppercase hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check size={13} /> {addGroupMutation.isPending ? 'Saving…' : 'Save group'}
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="px-3 py-1.5 rounded border border-line t-section-title hover:text-ink-2 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          disabled={!sessionId}
          className="w-full flex items-center justify-center gap-2 border border-dashed border-line rounded p-3 text-muted text-sm hover:border-gold/40 hover:text-ink-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus size={14} /> Add manual group
        </button>
      )}
    </section>
  )
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-bg-2 p-3">
      <p className="text-[10px] uppercase tracking-widest text-muted">{label}</p>
      <p
        className={`mt-1 t-display-num text-xl ${accent ? 'text-gold' : 'text-ink'} font-mono`}
      >
        {value}
      </p>
    </div>
  )
}

function GroupRow({
  group,
  distanceM,
  fromImage,
  linked,
  onUpdate,
  onDelete,
}: {
  group: PelletTestGroup
  distanceM: number
  fromImage: boolean
  linked?: PelletTestImage
  onUpdate: (payload: { id: string; sizeMM?: number; shotCount?: number; notes?: string }) => void
  onDelete: () => void
}) {
  const [sizeMM, setSizeMM] = useState(String(group.group_size_mm.toFixed(2)))
  const [shotCount, setShotCount] = useState(group.shot_count)
  const moa = group.group_size_moa ?? (distanceM > 0 ? calcMOA(group.group_size_mm, distanceM) : null)

  return (
    <div className="p-3 rounded-lg border border-line bg-bg-2 flex items-center gap-3 flex-wrap">
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gold-tint text-gold shrink-0">
        <Target size={13} />
      </span>
      <div className="min-w-0 flex-1 flex items-baseline gap-2 flex-wrap">
        <span className="t-section-title">Group {group.group_number}</span>
        {fromImage && (
          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-gold">
            <Camera size={10} /> From photo
          </span>
        )}
        {!!cleanNotes(group.notes) && (
          <span className="text-[11px] text-muted truncate">{cleanNotes(group.notes)}</span>
        )}
      </div>
      {linked && (
        <img
          src={linked.image_url}
          alt=""
          className="w-10 h-10 rounded border border-line object-cover shrink-0"
        />
      )}
      <div className="grid grid-cols-3 gap-2 w-full sm:w-auto sm:flex sm:items-center">
        <label className="text-[10px] text-muted">
          Shots
          <input
            type="number"
            min="1"
            value={shotCount}
            onChange={e => setShotCount(Number(e.target.value) || group.shot_count)}
            onBlur={() => {
              if (shotCount !== group.shot_count) {
                onUpdate({ id: group.id, shotCount })
              }
            }}
            className={`${WIZARD_INPUT_CLS} mt-0.5`}
          />
        </label>
        <label className="text-[10px] text-muted">
          Size (mm)
          <input
            type="number"
            step="0.01"
            min="0"
            value={sizeMM}
            onChange={e => setSizeMM(e.target.value)}
            onBlur={() => {
              const n = Number(sizeMM)
              if (n > 0 && Math.abs(n - group.group_size_mm) > 0.001) {
                onUpdate({ id: group.id, sizeMM: n })
              }
            }}
            className={`${WIZARD_INPUT_CLS} mt-0.5`}
          />
        </label>
        <div className="text-[10px] text-muted">
          MOA
          <div className="px-3 py-2 text-sm text-muted font-mono bg-surface rounded border border-subtle mt-0.5">
            {moa != null ? moa.toFixed(3) : '—'}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={onDelete}
        className="text-muted hover:text-[var(--error-text)] transition-colors shrink-0"
        aria-label="Delete group"
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}
