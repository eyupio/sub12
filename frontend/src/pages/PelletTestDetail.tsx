import { useState, useRef } from 'react'
import { Link, useParams, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Trash2, Plus, Camera, Upload, X, Check, Crosshair, Download, Share2 } from 'lucide-react'
import { toast } from '../store/toast'
import { useAuthStore } from '../store/auth'
import { ShareDialog } from '../components/ShareDialog'
import {
  pelletTestApi,
  PelletTestGroup,
  PelletTestImage,
  type CreateMeasurementPayload,
  type PelletTestMeasurement,
} from '../api/pelletTesting'
import type { DetectedHole } from '../utils/holeDetection'
import ImageMeasurement from '../components/ImageMeasurement'
import ConfidenceBadge from '../components/ConfidenceBadge'

const inputCls =
  'w-full bg-surface border border-subtle rounded px-3 py-2 text-primary text-sm placeholder:text-muted focus:outline-none focus:border-[var(--brass)]/50'

function formatDistance(m: number, unit: string): string {
  if (unit === 'yards') {
    return `${(m / 0.9144).toFixed(0)} yd`
  }
  return `${m} m`
}

function withSourceTag(notes: string | undefined, source: 'manual' | 'image'): string {
  const cleaned = cleanSourceTag(notes)
  const sourceTag = source === 'image' ? '[source:image]' : '[source:manual]'
  return cleaned ? `${cleaned} ${sourceTag}` : sourceTag
}

function cleanSourceTag(notes: string | undefined): string {
  return (notes ?? '').replace(/\s*\[source:(manual|image)\]\s*/g, ' ').trim()
}

function sourceLabel(notes: string | undefined): string {
  if ((notes ?? '').includes('[source:image]')) return 'image analysis'
  return 'manual'
}

export default function PelletTestDetail() {
  const { id } = useParams({ strict: false })
  const navigate = useNavigate()
  const qc = useQueryClient()
  const authUser = useAuthStore(s => s.user)

  const [addingGroup, setAddingGroup] = useState(false)
  const [newGroupSize, setNewGroupSize] = useState('')
  const [newShotCount, setNewShotCount] = useState(5)
  const [newGroupNotes, setNewGroupNotes] = useState('')
  const [newGroupMethod, setNewGroupMethod] = useState<'manual' | 'image'>('manual')
  const [newGroupImageId, setNewGroupImageId] = useState('')
  const [pendingMeasuredGroupId, setPendingMeasuredGroupId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  // Measurement modal state
  const [measureImage, setMeasureImage] = useState<PelletTestImage | null>(null)
  const [showShare, setShowShare] = useState(false)

  const { data: session, isLoading } = useQuery({
    queryKey: ['pellet-tests', id],
    queryFn: () => pelletTestApi.get(id!),
    enabled: !!id,
  })

  const { data: badge } = useQuery({
    queryKey: ['pellet-test-confidence', session?.rifle_id, session?.pellet_id],
    queryFn: () => pelletTestApi.confidenceBadge(session!.rifle_id, session!.pellet_id),
    enabled: !!session?.rifle_id && !!session?.pellet_id,
  })

  const { data: measurementsData, isLoading: measurementsLoading } = useQuery({
    queryKey: ['pellet-tests', id, 'images', measureImage?.id, 'measurements'],
    queryFn: () => pelletTestApi.getMeasurements(id!, measureImage!.id),
    enabled: !!id && !!measureImage?.id,
  })

  const handleExport = async () => {
    try {
      const data = await pelletTestApi.exportSession(id!)
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `pellet-test-${id}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // silently fail — user can try again
    }
  }

  const deleteMutation = useMutation({
    mutationFn: () => pelletTestApi.delete(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pellet-tests'] })
      qc.invalidateQueries({ queryKey: ['pellet-test-stats'] })
      navigate({ to: '/pellet-testing' })
    },
  })

  const addGroupMutation = useMutation({
    mutationFn: () => pelletTestApi.createGroup(id!, {
      shot_count: newShotCount,
      group_size_mm: Number(newGroupSize),
      notes: withSourceTag(newGroupNotes || undefined, 'manual'),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pellet-tests', id] })
      qc.invalidateQueries({ queryKey: ['pellet-test-stats'] })
      setAddingGroup(false)
      setNewGroupSize('')
      setNewShotCount(5)
      setNewGroupNotes('')
      setNewGroupMethod('manual')
      setNewGroupImageId('')
    },
  })

  const addImageGroupMutation = useMutation({
    mutationFn: async () => {
      const group = await pelletTestApi.createGroup(id!, {
        shot_count: newShotCount,
        group_size_mm: Number(newGroupSize),
        notes: withSourceTag(newGroupNotes || undefined, 'manual'),
      })
      return group
    },
    onSuccess: (group) => {
      qc.invalidateQueries({ queryKey: ['pellet-tests', id] })
      qc.invalidateQueries({ queryKey: ['pellet-test-stats'] })
      const picked = (session.images ?? []).find(img => img.id === newGroupImageId)
      if (picked) {
        setPendingMeasuredGroupId(group.id)
        setMeasureImage(picked)
      }
      setAddingGroup(false)
      setNewGroupSize('')
      setNewShotCount(5)
      setNewGroupNotes('')
      setNewGroupMethod('manual')
      setNewGroupImageId('')
    },
  })

  const deleteGroupMutation = useMutation({
    mutationFn: (groupId: string) => pelletTestApi.deleteGroup(id!, groupId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pellet-tests', id] })
      qc.invalidateQueries({ queryKey: ['pellet-test-stats'] })
    },
  })

  const syncMeasuredGroupMutation = useMutation({
    mutationFn: ({ groupId, sizeMM, shotCount }: { groupId: string; sizeMM: number; shotCount: number }) => {
      const existing = session.groups?.find(g => g.id === groupId)
      return pelletTestApi.updateGroup(id!, groupId, {
        group_size_mm: sizeMM,
        shot_count: shotCount > 0 ? shotCount : (existing?.shot_count ?? newShotCount),
        notes: withSourceTag(existing?.notes, 'image'),
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pellet-tests', id] })
      qc.invalidateQueries({ queryKey: ['pellet-test-stats'] })
    },
  })

  const uploadMutation = useMutation({
    mutationFn: (file: File) => pelletTestApi.uploadImage(id!, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pellet-tests', id] })
    },
  })

  const deleteImageMutation = useMutation({
    mutationFn: (imageId: string) => pelletTestApi.deleteImage(id!, imageId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pellet-tests', id] })
    },
  })

  const saveMeasurementMutation = useMutation({
    mutationFn: async ({ imageId, payload, analyzedSizeMM, analyzedShotCount }: { imageId: string; payload: CreateMeasurementPayload; analyzedSizeMM?: number | null; analyzedShotCount?: number }) => {
      const measurement = await pelletTestApi.createMeasurement(id!, imageId, payload)
      if (pendingMeasuredGroupId && analyzedSizeMM && analyzedSizeMM > 0) {
        await syncMeasuredGroupMutation.mutateAsync({
          groupId: pendingMeasuredGroupId,
          sizeMM: analyzedSizeMM,
          shotCount: analyzedShotCount ?? 0,
        })
      }
      return measurement
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['pellet-tests', id] })
      qc.invalidateQueries({ queryKey: ['pellet-tests', id, 'images', variables.imageId, 'measurements'] })
      setMeasureImage(null)
      setPendingMeasuredGroupId(null)
    },
    onError: () => {
      toast('Failed to save measurement.', 'error')
    },
  })

  const saveDetectionsMutation = useMutation({
    mutationFn: async ({
      imageId,
      payload,
      detections,
      annotatedBlob,
      analyzedSizeMM,
      analyzedShotCount,
    }: {
      imageId: string
      payload: CreateMeasurementPayload
      detections: DetectedHole[]
      annotatedBlob: Blob | null
      analyzedSizeMM?: number | null
      analyzedShotCount?: number
    }) => {
      const measurement = await pelletTestApi.createMeasurement(id!, imageId, payload)

      await pelletTestApi.createDetections(id!, imageId, measurement.id, {
        detection_method: 'auto',
        detections: detections.map(detection => ({
          center_x: detection.centerX,
          center_y: detection.centerY,
          radius_pixels: detection.radiusPixels,
          diameter_mm: detection.diameterMM,
          confidence: detection.confidence,
        })),
      })

      if (annotatedBlob) {
        await pelletTestApi.uploadAnnotatedImage(id!, imageId, measurement.id, annotatedBlob)
      }

      if (pendingMeasuredGroupId && analyzedSizeMM && analyzedSizeMM > 0) {
        await syncMeasuredGroupMutation.mutateAsync({
          groupId: pendingMeasuredGroupId,
          sizeMM: analyzedSizeMM,
          shotCount: analyzedShotCount ?? 0,
        })
      }

      return measurement
    },
    onSuccess: (_measurement, variables) => {
      qc.invalidateQueries({ queryKey: ['pellet-tests', id] })
      qc.invalidateQueries({ queryKey: ['pellet-tests', id, 'images', variables.imageId, 'measurements'] })
      setMeasureImage(null)
      setPendingMeasuredGroupId(null)
    },
    onError: () => {
      toast('Failed to save detections.', 'error')
    },
  })

  function handleImageSelect(file: File | undefined) {
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast('Image must be under 10 MB', 'error')
        return
      }
      uploadMutation.mutate(file)
    }
  }

  if (isLoading) {
    return (
      <div className="p-4 lg:p-8 max-w-lg lg:max-w-3xl mx-auto">
        <div className="h-8 w-48 rounded bg-surface animate-pulse mb-6" />
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-20 rounded bg-surface animate-pulse" />)}
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="p-4 lg:p-8 max-w-lg lg:max-w-3xl mx-auto">
        <p className="text-muted">Test not found.</p>
      </div>
    )
  }

  const groups = session.groups ?? []
  const images = session.images ?? []
  const existingMeasurement: PelletTestMeasurement | undefined =
    measurementsData?.items && measurementsData.items.length > 0
      ? measurementsData.items[measurementsData.items.length - 1]
      : undefined

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-lg lg:max-w-3xl mx-auto">

      {/* Header */}
      <div>
        <Link to="/pellet-testing" className="flex items-center gap-1 text-[11px] tracking-widest uppercase text-muted hover:text-secondary transition-colors mb-3">
          <ChevronLeft size={14} /> Back
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl lg:text-2xl font-medium tracking-widest uppercase text-secondary">
              Pellet Test
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-sm text-muted font-mono">{session.test_date}</p>
              {badge && <ConfidenceBadge badge={badge} />}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowShare(true)}
              className="text-muted hover:text-secondary transition-colors"
              aria-label="Share test"
              title="Share"
            >
              <Share2 size={18} />
            </button>
            <button
              onClick={handleExport}
              className="text-muted hover:text-secondary transition-colors"
              aria-label="Export test data"
              title="Export as JSON"
            >
              <Download size={18} />
            </button>
            <button
              onClick={() => { if (window.confirm('Delete this pellet test?')) deleteMutation.mutate() }}
              disabled={deleteMutation.isPending}
              className="text-muted hover:text-[var(--error-text)] transition-colors"
              aria-label="Delete test"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Rifle + Pellet */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 lg:p-4 rounded border border-subtle bg-surface">
          <p className="text-[10px] tracking-widest uppercase text-muted mb-1">Rifle</p>
          {session.rifle ? (
            <>
              <p className="text-sm text-secondary font-medium">{session.rifle.make} {session.rifle.model}</p>
              <p className="text-[11px] text-muted">{session.rifle.calibre}</p>
            </>
          ) : (
            <p className="text-sm text-muted">—</p>
          )}
        </div>
        <div className="p-3 lg:p-4 rounded border border-subtle bg-surface">
          <p className="text-[10px] tracking-widest uppercase text-muted mb-1">Pellet</p>
          {session.pellet ? (
            <>
              <p className="text-sm text-secondary font-medium">{session.pellet.brand} {session.pellet.model}</p>
              <p className="text-[11px] text-muted">
                {[
                  session.pellet.head_size_mm != null && `${session.pellet.head_size_mm}mm`,
                  session.pellet.weight_grains != null && `${session.pellet.weight_grains}gr`,
                ].filter(Boolean).join(' · ')}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted">—</p>
          )}
        </div>
      </div>

      {/* Conditions */}
      <div className="p-3 lg:p-4 rounded border border-subtle bg-surface">
        <p className="text-[10px] tracking-widest uppercase text-muted mb-2">Conditions</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
          <div>
            <span className="text-muted text-[10px] tracking-wide uppercase">Distance</span>
            <p className="text-secondary font-mono">{formatDistance(session.distance_m, session.distance_unit)}</p>
          </div>
          {session.location && (
            <div>
              <span className="text-muted text-[10px] tracking-wide uppercase">Location</span>
              <p className="text-secondary">{session.location}</p>
            </div>
          )}
          {session.wind_mph != null && (
            <div>
              <span className="text-muted text-[10px] tracking-wide uppercase">Wind</span>
              <p className="text-secondary font-mono">{session.wind_mph} mph</p>
            </div>
          )}
          {session.temp_celsius != null && (
            <div>
              <span className="text-muted text-[10px] tracking-wide uppercase">Temp</span>
              <p className="text-secondary font-mono">{session.temp_celsius}°C</p>
            </div>
          )}
          {session.humidity_pct != null && (
            <div>
              <span className="text-muted text-[10px] tracking-wide uppercase">Humidity</span>
              <p className="text-secondary font-mono">{session.humidity_pct}%</p>
            </div>
          )}
          {session.barometric_pressure_mbar != null && (
            <div>
              <span className="text-muted text-[10px] tracking-wide uppercase">Pressure</span>
              <p className="text-secondary font-mono">{session.barometric_pressure_mbar} mbar</p>
            </div>
          )}
          {session.bench_setup && (
            <div>
              <span className="text-muted text-[10px] tracking-wide uppercase">Bench Setup</span>
              <p className="text-secondary">{session.bench_setup}</p>
            </div>
          )}
          {session.scope_details && (
            <div>
              <span className="text-muted text-[10px] tracking-wide uppercase">Scope</span>
              <p className="text-secondary">{session.scope_details}</p>
            </div>
          )}
        </div>
        {session.notes && (
          <p className="text-sm text-muted mt-2 border-t border-subtle pt-2">{session.notes}</p>
        )}
      </div>

      {/* Velocity / Chrono */}
      {(session.velocity_fps != null || session.velocity_sd != null || session.extreme_spread_fps != null) && (
        <div className="p-3 lg:p-4 rounded border border-subtle bg-surface">
          <p className="text-[10px] tracking-widest uppercase text-muted mb-2">Chronograph</p>
          <div className="grid grid-cols-3 gap-3 text-sm">
            {session.velocity_fps != null && (
              <div>
                <span className="text-muted text-[10px] tracking-wide uppercase">Avg FPS</span>
                <p className="text-secondary font-mono">{session.velocity_fps}</p>
              </div>
            )}
            {session.velocity_sd != null && (
              <div>
                <span className="text-muted text-[10px] tracking-wide uppercase">SD</span>
                <p className="text-secondary font-mono">{session.velocity_sd}</p>
              </div>
            )}
            {session.extreme_spread_fps != null && (
              <div>
                <span className="text-muted text-[10px] tracking-wide uppercase">ES</span>
                <p className="text-secondary font-mono">{session.extreme_spread_fps} fps</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Summary */}
      {session.group_count > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 rounded border border-subtle bg-surface text-center">
            <p className="text-[10px] tracking-widest uppercase text-muted">Best</p>
            <p className="text-lg font-mono font-semibold text-[var(--brass)]">
              {session.best_group_size_mm?.toFixed(2)}<span className="text-xs">mm</span>
            </p>
          </div>
          <div className="p-3 rounded border border-subtle bg-surface text-center">
            <p className="text-[10px] tracking-widest uppercase text-muted">Average</p>
            <p className="text-lg font-mono font-semibold text-secondary">
              {session.average_group_size_mm?.toFixed(2)}<span className="text-xs">mm</span>
            </p>
          </div>
          <div className="p-3 rounded border border-subtle bg-surface text-center">
            <p className="text-[10px] tracking-widest uppercase text-muted">Groups</p>
            <p className="text-lg font-mono font-semibold text-secondary">{session.group_count}</p>
          </div>
        </div>
      )}

      {/* Groups */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[11px] tracking-widest uppercase text-muted">Groups</h2>
          {!addingGroup && (
            <button onClick={() => setAddingGroup(true)} className="flex items-center gap-1 text-[11px] tracking-widest uppercase text-[var(--brass)] hover:opacity-80 transition-opacity">
              <Plus size={12} /> Add
            </button>
          )}
        </div>

        {addingGroup && (
          <div className="p-3 rounded border border-subtle bg-surface space-y-2 mb-3">
                <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-muted tracking-wide">Shots</label>
                <input type="number" min="1" value={newShotCount} onChange={e => setNewShotCount(Number(e.target.value) || 5)} className={inputCls} />
              </div>
              <div>
                <label className="text-[10px] text-muted tracking-wide">Size (mm)</label>
                <input type="number" step="0.01" min="0" value={newGroupSize} onChange={e => setNewGroupSize(e.target.value)} placeholder="0.00" className={inputCls} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setNewGroupMethod('manual')} className={`py-2 rounded text-[11px] tracking-widest uppercase border ${newGroupMethod === 'manual' ? 'border-[var(--brass)] text-[var(--brass)] bg-[var(--brass)]/10' : 'border-subtle text-muted'}`}>
                Manual
              </button>
              <button onClick={() => setNewGroupMethod('image')} className={`py-2 rounded text-[11px] tracking-widest uppercase border ${newGroupMethod === 'image' ? 'border-[var(--brass)] text-[var(--brass)] bg-[var(--brass)]/10' : 'border-subtle text-muted'}`}>
                Image analysis
              </button>
            </div>
            {newGroupMethod === 'image' && (
              <select value={newGroupImageId} onChange={e => setNewGroupImageId(e.target.value)} className={inputCls}>
                <option value="">Select photo for analysis…</option>
                {images.map((img: PelletTestImage) => <option key={img.id} value={img.id}>{img.created_at}</option>)}
              </select>
            )}
            <input type="text" value={newGroupNotes} onChange={e => setNewGroupNotes(e.target.value)} placeholder="Notes (optional)" className={`${inputCls} text-xs`} />
            {addGroupMutation.isError && <p className="text-[var(--error-text)] text-xs">Failed to add group.</p>}
            <div className="flex gap-2">
              <button onClick={() => newGroupMethod === 'image' ? addImageGroupMutation.mutate() : addGroupMutation.mutate()} disabled={addGroupMutation.isPending || addImageGroupMutation.isPending || !newGroupSize || Number(newGroupSize) <= 0 || (newGroupMethod === 'image' && !newGroupImageId)} className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[var(--brass)]/20 border border-[var(--brass)]/30 text-[11px] tracking-widest uppercase text-[var(--brass)] hover:bg-[var(--brass)]/30 transition-colors disabled:opacity-40">
                <Check size={13} /> {addGroupMutation.isPending || addImageGroupMutation.isPending ? 'Saving…' : newGroupMethod === 'image' ? 'Analyze image' : 'Save'}
              </button>
              <button onClick={() => setAddingGroup(false)} className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-subtle text-[11px] tracking-widest uppercase text-muted hover:text-secondary transition-colors">
                <X size={13} /> Cancel
              </button>
            </div>
          </div>
        )}

        {groups.length === 0 ? (
          <p className="text-sm text-muted">No groups recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {groups.map((g: PelletTestGroup) => (
              <div key={g.id} className="flex items-center gap-3 p-3 rounded border border-subtle bg-surface">
                <div className="w-8 h-8 rounded bg-surface-hover flex items-center justify-center text-xs font-mono text-muted shrink-0">
                  #{g.group_number}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-3">
                    <span className="text-sm text-secondary font-mono font-medium">{g.group_size_mm.toFixed(2)}mm</span>
                    {g.group_size_moa != null && (
                      <span className="text-[11px] text-muted font-mono">{g.group_size_moa.toFixed(3)} MOA</span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted">{g.shot_count} shots · {sourceLabel(g.notes)}{cleanSourceTag(g.notes) ? ` · ${cleanSourceTag(g.notes)}` : ''}</p>
                </div>
                <button
                  onClick={() => { if (window.confirm('Delete this group?')) deleteGroupMutation.mutate(g.id) }}
                  className="text-muted hover:text-[var(--error-text)] transition-colors shrink-0"
                  aria-label="Delete group"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Images */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[11px] tracking-widest uppercase text-muted">Photos</h2>
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={e => { handleImageSelect(e.target.files?.[0]); e.target.value = '' }} />
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { handleImageSelect(e.target.files?.[0]); e.target.value = '' }} />

        {images.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
            {images.map((img: PelletTestImage) => (
              <div key={img.id} className="relative group">
                <img src={img.image_url} alt="" className="rounded border border-subtle w-full aspect-square object-cover cursor-pointer" onClick={() => setMeasureImage(img)} />
                <button
                  onClick={(e) => { e.stopPropagation(); setMeasureImage(img) }}
                  className="absolute bottom-1 left-1 bg-page/80 backdrop-blur rounded-full p-1 text-[var(--brass)] opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="Measure image"
                  title="Open measurement tool"
                >
                  <Crosshair size={14} />
                </button>
                <button
                  onClick={() => { if (window.confirm('Remove this photo?')) deleteImageMutation.mutate(img.id) }}
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
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending} className="flex-1 flex items-center justify-center gap-2 border border-dashed border-subtle rounded p-3 text-muted text-sm hover:border-[var(--brass)]/50 hover:text-secondary transition-colors disabled:opacity-40">
            <Upload size={16} /> {uploadMutation.isPending ? 'Uploading…' : 'Upload'}
          </button>
          <button type="button" onClick={() => cameraInputRef.current?.click()} disabled={uploadMutation.isPending} className="flex-1 flex items-center justify-center gap-2 border border-dashed border-subtle rounded p-3 text-muted text-sm hover:border-[var(--brass)]/50 hover:text-secondary transition-colors disabled:opacity-40">
            <Camera size={16} /> Camera
          </button>
        </div>
      </div>

      {/* Measurement Modal */}
      {measureImage && session && (
        measurementsLoading ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-page">
            <p className="text-sm text-muted">Loading measurement…</p>
          </div>
        ) : (
          <ImageMeasurement
            key={`${measureImage.id}:${existingMeasurement?.id ?? 'new'}`}
            imageUrl={measureImage.image_url}
            distanceM={session.distance_m}
            sessionId={id!}
            imageId={measureImage.id}
            existingMeasurement={existingMeasurement}
            onSave={(payload, analysisMeta) => saveMeasurementMutation.mutate({ imageId: measureImage.id, payload, analyzedSizeMM: analysisMeta.groupSizeMM, analyzedShotCount: analysisMeta.shotCount })}
            onSaveDetections={(payload, detections, annotatedBlob, analysisMeta) =>
              saveDetectionsMutation.mutate({
                imageId: measureImage.id,
                payload,
                detections,
                annotatedBlob,
                analyzedSizeMM: analysisMeta.groupSizeMM,
                analyzedShotCount: analysisMeta.shotCount,
              })
            }
            isSaving={saveMeasurementMutation.isPending || saveDetectionsMutation.isPending}
            saveError={saveMeasurementMutation.isError ? 'Failed to save.' : saveDetectionsMutation.isError ? 'Failed to save.' : null}
            onClose={() => { setMeasureImage(null); setPendingMeasuredGroupId(null) }}
            defaultDistanceUnit={(authUser?.default_distance_unit as 'meters' | 'yards') ?? undefined}
            defaultMeasurementUnit={(authUser?.default_measurement_unit as 'cm' | 'mm') ?? undefined}
          />
        )
      )}

      {showShare && id && (
        <ShareDialog
          targetId={id}
          targetType="pellet_test"
          targetLabel="Pellet Test"
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  )
}
