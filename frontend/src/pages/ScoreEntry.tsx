import { useState, useEffect, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { scoreCardApi } from '../api/scoreCards'
import { gearApi } from '../api/gear'

const today = () => new Date().toISOString().slice(0, 10)

type Shot = { score: number; x: boolean }

export default function ScoreEntry() {
  const navigate = useNavigate()

  const [shots, setShots] = useState<Shot[]>(
    Array.from({ length: 25 }, () => ({ score: 0, x: false }))
  )
  const [selectedShot, setSelectedShot] = useState<number | null>(null)
  const [shotAt, setShotAt] = useState(today())
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [rifleId, setRifleId] = useState<string>('')
  const [pelletId, setPelletId] = useState<string>('')

  const { data: rifleData } = useQuery({ queryKey: ['rifles'], queryFn: () => gearApi.listRifles() })
  const { data: pelletData } = useQuery({ queryKey: ['pellets'], queryFn: () => gearApi.listPellets() })
  const rifles = rifleData?.items ?? []
  const pellets = pelletData?.items ?? []

  const shotScores = shots.map(s => s.score)
  const shotXs = shots.map(s => s.x)
  const totalScore = shots.reduce((a, s) => a + s.score, 0)
  const xCount = shots.filter(s => s.x).length

  function setScore(i: number, score: number, x: boolean) {
    setShots(prev => {
      const next = [...prev]
      next[i] = { score, x }
      return next
    })
  }

  // Cycle: 0 → 1 → 2 → … → 10 → X → 0
  function cycleScore(i: number) {
    setShots(prev => {
      const next = [...prev]
      const { score, x } = prev[i]
      if (score === 10 && !x) {
        next[i] = { score: 10, x: true }
      } else if (score === 10 && x) {
        next[i] = { score: 0, x: false }
      } else {
        next[i] = { score: score + 1, x: false }
      }
      return next
    })
  }

  function handleCellClick(i: number) {
    if (selectedShot === i) {
      cycleScore(i)
    } else {
      setSelectedShot(i)
    }
  }

  function handleScoreButton(val: number | 'X') {
    if (selectedShot === null) return
    if (val === 'X') {
      setScore(selectedShot, 10, true)
    } else {
      setScore(selectedShot, val, false)
    }
    if (selectedShot < 24) {
      setSelectedShot(selectedShot + 1)
    }
  }

  // Keyboard navigation and direct input
  const selectedRef = useRef(selectedShot)
  selectedRef.current = selectedShot

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const sel = selectedRef.current
      if (sel === null) return
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) return

      const key = e.key

      if (key === 'x' || key === 'X') {
        e.preventDefault()
        setScore(sel, 10, true)
        if (sel < 24) setSelectedShot(sel + 1)
      } else if (key >= '0' && key <= '9') {
        e.preventDefault()
        setScore(sel, parseInt(key), false)
        if (sel < 24) setSelectedShot(sel + 1)
      } else if (key === 'Backspace' || key === 'Delete') {
        e.preventDefault()
        setScore(sel, 0, false)
      } else if (key === 'ArrowRight') {
        e.preventDefault()
        if (sel < 24) setSelectedShot(sel + 1)
      } else if (key === 'ArrowLeft') {
        e.preventDefault()
        if (sel > 0) setSelectedShot(sel - 1)
      } else if (key === 'ArrowDown') {
        e.preventDefault()
        if (sel + 5 <= 24) setSelectedShot(sel + 5)
      } else if (key === 'ArrowUp') {
        e.preventDefault()
        if (sel - 5 >= 0) setSelectedShot(sel - 5)
      } else if (key === 'Escape') {
        e.preventDefault()
        setSelectedShot(null)
      } else if (key === 'Tab') {
        e.preventDefault()
        if (e.shiftKey) {
          if (sel > 0) setSelectedShot(sel - 1)
        } else {
          if (sel < 24) setSelectedShot(sel + 1)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

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

  const inputCls =
    'w-full bg-white/[0.04] border border-white/[0.08] rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-[#D4A44A]/50'

  function cellLabel(i: number): string {
    const { score, x } = shots[i]
    if (score === 0) return String(i + 1)
    if (score === 10 && x) return 'X'
    return String(score)
  }

  return (
    <div className="p-4 space-y-6 max-w-lg mx-auto">
      <h1 className="text-xl font-medium tracking-widest uppercase text-white/80">
        New Score Card
      </h1>

      {/* Shot grid — 5 × 5 */}
      <div className="grid grid-cols-5 gap-2">
        {shots.map(({ score, x }, i) => {
          const isSelected = selectedShot === i
          const label = cellLabel(i)
          return (
            <button
              key={i}
              onClick={() => handleCellClick(i)}
              className={[
                'relative aspect-square rounded font-mono font-semibold transition-all select-none flex items-center justify-center',
                isSelected
                  ? 'border-2 border-[#D4A44A] ring-2 ring-[#D4A44A]/30 scale-[1.05] z-10'
                  : 'border border-white/[0.08]',
                !isSelected && score === 0 && 'bg-white/[0.03] text-white/20',
                !isSelected && score === 10 && x && 'bg-[#D4A44A]/15 border-[#D4A44A]/50 text-[#D4A44A]',
                !isSelected && score === 10 && !x && 'bg-[#D4A44A]/10 border-[#D4A44A]/40 text-[#D4A44A]',
                !isSelected && score > 0 && score < 10 && 'bg-white/[0.06] border-white/[0.15] text-white/80',
                isSelected && score === 0 && 'bg-[#D4A44A]/5 text-white/40',
                isSelected && score > 0 && score < 10 && 'bg-[#D4A44A]/10 text-white',
                isSelected && score === 10 && 'bg-[#D4A44A]/15 text-[#D4A44A]',
              ].filter(Boolean).join(' ')}
            >
              <span className={label === 'X' ? 'text-xl' : label === '10' ? 'text-base' : 'text-lg'}>
                {label}
              </span>
            </button>
          )
        })}
      </div>

      {/* Score input panel — visible when a cell is selected */}
      {selectedShot !== null && (
        <div className="space-y-3 bg-white/[0.02] border border-white/[0.08] rounded-lg p-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] tracking-widest uppercase text-white/40">
              Shot {selectedShot + 1}
            </span>
            <button
              onClick={() => setSelectedShot(null)}
              className="text-[11px] tracking-widest uppercase text-white/30 hover:text-white/50 transition-colors"
            >
              Done
            </button>
          </div>
          <div className="grid grid-cols-6 gap-1.5">
            {([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 'X'] as const).map((val) => {
              const { score, x: xFlag } = shots[selectedShot]
              const isActive =
                val === 'X'
                  ? score === 10 && xFlag
                  : score === (val as number) && !(val === 10 && xFlag)
              return (
                <button
                  key={val}
                  onClick={() => handleScoreButton(val as number | 'X')}
                  className={[
                    'py-2.5 rounded font-mono text-sm font-semibold transition-colors',
                    isActive
                      ? val === 'X' || val === 10
                        ? 'bg-[#D4A44A] text-black'
                        : 'bg-white/20 text-white'
                      : val === 'X'
                        ? 'bg-[#D4A44A]/10 text-[#D4A44A] hover:bg-[#D4A44A]/20'
                        : 'bg-white/[0.06] text-white/60 hover:bg-white/[0.12]',
                  ].join(' ')}
                >
                  {val}
                </button>
              )
            })}
          </div>
          <p className="text-[10px] text-white/20 text-center">
            Arrow keys to navigate · type 0–9 or X · Esc to close
          </p>
        </div>
      )}

      {/* Running totals */}
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
            <select value={rifleId} onChange={e => setRifleId(e.target.value)} className={inputCls}>
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
            <select value={pelletId} onChange={e => setPelletId(e.target.value)} className={inputCls}>
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
            className={`${inputCls} font-mono`}
          />
        </div>
        <div>
          <label className="block text-[11px] tracking-widest uppercase text-white/40 mb-1">Location</label>
          <input
            type="text"
            value={location}
            onChange={e => setLocation(e.target.value)}
            placeholder="Range / club"
            className={`${inputCls} placeholder:text-white/20`}
          />
        </div>
        <div>
          <label className="block text-[11px] tracking-widest uppercase text-white/40 mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            placeholder="Conditions, observations…"
            className={`${inputCls} placeholder:text-white/20 resize-none`}
          />
        </div>
      </div>

      {/* Error */}
      {mutation.isError && (
        <p className="text-red-400 text-sm">Failed to save score card. Please try again.</p>
      )}

      {/* Submit */}
      <button
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending || !shotAt}
        className="w-full py-3 rounded font-medium tracking-widest uppercase text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-[#D4A44A] text-black hover:bg-[#e0b45a]"
      >
        {mutation.isPending ? 'Saving…' : 'Save Card'}
      </button>

      {selectedShot === null && (
        <p className="text-center text-[11px] text-white/20 tracking-widest uppercase">
          Tap a shot to select · tap again to cycle · after 10 → X
        </p>
      )}
    </div>
  )
}
