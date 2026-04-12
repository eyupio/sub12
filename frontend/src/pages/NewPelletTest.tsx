import { useState, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Camera, Upload, X } from 'lucide-react'
import { pelletTestApi } from '../api/pelletTesting'
import { gearApi, CreatePelletPayload } from '../api/gear'

const today = () => new Date().toISOString().slice(0, 10)

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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] tracking-widest uppercase text-muted mb-1">{label}</label>
      {children}
    </div>
  )
}

export default function NewPelletTest() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  // Form state
  const [rifleId, setRifleId] = useState('')
  const [pelletId, setPelletId] = useState('')
  const [testDate, setTestDate] = useState(today())
  const [distanceValue, setDistanceValue] = useState('')
  const [distanceUnit, setDistanceUnit] = useState('meters')
  const [location, setLocation] = useState('')
  const [windMph, setWindMph] = useState('')
  const [tempCelsius, setTempCelsius] = useState('')
  const [humidityPct, setHumidityPct] = useState('')
  const [notes, setNotes] = useState('')

  // Groups
  const [nextKey, setNextKey] = useState(2)
  const [groups, setGroups] = useState<GroupRow[]>([
    { key: 1, shotCount: 5, groupSizeMM: '', notes: '' },
  ])

  // Images
  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [imagePreviews, setImagePreviews] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  // Inline add pellet
  const [showAddPellet, setShowAddPellet] = useState(false)
  const [newPellet, setNewPellet] = useState<CreatePelletPayload>({ brand: '', model: '' })

  // Data
  const { data: rifleData } = useQuery({ queryKey: ['rifles'], queryFn: () => gearApi.listRifles() })
  const { data: pelletData } = useQuery({ queryKey: ['pellets'], queryFn: () => gearApi.listPellets() })
  const rifles = rifleData?.items ?? []
  const pellets = pelletData?.items ?? []

  const addPelletMutation = useMutation({
    mutationFn: () => gearApi.createPellet(newPellet),
    onSuccess: (pellet) => {
      qc.invalidateQueries({ queryKey: ['pellets'] })
      setPelletId(pellet.id)
      setShowAddPellet(false)
      setNewPellet({ brand: '', model: '' })
    },
  })

  // Computed distance in meters for MOA preview
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
        alert('Image must be under 10 MB')
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

  const validGroups = groups.filter(g => g.groupSizeMM && Number(g.groupSizeMM) > 0)
  const canSubmit = rifleId && pelletId && testDate && distanceValue && Number(distanceValue) > 0 && validGroups.length > 0

  const mutation = useMutation({
    mutationFn: async () => {
      const session = await pelletTestApi.create({
        rifle_id: rifleId,
        pellet_id: pelletId,
        test_date: testDate,
        distance_value: Number(distanceValue),
        distance_unit: distanceUnit,
        location: location || undefined,
        wind_mph: windMph ? Number(windMph) : undefined,
        temp_celsius: tempCelsius ? Number(tempCelsius) : undefined,
        humidity_pct: humidityPct ? Number(humidityPct) : undefined,
        notes: notes || undefined,
      })

      // Create groups
      for (const g of validGroups) {
        await pelletTestApi.createGroup(session.id, {
          shot_count: g.shotCount,
          group_size_mm: Number(g.groupSizeMM),
          notes: g.notes || undefined,
        })
      }

      // Upload images
      for (const file of imageFiles) {
        await pelletTestApi.uploadImage(session.id, file)
      }

      return session
    },
    onSuccess: (session) => {
      qc.invalidateQueries({ queryKey: ['pellet-tests'] })
      qc.invalidateQueries({ queryKey: ['pellet-test-stats'] })
      navigate({ to: '/pellet-testing/$id', params: { id: session.id } })
    },
  })

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-lg lg:max-w-3xl mx-auto">
      <h1 className="text-xl lg:text-2xl font-medium tracking-widest uppercase text-secondary">
        New Pellet Test
      </h1>

      <div className="lg:grid lg:grid-cols-2 lg:gap-8">
        {/* Left column: setup */}
        <div className="space-y-4">
          {/* Rifle */}
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

          {/* Pellet */}
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

          {/* Inline add pellet */}
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
                <button onClick={() => addPelletMutation.mutate()} disabled={addPelletMutation.isPending || !newPellet.brand || !newPellet.model} className="flex-1 py-2 rounded bg-[var(--brass)] text-inverse text-sm font-medium tracking-widest uppercase disabled:opacity-40">
                  {addPelletMutation.isPending ? 'Saving…' : 'Add Pellet'}
                </button>
                <button onClick={() => setShowAddPellet(false)} className="px-4 py-2 rounded border border-subtle text-muted text-sm hover:text-secondary transition-colors">Cancel</button>
              </div>
            </div>
          )}

          {/* Date & distance */}
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
            <input type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="Range / club" className={`${inputCls} placeholder:text-muted`} />
          </Field>

          {/* Conditions */}
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
        </div>

        {/* Right column: groups + images + submit */}
        <div className="space-y-4 mt-6 lg:mt-0">

          {/* Groups */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] tracking-widest uppercase text-muted">Groups</label>
              <button onClick={addGroup} className="flex items-center gap-1 text-[11px] tracking-widest uppercase text-[var(--brass)] hover:opacity-80 transition-opacity">
                <Plus size={12} /> Add
              </button>
            </div>
            <div className="space-y-2">
              {groups.map((g, i) => {
                const sizeMM = Number(g.groupSizeMM)
                const moa = sizeMM > 0 && distM > 0 ? calcMOA(sizeMM, distM) : null
                return (
                  <div key={g.key} className="p-3 rounded border border-subtle bg-surface space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] tracking-widest uppercase text-muted">Group {i + 1}</span>
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

          {/* Images */}
          <div>
            <label className="block text-[11px] tracking-widest uppercase text-muted mb-1">Target Photos</label>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={e => { handleImageSelect(e.target.files?.[0]); e.target.value = '' }} />
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { handleImageSelect(e.target.files?.[0]); e.target.value = '' }} />

            {imagePreviews.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-2">
                {imagePreviews.map((preview, i) => (
                  <div key={i} className="relative">
                    <img src={preview} alt="" className="rounded border border-subtle w-full aspect-square object-cover" />
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

          {/* Error */}
          {mutation.isError && (
            <p className="text-[var(--error-text)] text-sm">Failed to save test. Please try again.</p>
          )}

          {/* Submit */}
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !canSubmit}
            className="w-full py-3 rounded font-medium tracking-widest uppercase text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-[var(--brass)] text-inverse hover:opacity-90"
          >
            {mutation.isPending ? 'Saving…' : 'Save Test'}
          </button>
        </div>
      </div>
    </div>
  )
}
