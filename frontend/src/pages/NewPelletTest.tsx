import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, CheckCircle2, ChevronDown, ChevronRight, MapPin, Plus, Sparkles, Target, Trash2, Upload, X } from 'lucide-react'
import { pelletTestApi, type PelletTestImage } from '../api/pelletTesting'
import { gearApi, CreatePelletPayload } from '../api/gear'
import { toast } from '../store/toast'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { LocationField, type LocationValue } from '../components/LocationField'

const today = () => new Date().toISOString().slice(0, 10)

function relative(iso: string): string {
  const d = new Date(iso)
  const secs = (Date.now() - d.getTime()) / 1000
  if (secs < 60) return 'JUST NOW'
  if (secs < 3600) return `${Math.floor(secs / 60)}M AGO`
  if (secs < 86400) return `${Math.floor(secs / 3600)}H AGO`
  return `${Math.floor(secs / 86400)}D AGO`
}

function captureDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short' })
}

function calcMOA(groupSizeMM: number, distanceM: number): number {
  if (distanceM <= 0) return 0
  return (groupSizeMM / (distanceM * 1000)) * (180 / Math.PI) * 60
}

function distanceToMeters(value: number, unit: string): number {
  return unit === 'yards' ? value * 0.9144 : value
}

interface GroupRow {
  key: number
  shotCount: number
  groupSizeMM: string
  notes: string
}

const inputCls =
  'w-full bg-surface border border-subtle rounded px-3 py-2 text-primary text-sm placeholder:text-muted focus:outline-none focus:border-[var(--brass)]/50'

export default function NewPelletTest() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const search = useSearch({ strict: false }) as { draftId?: string }
  const draftId = search.draftId

  const [rifleId, setRifleId] = useState('')
  const [pelletId, setPelletId] = useState('')
  const [testDate, setTestDate] = useState(today())
  const [distanceValue, setDistanceValue] = useState('')
  const [distanceUnit, setDistanceUnit] = useState('meters')
  const [location, setLocation] = useState<LocationValue>({ label: '' })
  const [windMph, setWindMph] = useState('')
  const [tempCelsius, setTempCelsius] = useState('')
  const [humidityPct, setHumidityPct] = useState('')
  const [notes, setNotes] = useState('')
  const [velocityFps, setVelocityFps] = useState('')
  const [velocitySd, setVelocitySd] = useState('')
  const [extremeSpreadFps, setExtremeSpreadFps] = useState('')
  const [showChrono, setShowChrono] = useState(false)
  const [benchSetup, setBenchSetup] = useState('')
  const [scopeDetails, setScopeDetails] = useState('')
  const [barometricPressure, setBarometricPressure] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [nextKey, setNextKey] = useState(2)
  const [groups, setGroups] = useState<GroupRow[]>([
    { key: 1, shotCount: 5, groupSizeMM: '', notes: '' },
  ])
  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [imagePreviews, setImagePreviews] = useState<string[]>([])
  const [existingImages, setExistingImages] = useState<PelletTestImage[]>([])
  const imagePreviewsRef = useRef<string[]>([])
  imagePreviewsRef.current = imagePreviews
  useEffect(() => () => {
    imagePreviewsRef.current.forEach(url => URL.revokeObjectURL(url))
  }, [])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const [showAddPellet, setShowAddPellet] = useState(false)
  const [newPellet, setNewPellet] = useState<CreatePelletPayload>({ brand: '', model: '' })
  const [confirmDeleteDraft, setConfirmDeleteDraft] = useState(false)

  const { data: rifleData } = useQuery({ queryKey: ['rifles'], queryFn: () => gearApi.listRifles() })
  const { data: pelletData } = useQuery({ queryKey: ['pellets'], queryFn: () => gearApi.listPellets() })
  const rifles = rifleData?.items ?? []
  const pellets = pelletData?.items ?? []

  // Refine flow: hydrate from the quick-capture draft.
  const { data: draft } = useQuery({
    queryKey: ['pellet-test', draftId],
    queryFn: () => pelletTestApi.get(draftId!),
    enabled: !!draftId,
  })
  useEffect(() => {
    if (!draft) return
    setRifleId(draft.rifle_id)
    setPelletId(draft.pellet_id)
    setTestDate(draft.test_date)
    if (draft.distance_m > 0) {
      const unit = draft.distance_unit === 'yards' ? 'yards' : 'meters'
      setDistanceUnit(unit)
      const value = unit === 'yards' ? draft.distance_m / 0.9144 : draft.distance_m
      setDistanceValue(String(Number(value.toFixed(2))))
    }
    if (draft.location || draft.location_lat != null || draft.location_lng != null) {
      setLocation({
        label: draft.location ?? '',
        lat: draft.location_lat ?? undefined,
        lng: draft.location_lng ?? undefined,
      })
    }
    if (draft.wind_mph != null) setWindMph(String(draft.wind_mph))
    if (draft.temp_celsius != null) setTempCelsius(String(draft.temp_celsius))
    if (draft.humidity_pct != null) setHumidityPct(String(draft.humidity_pct))
    if (draft.notes) setNotes(draft.notes)
    setExistingImages(draft.images ?? [])
  }, [draft])

  const addPelletMutation = useMutation({
    mutationFn: () => gearApi.createPellet(newPellet),
    onSuccess: (pellet) => {
      qc.invalidateQueries({ queryKey: ['pellets'] })
      setPelletId(pellet.id)
      setShowAddPellet(false)
      setNewPellet({ brand: '', model: '' })
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Failed to add pellet', 'error'),
  })

  const distM = distanceValue ? distanceToMeters(Number(distanceValue), distanceUnit) : 0

  function addGroup() {
    setGroups(g => [...g, { key: nextKey, shotCount: 5, groupSizeMM: '', notes: '' }])
    setNextKey(k => k + 1)
  }

  function removeGroup(key: number) {
    setGroups(g => g.filter(r => r.key !== key))
  }

  function updateGroup(key: number, field: keyof GroupRow, value: string | number) {
    setGroups(g => g.map(r => r.key === key ? { ...r, [field]: value } : r))
  }

  function handleImageSelect(file: File | undefined) {
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast('Image must be under 10 MB', 'error')
        return
      }
      setImageFiles(f => [...f, file])
      setImagePreviews(p => [...p, URL.createObjectURL(file)])
    }
  }

  function removeImage(index: number) {
    URL.revokeObjectURL(imagePreviews[index])
    setImageFiles(f => f.filter((_, i) => i !== index))
    setImagePreviews(p => p.filter((_, i) => i !== index))
  }

  const deleteExistingImage = useMutation({
    mutationFn: (id: string) => pelletTestApi.deleteImage(draftId!, id),
    onSuccess: (_, id) => {
      setExistingImages(imgs => imgs.filter(i => i.id !== id))
      qc.invalidateQueries({ queryKey: ['pellet-test', draftId] })
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Failed to remove photo', 'error'),
  })

  const validGroups = groups.filter(g => g.groupSizeMM && Number(g.groupSizeMM) > 0)
  const hasDistance = !!distanceValue && Number(distanceValue) > 0
  const hasGroupOrImage = validGroups.length > 0 || imageFiles.length > 0 || existingImages.length > 0
  const canSubmit = rifleId && pelletId && testDate && hasGroupOrImage && (hasDistance || imageFiles.length > 0 || existingImages.length > 0)

  const mutation = useMutation({
    mutationFn: async () => {
      let session
      if (draftId) {
        // Refine flow: PATCH the draft session with the full metadata the
        // user entered here. Groups and images are additive via the
        // existing per-session endpoints — the draft's original photo
        // stays linked.
        session = await pelletTestApi.update(draftId, {
          rifle_id: rifleId,
          pellet_id: pelletId,
          test_date: testDate,
          distance_value: hasDistance ? Number(distanceValue) : undefined,
          distance_unit: hasDistance ? distanceUnit : undefined,
          location: location.label || undefined,
          location_lat: location.lat,
          location_lng: location.lng,
          wind_mph: windMph ? Number(windMph) : undefined,
          temp_celsius: tempCelsius ? Number(tempCelsius) : undefined,
          humidity_pct: humidityPct ? Number(humidityPct) : undefined,
          notes: notes || undefined,
          velocity_fps: velocityFps ? Number(velocityFps) : undefined,
          velocity_sd: velocitySd ? Number(velocitySd) : undefined,
          extreme_spread_fps: extremeSpreadFps ? Number(extremeSpreadFps) : undefined,
          bench_setup: benchSetup || undefined,
          scope_details: scopeDetails || undefined,
          barometric_pressure_mbar: barometricPressure ? Number(barometricPressure) : undefined,
        })
      } else {
        session = await pelletTestApi.create({
          rifle_id: rifleId,
          pellet_id: pelletId,
          test_date: testDate,
          distance_value: hasDistance ? Number(distanceValue) : undefined,
          distance_unit: hasDistance ? distanceUnit : undefined,
          location: location.label || undefined,
          location_lat: location.lat,
          location_lng: location.lng,
          wind_mph: windMph ? Number(windMph) : undefined,
          temp_celsius: tempCelsius ? Number(tempCelsius) : undefined,
          humidity_pct: humidityPct ? Number(humidityPct) : undefined,
          notes: notes || undefined,
          velocity_fps: velocityFps ? Number(velocityFps) : undefined,
          velocity_sd: velocitySd ? Number(velocitySd) : undefined,
          extreme_spread_fps: extremeSpreadFps ? Number(extremeSpreadFps) : undefined,
          bench_setup: benchSetup || undefined,
          scope_details: scopeDetails || undefined,
          barometric_pressure_mbar: barometricPressure ? Number(barometricPressure) : undefined,
        })
      }

      let groupFailures = 0
      for (const g of validGroups) {
        try {
          await pelletTestApi.createGroup(session.id, {
            shot_count: g.shotCount,
            group_size_mm: Number(g.groupSizeMM),
            notes: g.notes || undefined,
          })
        } catch {
          groupFailures++
        }
      }

      let imageFailures = 0
      for (const file of imageFiles) {
        try {
          await pelletTestApi.uploadImage(session.id, file)
        } catch {
          imageFailures++
        }
      }

      if (draftId) {
        session = await pelletTestApi.graduate(session.id)
      }

      return { session, groupFailures, imageFailures, wasDraft: !!draftId }
    },
    onSuccess: ({ session, groupFailures, imageFailures, wasDraft }) => {
      qc.invalidateQueries({ queryKey: ['pellet-tests'] })
      qc.invalidateQueries({ queryKey: ['pellet-test-stats'] })
      qc.invalidateQueries({ queryKey: ['pellet-drafts'] })
      qc.invalidateQueries({ queryKey: ['pellet-drafts-count'] })
      if (groupFailures > 0 || imageFailures > 0) {
        const parts = []
        if (groupFailures > 0) parts.push(`${groupFailures} group${groupFailures === 1 ? '' : 's'}`)
        if (imageFailures > 0) parts.push(`${imageFailures} image${imageFailures === 1 ? '' : 's'}`)
        toast(`Test saved, but ${parts.join(' and ')} failed to upload`, 'error')
      } else if (wasDraft) {
        toast('Draft refined and submitted', 'success')
      }
      navigate({ to: '/pellet-testing/$id', params: { id: session.id } })
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to save test'
      toast(msg, 'error')
    },
  })

  const deleteDraftMutation = useMutation({
    mutationFn: () => pelletTestApi.delete(draftId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pellet-drafts'] })
      qc.invalidateQueries({ queryKey: ['pellet-drafts-count'] })
      toast('Draft deleted', 'success')
      navigate({ to: '/drafts' })
    },
    onError: (err) => {
      toast(err instanceof Error ? err.message : 'Failed to delete draft', 'error')
    },
  })

  // Field-completion progress for the "X/7 fields filled" hint on refine.
  const filledChecks = [
    !!rifleId,
    !!pelletId,
    !!testDate,
    hasDistance,
    !!location,
    windMph !== '' || tempCelsius !== '',
    validGroups.length > 0 || imageFiles.length > 0 || existingImages.length > 0,
  ]
  const filledCount = filledChecks.filter(Boolean).length
  const totalCount = filledChecks.length

  const reasonText = !rifleId
    ? 'select a rifle'
    : !pelletId
      ? 'select or add a pellet'
      : !testDate
        ? 'pick a test date'
        : !hasGroupOrImage
          ? 'add a group size or upload a target photo'
          : !hasDistance && imageFiles.length === 0 && existingImages.length === 0
            ? 'enter a distance'
            : 'complete the highlighted fields'

  return (
    <div className={`p-4 lg:p-8 space-y-6 mx-auto ${draftId ? 'max-w-lg lg:max-w-6xl' : 'max-w-lg lg:max-w-3xl'}`}>
      {draftId ? (
        <div className="space-y-3">
          <Link to="/drafts" className="inline-flex items-center gap-1.5 text-xs tracking-wide text-muted hover:text-secondary transition-colors">
            <ArrowLeft size={14} /> All drafts
          </Link>
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <span className="inline-flex items-center gap-2 text-[10px] tracking-widest uppercase px-2 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                Draft{draft?.created_at ? ` · ${relative(draft.created_at)}` : ''}
              </span>
              <h1 className="t-page-title">Refine draft</h1>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                {draft?.created_at && (
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays size={12} className="opacity-70" />
                    Captured {captureDate(draft.created_at)}
                  </span>
                )}
                {draft?.location && (
                  <>
                    <span aria-hidden className="opacity-60">·</span>
                    <span className="inline-flex items-center gap-1">
                      <MapPin size={12} className="opacity-70" />
                      {draft.location}
                    </span>
                  </>
                )}
                <span aria-hidden className="opacity-60">·</span>
                <span>{filledCount}/{totalCount} fields filled</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setConfirmDeleteDraft(true)}
              disabled={deleteDraftMutation.isPending}
              className="inline-flex items-center gap-2 px-3 py-2 rounded border border-[var(--error-text)]/30 text-[var(--error-text)] text-xs tracking-widest uppercase hover:bg-[var(--error-bg)] transition-colors disabled:opacity-50"
            >
              <Trash2 size={14} />
              Delete
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <h1 className="t-page-title">
            New Pellet Test
          </h1>
        </div>
      )}

      <div className="lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-6">
        <div className={`space-y-4 ${draftId ? 'rounded-lg border border-subtle bg-surface p-5' : ''}`}>
          {draftId && (
            <h2 className="t-section-title">Test Details</h2>
          )}
          <Field label="Rifle">
            {rifles.length > 0 ? (
              <select value={rifleId} onChange={e => setRifleId(e.target.value)} className={inputCls}>
                <option value="">Select rifle…</option>
                {rifles.map(r => (
                  <option key={r.id} value={r.id}>{r.make} {r.model} ({r.calibre})</option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-muted">
                <a href="/gear" className="text-[var(--brass)] hover:opacity-80">Add a rifle</a> first
              </p>
            )}
          </Field>

          <Field label="Pellet">
            <select value={pelletId} onChange={e => {
              if (e.target.value === '__add__') {
                setShowAddPellet(true)
                setPelletId('')
              } else {
                setPelletId(e.target.value)
                setShowAddPellet(false)
              }
            }} className={inputCls}>
              <option value="">Select pellet…</option>
              {pellets.map(p => (
                <option key={p.id} value={p.id}>
                  {p.brand} {p.model}{p.head_size_mm ? ` ${p.head_size_mm}mm` : ''}
                </option>
              ))}
              <option value="__add__">+ Add new pellet…</option>
            </select>
          </Field>

          {showAddPellet && (
            <div className="space-y-3 p-3 rounded border border-subtle bg-surface">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Brand">
                  <input className={inputCls} placeholder="JSB" value={newPellet.brand} onChange={e => setNewPellet(p => ({ ...p, brand: e.target.value }))} />
                </Field>
                <Field label="Model">
                  <input className={inputCls} placeholder="Match Exact" value={newPellet.model} onChange={e => setNewPellet(p => ({ ...p, model: e.target.value }))} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Head size (mm)">
                  <input className={inputCls} type="number" step="0.01" placeholder="4.51" onChange={e => setNewPellet(p => ({ ...p, head_size_mm: e.target.value ? Number(e.target.value) : undefined }))} />
                </Field>
                <Field label="Weight (gr)">
                  <input className={inputCls} type="number" step="0.01" placeholder="8.44" onChange={e => setNewPellet(p => ({ ...p, weight_grains: e.target.value ? Number(e.target.value) : undefined }))} />
                </Field>
              </div>
              {addPelletMutation.isError && <p className="text-[var(--error-text)] text-xs">Failed to add pellet.</p>}
              <div className="flex gap-2">
                <button onClick={() => addPelletMutation.mutate()} disabled={addPelletMutation.isPending || !newPellet.brand || !newPellet.model} className="flex-1 py-2 rounded bg-[var(--brass)] text-inverse text-sm font-medium tracking-widest uppercase disabled:opacity-50 disabled:cursor-not-allowed">
                  {addPelletMutation.isPending ? 'Saving…' : 'Add Pellet'}
                </button>
                <button onClick={() => setShowAddPellet(false)} className="px-4 py-2 rounded border border-subtle text-muted text-sm hover:text-secondary transition-colors">Cancel</button>
              </div>
            </div>
          )}

          <Field label="Date">
            <input type="date" value={testDate} onChange={e => setTestDate(e.target.value)} className={`${inputCls} font-mono`} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Distance">
              <input type="number" step="any" placeholder="25" value={distanceValue} onChange={e => setDistanceValue(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Unit">
              <select value={distanceUnit} onChange={e => setDistanceUnit(e.target.value)} className={inputCls}>
                <option value="meters">Meters</option>
                <option value="yards">Yards</option>
              </select>
            </Field>
          </div>

          <Field label="Location">
            <LocationField
              value={location}
              onChange={setLocation}
              inputClassName={`${inputCls} placeholder:text-muted`}
            />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Wind (mph)">
              <input type="number" step="0.1" value={windMph} onChange={e => setWindMph(e.target.value)} placeholder="—" className={inputCls} />
            </Field>
            <Field label="Temp (°C)">
              <input type="number" step="0.1" value={tempCelsius} onChange={e => setTempCelsius(e.target.value)} placeholder="—" className={inputCls} />
            </Field>
            <Field label="Humidity (%)">
              <input type="number" step="1" value={humidityPct} onChange={e => setHumidityPct(e.target.value)} placeholder="—" className={inputCls} />
            </Field>
          </div>

          <Field label="Notes">
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Conditions, observations…" className={`${inputCls} placeholder:text-muted resize-none`} />
          </Field>

          <button type="button" onClick={() => setShowChrono(v => !v)} className="flex items-center gap-1.5 t-section-title hover:text-secondary transition-colors">
            {showChrono ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            Chronograph Data
          </button>
          {showChrono && (
            <div className="grid grid-cols-3 gap-3">
              <Field label="Velocity (fps)">
                <input type="number" step="0.1" value={velocityFps} onChange={e => setVelocityFps(e.target.value)} placeholder="—" className={inputCls} />
              </Field>
              <Field label="SD">
                <input type="number" step="0.01" value={velocitySd} onChange={e => setVelocitySd(e.target.value)} placeholder="—" className={inputCls} />
              </Field>
              <Field label="ES (fps)">
                <input type="number" step="0.1" value={extremeSpreadFps} onChange={e => setExtremeSpreadFps(e.target.value)} placeholder="—" className={inputCls} />
              </Field>
            </div>
          )}

          <button type="button" onClick={() => setShowAdvanced(v => !v)} className="flex items-center gap-1.5 t-section-title hover:text-secondary transition-colors">
            {showAdvanced ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            Advanced Conditions
          </button>
          {showAdvanced && (
            <div className="space-y-3">
              <Field label="Bench / Rest Setup">
                <input type="text" value={benchSetup} onChange={e => setBenchSetup(e.target.value)} placeholder="Front rest, rear bag…" className={`${inputCls} placeholder:text-muted`} />
              </Field>
              <Field label="Scope Details">
                <input type="text" value={scopeDetails} onChange={e => setScopeDetails(e.target.value)} placeholder="MTC Viper Pro 10×44, 40× mag…" className={`${inputCls} placeholder:text-muted`} />
              </Field>
              <Field label="Barometric Pressure (mbar)">
                <input type="number" step="0.1" value={barometricPressure} onChange={e => setBarometricPressure(e.target.value)} placeholder="—" className={inputCls} />
              </Field>
            </div>
          )}
        </div>

        <div className="space-y-4 mt-6 lg:mt-0">
          <div className={draftId ? 'rounded-lg border border-subtle bg-surface p-5 space-y-3' : ''}>
            <div className="flex items-center justify-between">
              <label className="t-section-title">Groups</label>
              <button onClick={addGroup} className="flex items-center gap-1 text-[11px] tracking-widest uppercase text-[var(--brass)] hover:opacity-80 transition-opacity">
                <Plus size={12} /> Add
              </button>
            </div>
            <div className="space-y-2">
              {groups.map((g, i) => {
                const sizeMM = Number(g.groupSizeMM)
                const moa = sizeMM > 0 && distM > 0 ? calcMOA(sizeMM, distM) : null
                return (
                  <div key={g.key} className="p-3 rounded border border-subtle bg-surface-hover space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[var(--brass-pill-bg)] text-[var(--brass)]">
                          <Target size={13} />
                        </span>
                        <span className="t-section-title">Group {i + 1}</span>
                      </div>
                      {groups.length > 1 && (
                        <button onClick={() => removeGroup(g.key)} className="text-muted hover:text-[var(--error-text)] transition-colors" aria-label="Remove group">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[10px] text-muted tracking-wide">Shots</label>
                        <input type="number" min="1" value={g.shotCount} onChange={e => updateGroup(g.key, 'shotCount', Number(e.target.value) || 5)} className={inputCls} />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted tracking-wide">Size (mm)</label>
                        <input type="number" step="0.01" min="0" value={g.groupSizeMM} onChange={e => updateGroup(g.key, 'groupSizeMM', e.target.value)} placeholder="0.00" className={inputCls} />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted tracking-wide">MOA</label>
                        <div className="px-3 py-2 text-sm text-muted font-mono bg-surface-hover rounded border border-subtle">
                          {moa != null ? moa.toFixed(3) : '—'}
                        </div>
                      </div>
                    </div>
                    <input type="text" value={g.notes} onChange={e => updateGroup(g.key, 'notes', e.target.value)} placeholder="Group notes (optional)" className={`${inputCls} text-xs placeholder:text-muted`} />
                  </div>
                )
              })}
            </div>
          </div>

          <div className={draftId ? 'rounded-lg border border-subtle bg-surface p-5 space-y-3' : ''}>
            <label className="block t-section-title mb-1">Target Photos</label>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={e => { handleImageSelect(e.target.files?.[0]); e.target.value = '' }} />
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { handleImageSelect(e.target.files?.[0]); e.target.value = '' }} />

            {(existingImages.length > 0 || imagePreviews.length > 0) && (
              <div className="grid grid-cols-3 gap-2 mb-2">
                {existingImages.map((img, i) => (
                  <div key={img.id} className="relative">
                    <img src={img.image_url} alt={`Draft photo ${i + 1}`} className="rounded border border-subtle w-full aspect-square object-cover" />
                    <button
                      onClick={() => deleteExistingImage.mutate(img.id)}
                      disabled={deleteExistingImage.isPending}
                      className="absolute top-1 right-1 bg-page/80 backdrop-blur rounded-full p-0.5 text-muted hover:text-primary transition-colors disabled:opacity-50"
                      aria-label="Remove photo"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
                {imagePreviews.map((preview, i) => (
                  <div key={`new-${i}`} className="relative">
                    <img src={preview} alt={`Target photo ${i + 1} preview`} className="rounded border border-subtle w-full aspect-square object-cover" />
                    <button
                      onClick={() => removeImage(i)}
                      className="absolute top-1 right-1 bg-page/80 backdrop-blur rounded-full p-0.5 text-muted hover:text-primary transition-colors"
                      aria-label="Remove photo"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <button type="button" onClick={() => fileInputRef.current?.click()} className="flex-1 flex items-center justify-center gap-2 border border-dashed border-subtle rounded p-3 text-muted text-sm hover:border-[var(--brass)]/50 hover:text-secondary transition-colors">
                <Upload size={16} /> Upload
              </button>
              <button type="button" onClick={() => cameraInputRef.current?.click()} className="flex-1 flex items-center justify-center gap-2 border border-dashed border-subtle rounded p-3 text-muted text-sm hover:border-[var(--brass)]/50 hover:text-secondary transition-colors">
                <Camera size={16} /> Camera
              </button>
            </div>
          </div>

          {mutation.isError && (
            <p className="text-[var(--error-text)] text-sm">Failed to save test. Please try again.</p>
          )}

          {draftId && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-[var(--brass-pill-bg)] border-l-2 border-[var(--brass)] text-sm text-secondary">
              {canSubmit ? (
                <>
                  <CheckCircle2 size={15} className="text-[var(--brass)] mt-0.5 shrink-0" />
                  <span>Ready to publish — review and save changes.</span>
                </>
              ) : (
                <>
                  <Sparkles size={15} className="text-[var(--brass)] mt-0.5 shrink-0" />
                  <span>Almost done — <strong className="font-medium">{reasonText}</strong> to publish as a test.</span>
                </>
              )}
            </div>
          )}

          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !canSubmit}
            className="w-full py-3 rounded font-medium tracking-widest uppercase text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-[var(--brass)] text-inverse hover:opacity-90 inline-flex items-center justify-center gap-2"
          >
            {mutation.isPending ? 'Saving…' : draftId ? <><CheckCircle2 size={15} /> Save Changes</> : 'Save Test'}
          </button>
          {!draftId && !mutation.isPending && !canSubmit && (
            <p className="text-xs text-muted text-center">
              {!rifleId ? 'Select a rifle to continue.'
                : !pelletId ? 'Select or add a pellet.'
                : !testDate ? 'Pick a test date.'
                : !hasGroupOrImage ? 'Add at least one group size or upload a target photo.'
                : !hasDistance && imageFiles.length === 0 && existingImages.length === 0 ? 'Enter a distance.'
                : 'Complete the highlighted fields to save.'}
            </p>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDeleteDraft}
        title="Delete draft?"
        message="This pellet test draft will be permanently deleted. This cannot be undone."
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
