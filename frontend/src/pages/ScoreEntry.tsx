import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { scoreCardApi } from '../api/scoreCards'
import { gearApi } from '../api/gear'

const today = () => new Date().toISOString().slice(0, 10)

export default function ScoreEntry() {
  const navigate = useNavigate()

  const [shotScores, setShotScores] = useState<number[]>(Array(25).fill(0))
  const [shotXs, setShotXs] = useState<boolean[]>(Array(25).fill(false))
  const [shotAt, setShotAt] = useState(today())
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [rifleId, setRifleId] = useState<string>('')
  const [pelletId, setPelletId] = useState<string>('')

  const { data: rifleData } = useQuery({ queryKey: ['rifles'], queryFn: () => gearApi.listRifles() })
  const { data: pelletData } = useQuery({ queryKey: ['pellets'], queryFn: () => gearApi.listPellets() })
  const rifles = rifleData?.items ?? []
  const pellets = pelletData?.items ?? []

  const totalScore = shotScores.reduce((a, b) => a + b, 0)
  const xCount = shotXs.filter(Boolean).length

  function cycleScore(i: number) {
    setShotScores(prev => {
      const next = [...prev]
      next[i] = next[i] >= 10 ? 0 : next[i] + 1
      return next
    })
    // Clear X if score drops to 0
    setShotXs(prev => {
      const next = [...prev]
      if (shotScores[i] >= 10) next[i] = false
      return next
    })
  }

  function toggleX(i: number, e: React.MouseEvent) {
    e.stopPropagation()
    if (shotScores[i] === 0) return
    setShotXs(prev => {
      const next = [...prev]
      next[i] = !next[i]
      return next
    })
  }

  const mutation = useMutation({
    mutationFn: () =>
      scoreCardApi.create({
        shot_at: shotAt,
        shot_scores: shotScores,
        shot_xs: shotXs,
        location: location || undefined,
        notes: notes || undefined,
        rifle_id: rifleId || undefined,
        pellet_id: pelletId || undefined,
      }),
    onSuccess: (card) => {
      navigate({ to: '/scores/$id', params: { id: card.id } })
    },
  })

  const allFilled = shotScores.every(s => s > 0)

  const selectCls = 'w-full bg-white/[0.04] border border-white/[0.08] rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-[#D4A44A]/50'

  return (
    <div className="p-4 space-y-6 max-w-lg mx-auto">
      <h1 className="text-xl font-medium tracking-widest uppercase text-white/80">New Score Card</h1>

      {/* Shot grid */}
      <div className="grid grid-cols-5 gap-2">
        {shotScores.map((score, i) => (
          <button
            key={i}
            onClick={() => cycleScore(i)}
            className={[
              'relative aspect-square rounded border font-mono text-sm font-medium transition-colors select-none',
              score === 0
                ? 'bg-white/[0.03] border-white/[0.06] text-white/20'
                : score === 10
                ? 'bg-[#D4A44A]/10 border-[#D4A44A]/40 text-[#D4A44A]'
                : 'bg-white/[0.06] border-white/[0.15] text-white/80',
            ].join(' ')}
          >
            <span>{score === 0 ? i + 1 : score}</span>
            {shotXs[i] && (
              <span className="absolute top-0.5 right-0.5 text-[8px] font-bold text-[#D4A44A] leading-none">X</span>
            )}
            {score > 0 && (
              <button
                onClick={(e) => toggleX(i, e)}
                className={[
                  'absolute bottom-0.5 right-0.5 text-[8px] leading-none transition-colors',
                  shotXs[i] ? 'text-[#D4A44A]' : 'text-white/20 hover:text-white/50',
                ].join(' ')}
                aria-label={shotXs[i] ? 'Remove X' : 'Mark X'}
              >
                x
              </button>
            )}
          </button>
        ))}
      </div>

      {/* Totals */}
      <div className="flex gap-8 font-mono text-sm border-t border-white/[0.06] pt-4">
        <span className="text-white/30 tracking-widest uppercase text-[11px]">
          Total <strong className="text-white ml-2 text-base">{totalScore}</strong>
        </span>
        <span className="text-white/30 tracking-widest uppercase text-[11px]">
          X <strong className="text-[#D4A44A] ml-2 text-base">{xCount}</strong>
        </span>
      </div>

      {/* Metadata */}
      <div className="space-y-3">
        {rifles.length > 0 && (
          <div>
            <label className="block text-[11px] tracking-widest uppercase text-white/40 mb-1">Rifle</label>
            <select value={rifleId} onChange={e => setRifleId(e.target.value)} className={selectCls}>
              <option value="">— none —</option>
              {rifles.map(r => (
                <option key={r.id} value={r.id}>{r.make} {r.model} ({r.calibre})</option>
              ))}
            </select>
          </div>
        )}
        {pellets.length > 0 && (
          <div>
            <label className="block text-[11px] tracking-widest uppercase text-white/40 mb-1">Pellet</label>
            <select value={pelletId} onChange={e => setPelletId(e.target.value)} className={selectCls}>
              <option value="">— none —</option>
              {pellets.map(p => (
                <option key={p.id} value={p.id}>{p.brand} {p.model}{p.head_size_mm ? ` ${p.head_size_mm}mm` : ''}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="block text-[11px] tracking-widest uppercase text-white/40 mb-1">Date</label>
          <input
            type="date"
            value={shotAt}
            onChange={e => setShotAt(e.target.value)}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-[#D4A44A]/50"
          />
        </div>
        <div>
          <label className="block text-[11px] tracking-widest uppercase text-white/40 mb-1">Location</label>
          <input
            type="text"
            value={location}
            onChange={e => setLocation(e.target.value)}
            placeholder="Range / club"
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded px-3 py-2 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-[#D4A44A]/50"
          />
        </div>
        <div>
          <label className="block text-[11px] tracking-widest uppercase text-white/40 mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            placeholder="Conditions, observations…"
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded px-3 py-2 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-[#D4A44A]/50 resize-none"
          />
        </div>
      </div>

      {/* Error */}
      {mutation.isError && (
        <p className="text-red-400 text-sm">{String(mutation.error)}</p>
      )}

      {/* Submit */}
      <button
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending || !shotAt}
        className="w-full py-3 rounded font-medium tracking-widest uppercase text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-[#D4A44A] text-black hover:bg-[#e0b45a]"
      >
        {mutation.isPending ? 'Saving…' : allFilled ? 'Save Card' : 'Save Card'}
      </button>

      <p className="text-center text-[11px] text-white/20 tracking-widest uppercase">
        Tap a shot to cycle score · tap <span className="text-[#D4A44A]/60">x</span> to mark inner X
      </p>
    </div>
  )
}
