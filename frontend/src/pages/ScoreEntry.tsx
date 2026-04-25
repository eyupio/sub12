import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearch, Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, Upload, X, Trophy, HelpCircle, Trash2, ChevronLeft } from 'lucide-react'
import { scoreCardApi } from '../api/scoreCards'
import { toast } from '../store/toast'
import { useAuthStore } from '../store/auth'
import { gearApi } from '../api/gear'
import { leagueApi } from '../api/leagues'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { useSmartBack } from '../hooks/useSmartBack'

const today = () => new Date().toISOString().slice(0, 10)

type Shot = { score: number; x: boolean }

export default function ScoreEntry() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const smartBack = useSmartBack('/scores')
  const search = useSearch({ strict: false }) as { leagueId?: string; roundId?: string; draftId?: string }
  const leagueId = search.leagueId
  const roundIdParam = search.roundId
  const draftId = search.draftId

  const [shots, setShots] = useState<Shot[]>(
    Array.from({ length: 25 }, () => ({ score: 0, x: false }))
  )
  const [selectedShot, setSelectedShot] = useState<number | null>(null)
  const [shotAt, setShotAt] = useState(today())
  const [location, setLocation] = useState('')
  const [windMph, setWindMph] = useState('')
  const [tempCelsius, setTempCelsius] = useState('')
  const [notes, setNotes] = useState('')
  const [rifleId, setRifleId] = useState<string>('')
  const [pelletId, setPelletId] = useState<string>('')
  const userDefaultVis = useAuthStore((s) => s.user?.default_score_visibility ?? 'public') as 'public' | 'followers' | 'private'
  const [visibility, setVisibility] = useState<'public' | 'followers' | 'private'>(userDefaultVis)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [showHelp, setShowHelp] = useState(() => {
    try { return !localStorage.getItem('sub12-score-help-seen') } catch { /* localStorage unavailable */ return true }
  })
  const [confirmDeleteDraft, setConfirmDeleteDraft] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const { data: rifleData } = useQuery({ queryKey: ['rifles'], queryFn: () => gearApi.listRifles() })
  const { data: pelletData } = useQuery({ queryKey: ['pellets'], queryFn: () => gearApi.listPellets() })
  const rifles = rifleData?.items ?? []
  const pellets = pelletData?.items ?? []

  // Refine flow: hydrate form fields from a quick-capture draft. On submit,
  // the mutation PATCHes the draft (including the 25-shot grid) and calls
  // graduate to flip is_draft=false.
  const { data: draft } = useQuery({
    queryKey: ['score-card', draftId],
    queryFn: () => scoreCardApi.get(draftId!),
    enabled: !!draftId,
  })
  useEffect(() => {
    if (!draft) return
    setShotAt(draft.shot_at)
    if (draft.location) setLocation(draft.location)
    if (draft.wind_mph != null) setWindMph(String(draft.wind_mph))
    if (draft.temp_celsius != null) setTempCelsius(String(draft.temp_celsius))
    if (draft.notes) setNotes(draft.notes)
    if (draft.rifle_id) setRifleId(draft.rifle_id)
    if (draft.pellet_id) setPelletId(draft.pellet_id)
    if (draft.visibility === 'public' || draft.visibility === 'followers' || draft.visibility === 'private') {
      setVisibility(draft.visibility)
    }
    if (draft.card_image_url && !imagePreview) {
      setImagePreview(draft.card_image_url)
    }
    // Shot grid stays empty on a quick-capture draft — the user fills it
    // here during refinement, which is the whole point.
  }, [draft, imagePreview])

  // League context
  const { data: league } = useQuery({
    queryKey: ['leagues', leagueId],
    queryFn: () => leagueApi.get(leagueId!),
    enabled: !!leagueId,
  })

  // Ensure a default round exists for score submission
  const { data: ensuredRound } = useQuery({
    queryKey: ['leagues', leagueId, 'ensure-round'],
    queryFn: () => leagueApi.ensureDefaultRound(leagueId!),
    enabled: !!leagueId,
  })

  // League config for require_image_upload enforcement
  const { data: leagueConfig } = useQuery({
    queryKey: ['leagues', leagueId, 'config'],
    queryFn: () => leagueApi.getConfig(leagueId!),
    enabled: !!leagueId,
  })
  const requireImage = leagueId && leagueConfig?.require_image_upload

  const leagueRoundId = roundIdParam ?? ensuredRound?.round_id

  const shotScores = shots.map(s => s.score)
  const shotXs = shots.map(s => s.x)
  const totalScore = shots.reduce((a, s) => a + s.score, 0)
  const xCount = shots.filter(s => s.x).length
  const avg = totalScore / 25
  const enteredCount = shots.filter(s => s.score > 0).length
  const xRingCount = xCount
  const innerCount = shots.filter((s, i) => s.score >= 9 && !(s.score === 10 && shotXs[i])).length
  const outerCount = shots.filter(s => s.score > 0 && s.score < 9).length

  const dateParts = shotAt.split('-')
  const prettyDate = dateParts.length === 3 && dateParts[0].length === 4
    ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`
    : shotAt

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

  function handleImageSelect(file: File | undefined) {
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast('Image must be under 10 MB', 'error')
        return
      }
      setImageFile(file)
      setImagePreview(URL.createObjectURL(file))
    }
  }

  function clearImage() {
    setImageFile(null)
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview)
      setImagePreview(null)
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
    mutationFn: async () => {
      const payload = {
        shot_at: shotAt,
        shot_scores: shotScores,
        shot_xs: shotXs,
        location: location || undefined,
        wind_mph: windMph ? Number(windMph) : undefined,
        temp_celsius: tempCelsius ? Number(tempCelsius) : undefined,
        notes: notes || undefined,
        rifle_id: rifleId || undefined,
        pellet_id: pelletId || undefined,
        league_round_id: leagueId ? leagueRoundId : undefined,
        visibility,
      }

      let card
      let imageFailed = false

      if (draftId) {
        // Refine flow: PATCH the existing draft with the full shot grid,
        // upload any newly picked photo, then graduate. Graduate re-runs
        // verification logic and league limit enforcement.
        await scoreCardApi.update(draftId, payload)
        if (imageFile) {
          try {
            await scoreCardApi.uploadImage(draftId, imageFile)
          } catch {
            imageFailed = true
          }
        }
        card = await scoreCardApi.graduate(draftId)
      } else {
        card = await scoreCardApi.create(payload)
        if (imageFile) {
          try {
            await scoreCardApi.uploadImage(card.id, imageFile)
          } catch {
            imageFailed = true
          }
        }
      }
      return { card, imageFailed, wasDraft: !!draftId }
    },
    onSuccess: ({ card, imageFailed, wasDraft }) => {
      qc.invalidateQueries({ queryKey: ['score-drafts'] })
      qc.invalidateQueries({ queryKey: ['score-drafts-count'] })
      if (imageFailed) {
        toast('Score card saved, but image upload failed — try again from the card', 'error')
      } else {
        toast(wasDraft ? 'Draft refined and submitted' : 'Score card saved', 'success')
      }
      navigate({ to: '/scores/$id', params: { id: card.id } })
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to save score card'
      toast(msg, 'error')
    },
  })

  const deleteDraftMutation = useMutation({
    mutationFn: () => scoreCardApi.remove(draftId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['score-drafts'] })
      qc.invalidateQueries({ queryKey: ['score-drafts-count'] })
      toast('Draft deleted', 'success')
      navigate({ to: '/drafts' })
    },
    onError: (err) => {
      toast(err instanceof Error ? err.message : 'Failed to delete draft', 'error')
    },
  })

  const inputCls =
    'w-full bg-surface border border-subtle rounded px-3 py-2 text-primary text-sm focus:outline-none focus:border-[var(--brass)]/50'
  const sidebarLabelCls = 'text-[11px] tracking-widest uppercase text-muted'

  function cellLabel(i: number): string {
    const { score, x } = shots[i]
    if (score === 0) return String(i + 1)
    if (score === 10 && x) return 'X'
    return String(score)
  }

  return (
    <div className="p-4 lg:p-8 space-y-5 lg:space-y-6 max-w-6xl mx-auto pb-24">
      {/* Top action bar */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={smartBack}
          aria-label="Back"
          className="flex items-center gap-1.5 text-[11px] tracking-widest uppercase text-muted hover:text-secondary transition-colors"
        >
          <ChevronLeft size={16} /> Back
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowHelp(true)}
            className="flex items-center gap-1.5 text-[11px] tracking-widest uppercase text-muted hover:text-[var(--brass)] border border-subtle hover:border-[var(--brass)]/40 rounded px-3 py-1.5 transition-colors"
            aria-label="How to enter scores"
          >
            <HelpCircle size={13} /> Help
          </button>
          {draftId && (
            <button
              type="button"
              onClick={() => setConfirmDeleteDraft(true)}
              disabled={deleteDraftMutation.isPending}
              className="flex items-center gap-1.5 text-[11px] tracking-widest uppercase text-muted hover:text-[var(--error-text)] border border-subtle hover:border-[var(--error-text)]/40 rounded px-3 py-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Delete draft"
            >
              <Trash2 size={13} /> Delete
            </button>
          )}
        </div>
      </div>

      {/* League context banner */}
      {league && (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--brass)]/40 bg-[var(--brass)]/10 px-4 py-2.5">
          <Trophy size={14} className="text-[var(--brass)]" />
          <span className="text-[11px] tracking-widest uppercase text-[var(--brass)] font-medium">League</span>
          <span className="text-[11px] tracking-widest uppercase text-muted">·</span>
          <span className="text-xs text-secondary">{league.name}</span>
        </div>
      )}
      {requireImage && !imageFile && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-2.5">
          <span className="text-[11px] tracking-widest uppercase text-amber-600 dark:text-amber-400 font-medium">Photo required</span>
          <span className="text-[11px] tracking-widest uppercase text-muted">·</span>
          <span className="text-xs text-secondary">This league requires a score card photo before you can submit</span>
        </div>
      )}

      {/* Hero */}
      <div className="rounded-lg border border-subtle bg-surface px-5 py-5 lg:px-6 lg:py-6">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
          <div className="space-y-3 min-w-0">
            <div className="flex items-baseline gap-3 font-mono">
              <h1 className="text-2xl lg:text-3xl text-primary">{prettyDate}</h1>
              <span className="text-base text-muted uppercase tracking-widest">
                {draftId ? 'Refine' : 'New'}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] tracking-widest uppercase px-2 py-0.5 rounded bg-surface-hover text-muted">
                {leagueId ? 'League' : 'Personal'}
              </span>
              {league && (
                <span className="text-[10px] tracking-widest uppercase text-[var(--brass)] bg-[var(--brass)]/10 px-2 py-0.5 rounded">
                  {league.name}
                </span>
              )}
              <span className="text-[10px] tracking-widest uppercase text-muted bg-surface-hover px-2 py-0.5 rounded">
                {enteredCount}/25
              </span>
            </div>
          </div>
          <div className="flex items-start gap-6 font-mono shrink-0">
            <div className="text-right">
              <p className="text-4xl lg:text-5xl font-semibold text-primary leading-none">{totalScore}</p>
              <p className="mt-2 text-[10px] tracking-widest uppercase text-muted">Running total</p>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-right">
              <span className="text-[10px] tracking-widest uppercase text-muted">X</span>
              <span className="text-xl text-[var(--brass)] font-semibold">{xCount}</span>
              <span className="text-[10px] tracking-widest uppercase text-muted">Avg</span>
              <span className="text-xl text-secondary font-semibold">{avg.toFixed(1)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main grid: shot input + sidebar */}
      <div className="lg:grid lg:grid-cols-3 lg:gap-5 space-y-5 lg:space-y-0">
        {/* Shot grid card */}
        <div className="lg:col-span-2 rounded-lg border border-subtle bg-surface p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-subtle pb-2">
            <span className="text-[11px] tracking-widest uppercase text-[var(--brass)] border-b-2 border-[var(--brass)] pb-1">Shot grid</span>
          </div>

          <div className="grid grid-cols-5 gap-2 lg:gap-3">
            {shots.map(({ score, x }, i) => {
              const isSelected = selectedShot === i
              const label = cellLabel(i)
              return (
                <button
                  key={i}
                  onClick={() => handleCellClick(i)}
                  aria-label={`Shot ${i + 1}: ${score === 0 ? 'not entered' : score === 10 && x ? 'X (inner ten)' : String(score)}`}
                  className={[
                    'relative aspect-square rounded font-mono font-semibold transition-all select-none flex items-center justify-center',
                    isSelected
                      ? 'border-2 border-[var(--brass)] ring-2 ring-[var(--brass)]/30 scale-[1.05] z-10'
                      : 'border border-subtle',
                    !isSelected && score === 0 && 'bg-surface text-muted',
                    !isSelected && score === 10 && x && 'bg-[var(--brass)]/15 border-[var(--brass)]/50 text-[var(--brass)]',
                    !isSelected && score === 10 && !x && 'bg-[var(--brass)]/10 border-[var(--brass)]/40 text-[var(--brass)]',
                    !isSelected && score > 0 && score < 10 && 'bg-surface-hover border-strong text-secondary',
                    isSelected && score === 0 && 'bg-[var(--brass)]/5 text-muted',
                    isSelected && score > 0 && score < 10 && 'bg-[var(--brass)]/10 text-primary',
                    isSelected && score === 10 && 'bg-[var(--brass)]/15 text-[var(--brass)]',
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
            <div className="space-y-3 border-t border-subtle pt-4">
              <div className="flex items-center justify-between">
                <span className="text-xs tracking-wide text-muted">
                  Shot {selectedShot + 1}
                </span>
                <button
                  onClick={() => setSelectedShot(null)}
                  className="text-xs tracking-wide text-muted hover:text-secondary transition-colors"
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
                            ? 'bg-[var(--brass)] text-inverse'
                            : 'bg-surface-active text-primary'
                          : val === 'X'
                            ? 'bg-[var(--brass)]/10 text-[var(--brass)] hover:bg-[var(--brass)]/20'
                            : 'bg-surface-hover text-secondary hover:bg-surface-active',
                      ].join(' ')}
                    >
                      {val}
                    </button>
                  )
                })}
              </div>
              <p className="text-xs text-muted text-center hidden lg:block">
                Arrow keys to navigate · type 0-9 or X · Esc to deselect
              </p>
            </div>
          )}

          {/* Ring-legend footer */}
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted border-t border-subtle pt-3">
            <span className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--brass)]" />
              X-ring hit · <span className="font-mono text-secondary ml-1">{xRingCount}</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--brass)]/50" />
              10–9 ring · <span className="font-mono text-secondary ml-1">{innerCount}</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-strong" />
              8 and below · <span className="font-mono text-secondary ml-1">{outerCount}</span>
            </span>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Date */}
          <div className="rounded-lg border border-subtle bg-surface p-4 space-y-2.5">
            <p className={`${sidebarLabelCls} border-b border-subtle pb-2`}>Date</p>
            <input
              type="date"
              value={shotAt}
              onChange={e => setShotAt(e.target.value)}
              className={`${inputCls} font-mono`}
            />
          </div>

          {/* Equipment */}
          <div className="rounded-lg border border-subtle bg-surface p-4 space-y-2.5">
            <p className={`${sidebarLabelCls} border-b border-subtle pb-2`}>Equipment</p>
            <div className="space-y-1.5">
              <label className={sidebarLabelCls}>Rifle</label>
              {rifles.length > 0 ? (
                <select value={rifleId} onChange={e => setRifleId(e.target.value)} className={inputCls}>
                  <option value="">— none —</option>
                  {rifles.map(r => (
                    <option key={r.id} value={r.id}>{r.make} {r.model} ({r.calibre})</option>
                  ))}
                </select>
              ) : (
                <p className="text-xs text-muted py-1">No rifles yet — <Link to="/gear" className="text-[var(--brass)] hover:opacity-80">add one in Gear</Link></p>
              )}
            </div>
            <div className="space-y-1.5">
              <label className={sidebarLabelCls}>Pellet</label>
              {pellets.length > 0 ? (
                <select value={pelletId} onChange={e => setPelletId(e.target.value)} className={inputCls}>
                  <option value="">— none —</option>
                  {pellets.map(p => (
                    <option key={p.id} value={p.id}>{p.brand} {p.model}{p.head_size_mm ? ` ${p.head_size_mm}mm` : ''}</option>
                  ))}
                </select>
              ) : (
                <p className="text-xs text-muted py-1">No pellets yet — <Link to="/gear" className="text-[var(--brass)] hover:opacity-80">add one in Gear</Link></p>
              )}
            </div>
          </div>

          {/* Conditions */}
          <div className="rounded-lg border border-subtle bg-surface p-4 space-y-2.5">
            <p className={`${sidebarLabelCls} border-b border-subtle pb-2`}>Conditions</p>
            <div className="space-y-1.5">
              <label className={sidebarLabelCls}>Location</label>
              <input
                type="text"
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder="Range / club"
                className={`${inputCls} placeholder:text-muted`}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className={sidebarLabelCls}>Wind (mph)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={windMph}
                  onChange={e => setWindMph(e.target.value)}
                  placeholder="e.g. 5"
                  className={`${inputCls} placeholder:text-muted font-mono`}
                />
              </div>
              <div className="space-y-1.5">
                <label className={sidebarLabelCls}>Temp (°C)</label>
                <input
                  type="number"
                  step="0.1"
                  value={tempCelsius}
                  onChange={e => setTempCelsius(e.target.value)}
                  placeholder="e.g. 18"
                  className={`${inputCls} placeholder:text-muted font-mono`}
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="rounded-lg border border-subtle bg-surface p-4 space-y-2.5">
            <p className={`${sidebarLabelCls} border-b border-subtle pb-2`}>Notes</p>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Conditions, observations…"
              className={`${inputCls} placeholder:text-muted resize-none`}
            />
          </div>

          {/* Visibility */}
          <div className="rounded-lg border border-subtle bg-surface p-4 space-y-2.5">
            <p className={`${sidebarLabelCls} border-b border-subtle pb-2`}>Visibility</p>
            <div className="flex gap-2">
              {(['public', 'followers', 'private'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVisibility(v)}
                  className={`flex-1 px-3 py-1.5 rounded border text-[11px] tracking-widest uppercase transition-colors ${
                    visibility === v
                      ? 'border-[var(--brass)]/50 bg-[var(--brass)]/10 text-[var(--brass)]'
                      : 'border-subtle text-muted hover:text-secondary'
                  }`}
                >
                  {v === 'followers' ? 'Followers' : v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Score Card Photo */}
          <div className="rounded-lg border border-subtle bg-surface p-4 space-y-2.5">
            <p className={`${sidebarLabelCls} border-b border-subtle pb-2`}>Score Card Photo</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleImageSelect(e.target.files?.[0])}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => handleImageSelect(e.target.files?.[0])}
            />
            {imagePreview ? (
              <div className="relative">
                <img src={imagePreview} alt="Score card preview" className="rounded border border-subtle max-h-48 w-full object-contain bg-surface" />
                <button
                  onClick={clearImage}
                  className="absolute top-2 right-2 bg-page/80 backdrop-blur rounded-full p-1 text-muted hover:text-primary transition-colors"
                  aria-label="Remove photo"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 flex items-center justify-center gap-2 border border-dashed border-subtle rounded p-3 text-muted text-sm hover:border-[var(--brass)]/50 hover:text-secondary transition-colors"
                >
                  <Upload size={16} />
                  Upload
                </button>
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex-1 flex items-center justify-center gap-2 border border-dashed border-subtle rounded p-3 text-muted text-sm hover:border-[var(--brass)]/50 hover:text-secondary transition-colors"
                >
                  <Camera size={16} />
                  Camera
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Submit */}
      <div className="space-y-2">
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !shotAt || (!!requireImage && !imageFile)}
          className="w-full py-3 rounded font-medium tracking-widest uppercase text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-[var(--brass)] text-inverse hover:opacity-90"
        >
          {mutation.isPending
            ? (leagueId ? 'Submitting…' : 'Saving…')
            : (leagueId ? 'Submit Score' : 'Save Card')}
        </button>
        <p className="text-center text-xs text-muted tracking-wide">
          {selectedShot === null
            ? 'Tap a shot cell to select it, then use the buttons to set the score'
            : 'Use number buttons below, or arrow keys to navigate between shots'}
        </p>
      </div>

      {/* Help overlay */}
      {showHelp && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { setShowHelp(false); try { localStorage.setItem('sub12-score-help-seen', '1') } catch { /* localStorage unavailable */ } }} />
          <div className="relative bg-surface border border-subtle rounded-lg shadow-xl w-full max-w-sm p-5 space-y-4">
            <h3 className="text-sm font-medium text-primary">How to enter scores</h3>
            <div className="space-y-3 text-sm text-secondary">
              <div className="flex items-start gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-[var(--brass)]/15 text-[var(--brass)] flex items-center justify-center text-xs font-semibold">1</span>
                <p><strong>Tap a cell</strong> in the 5x5 grid to select a shot position</p>
              </div>
              <div className="flex items-start gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-[var(--brass)]/15 text-[var(--brass)] flex items-center justify-center text-xs font-semibold">2</span>
                <p><strong>Set the score</strong> using the number buttons (0-10) that appear below the grid</p>
              </div>
              <div className="flex items-start gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-[var(--brass)]/15 text-[var(--brass)] flex items-center justify-center text-xs font-semibold">3</span>
                <p><strong>X means a perfect 10</strong> that also hit the centre dot (inner ten). Tap "X" for these</p>
              </div>
              <div className="flex items-start gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-[var(--brass)]/15 text-[var(--brass)] flex items-center justify-center text-xs font-semibold">4</span>
                <p>The cursor <strong>auto-advances</strong> to the next shot after each entry</p>
              </div>
            </div>
            <p className="text-xs text-muted">On desktop: use arrow keys to navigate, number keys to score, X for inner ten.</p>
            <button
              onClick={() => { setShowHelp(false); try { localStorage.setItem('sub12-score-help-seen', '1') } catch { /* localStorage unavailable */ } }}
              className="w-full py-2.5 rounded bg-[var(--brass)] text-inverse text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDeleteDraft}
        title="Delete draft?"
        message="This score card draft will be permanently deleted. This cannot be undone."
        confirmLabel={deleteDraftMutation.isPending ? 'Deleting...' : 'Delete'}
        onConfirm={() => {
          if (!deleteDraftMutation.isPending) deleteDraftMutation.mutate()
        }}
        onCancel={() => {
          if (!deleteDraftMutation.isPending) setConfirmDeleteDraft(false)
        }}
      />
    </div>
  )
}
