import { useState, useRef, useMemo } from 'react'
import { Link, useParams, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Trash2, Plus, Camera, Upload, Check, Download, Share2, X, Pencil } from 'lucide-react'
import { toast } from '../store/toast'
import { useAuthStore } from '../store/auth'
import { ShareDialog } from '../components/ShareDialog'
import {
  pelletTestApi,
  PelletTestGroup,
  PelletTestImage,
  type CreateMeasurementPayload,
  type PelletTestMeasurement,
  type PelletTestDetection,
} from '../api/pelletTesting'
import type { DetectedHole } from '../utils/holeDetection'
import ImageMeasurement from '../components/ImageMeasurement'
import ScoredImageCard from '../components/ScoredImageCard'
import ConfidenceBadge from '../components/ConfidenceBadge'
import { ConfirmDialog } from '../components/ConfirmDialog'

type PendingDelete =
  | { kind: 'test' }
  | { kind: 'group'; id: string }
  | { kind: 'image'; id: string }
  | null

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
  type PendingGroupSync =
    | { mode: 'update'; groupId: string }
    | { mode: 'create'; shotCount: number; notes?: string }
    | null
  const [pendingGroupSync, setPendingGroupSync] = useState<PendingGroupSync>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  // Measurement modal state
  const [measureImage, setMeasureImage] = useState<PelletTestImage | null>(null)
  const [showShare, setShowShare] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null)

  // Session edit state
  const [editing, setEditing] = useState(false)
  const [editMeta, setEditMeta] = useState({
    test_date: '',
    distance_value: '',
    distance_unit: 'meters',
    location: '',
    notes: '',
    is_public: false,
  })

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

  const { data: scoring } = useQuery({
    queryKey: ['pellet-tests', id, 'scoring'],
    queryFn: () => pelletTestApi.getSessionScoring(id!),
    enabled: !!id,
  })

  const measurementsByImage = useMemo(() => {
    const m = new Map<string, PelletTestMeasurement>()
    for (const x of scoring?.measurements ?? []) {
      const prev = m.get(x.image_id)
      if (!prev || x.created_at > prev.created_at) m.set(x.image_id, x)
    }
    return m
  }, [scoring])

  const detectionsByMeasurement = useMemo(() => {
    const m = new Map<string, PelletTestDetection[]>()
    for (const d of scoring?.detections ?? []) {
      const arr = m.get(d.measurement_id) ?? []
      arr.push(d)
      m.set(d.measurement_id, arr)
    }
    return m
  }, [scoring])

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

  const updateSessionMutation = useMutation({
    mutationFn: () => {
      const distance = editMeta.distance_value === '' ? undefined : Number(editMeta.distance_value)
      return pelletTestApi.update(id!, {
        test_date: editMeta.test_date || undefined,
        distance_value: distance,
        distance_unit: editMeta.distance_unit || undefined,
        location: editMeta.location || undefined,
        notes: editMeta.notes || undefined,
        is_public: editMeta.is_public,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pellet-tests', id] })
      qc.invalidateQueries({ queryKey: ['pellet-tests'] })
      setEditing(false)
      toast('Pellet test updated', 'success')
    },
    onError: () => {
      toast('Failed to update pellet test', 'error')
    },
  })

  const startSessionEdit = () => {
    if (!session) return
    const unit = session.distance_unit || 'meters'
    const distanceValue = unit === 'yards'
      ? (session.distance_m / 0.9144).toFixed(0)
      : String(session.distance_m)
    setEditMeta({
      test_date: session.test_date,
      distance_value: distanceValue,
      distance_unit: unit,
      location: session.location ?? '',
      notes: session.notes ?? '',
      is_public: session.is_public,
    })
    setEditing(true)
  }

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

  const startImageGroupMeasurement = () => {
    const picked = (session?.images ?? []).find(img => img.id === newGroupImageId)
    if (!picked) return
    setPendingGroupSync({
      mode: 'create',
      shotCount: newShotCount,
      notes: newGroupNotes || undefined,
    })
    setMeasureImage(picked)
    setAddingGroup(false)
    setNewGroupSize('')
    setNewShotCount(5)
    setNewGroupNotes('')
    setNewGroupMethod('manual')
    setNewGroupImageId('')
  }

  const deleteGroupMutation = useMutation({
    mutationFn: (groupId: string) => pelletTestApi.deleteGroup(id!, groupId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pellet-tests', id] })
      qc.invalidateQueries({ queryKey: ['pellet-test-stats'] })
    },
  })

  const syncMeasuredGroupMutation = useMutation({
    mutationFn: ({ groupId, sizeMM, shotCount }: { groupId: string; sizeMM: number; shotCount: number }) => {
      const existing = session?.groups?.find(g => g.id === groupId)
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

  async function syncGroupFromAnalysis(args: {
    imageId: string
    measurementId: string
    existingGroupId?: string
    analyzedSizeMM?: number | null
    analyzedShotCount?: number
  }) {
    const { imageId, measurementId, existingGroupId, analyzedSizeMM, analyzedShotCount } = args
    if (!analyzedSizeMM || analyzedSizeMM <= 0) return

    // When the user explicitly picked "add a new group from image", always create a
    // fresh group — even if the image was already linked to one from a prior score.
    const forceCreate = pendingGroupSync?.mode === 'create'
    const targetGroupId =
      pendingGroupSync?.mode === 'update'
        ? pendingGroupSync.groupId
        : forceCreate
          ? undefined
          : existingGroupId

    const resolvedShotCount = (() => {
      if (analyzedShotCount && analyzedShotCount > 0) return analyzedShotCount
      if (pendingGroupSync?.mode === 'create') return pendingGroupSync.shotCount
      if (targetGroupId) {
        const existing = session?.groups?.find(g => g.id === targetGroupId)
        if (existing?.shot_count) return existing.shot_count
      }
      return newShotCount
    })()

    if (targetGroupId) {
      await syncMeasuredGroupMutation.mutateAsync({
        groupId: targetGroupId,
        sizeMM: analyzedSizeMM,
        shotCount: resolvedShotCount,
      })
      return
    }

    const notes = pendingGroupSync?.mode === 'create' ? pendingGroupSync.notes : undefined
    const created = await pelletTestApi.createGroup(id!, {
      shot_count: resolvedShotCount,
      group_size_mm: analyzedSizeMM,
      notes: withSourceTag(notes, 'image'),
    })
    try {
      await pelletTestApi.updateMeasurement(id!, imageId, measurementId, { group_id: created.id })
    } catch {
      // Link-back is best-effort: the group is persisted either way. On re-score without
      // the link the next save would create a second group, but that's recoverable.
    }
  }

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
    mutationFn: async ({ imageId, payload, measurementId, existingGroupId, analyzedSizeMM, analyzedShotCount, analyzedDistanceValue, analyzedDistanceUnit }: { imageId: string; payload: CreateMeasurementPayload; measurementId?: string; existingGroupId?: string; analyzedSizeMM?: number | null; analyzedShotCount?: number; analyzedDistanceValue?: number; analyzedDistanceUnit?: 'meters' | 'yards' }) => {
      const measurement = measurementId
        ? await pelletTestApi.updateMeasurement(id!, imageId, measurementId, payload)
        : await pelletTestApi.createMeasurement(id!, imageId, payload)
      if (analyzedDistanceValue && analyzedDistanceValue > 0) {
        await pelletTestApi.update(id!, {
          distance_value: analyzedDistanceValue,
          distance_unit: analyzedDistanceUnit ?? 'meters',
        })
      }
      await syncGroupFromAnalysis({
        imageId,
        measurementId: measurement.id,
        existingGroupId,
        analyzedSizeMM,
        analyzedShotCount,
      })
      return measurement
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pellet-tests', id] })
      qc.invalidateQueries({ queryKey: ['pellet-tests', id, 'scoring'] })
      qc.invalidateQueries({ queryKey: ['pellet-test-stats'] })
      setMeasureImage(null)
      setPendingGroupSync(null)
    },
    onError: () => {
      toast('Failed to save measurement.', 'error')
      setPendingGroupSync(null)
    },
  })

  const saveDetectionsMutation = useMutation({
    mutationFn: async ({
      imageId,
      payload,
      measurementId,
      existingGroupId,
      detections,
      annotatedBlob,
      analyzedSizeMM,
      analyzedShotCount,
      analyzedDistanceValue,
      analyzedDistanceUnit,
    }: {
      imageId: string
      payload: CreateMeasurementPayload
      measurementId?: string
      existingGroupId?: string
      detections: DetectedHole[]
      annotatedBlob: Blob | null
      analyzedSizeMM?: number | null
      analyzedShotCount?: number
      analyzedDistanceValue?: number
      analyzedDistanceUnit?: 'meters' | 'yards'
    }) => {
      const measurement = measurementId
        ? await pelletTestApi.updateMeasurement(id!, imageId, measurementId, payload)
        : await pelletTestApi.createMeasurement(id!, imageId, payload)

      const detectionsPayload = {
        detection_method: 'auto',
        detections: detections.map(detection => ({
          center_x: detection.centerX,
          center_y: detection.centerY,
          radius_pixels: detection.radiusPixels,
          diameter_mm: detection.diameterMM,
          confidence: detection.confidence,
        })),
      }
      if (measurementId) {
        await pelletTestApi.replaceDetections(id!, imageId, measurement.id, detectionsPayload)
      } else {
        await pelletTestApi.createDetections(id!, imageId, measurement.id, detectionsPayload)
      }

      if (annotatedBlob) {
        await pelletTestApi.uploadAnnotatedImage(id!, imageId, measurement.id, annotatedBlob)
      }
      if (analyzedDistanceValue && analyzedDistanceValue > 0) {
        await pelletTestApi.update(id!, {
          distance_value: analyzedDistanceValue,
          distance_unit: analyzedDistanceUnit ?? 'meters',
        })
      }

      await syncGroupFromAnalysis({
        imageId,
        measurementId: measurement.id,
        existingGroupId,
        analyzedSizeMM,
        analyzedShotCount,
      })

      return measurement
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pellet-tests', id] })
      qc.invalidateQueries({ queryKey: ['pellet-tests', id, 'scoring'] })
      qc.invalidateQueries({ queryKey: ['pellet-test-stats'] })
      setMeasureImage(null)
      setPendingGroupSync(null)
    },
    onError: () => {
      toast('Failed to save detections.', 'error')
      setPendingGroupSync(null)
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
  const existingMeasurement: PelletTestMeasurement | undefined = measureImage
    ? measurementsByImage.get(measureImage.id)
    : undefined
  const existingDetections: PelletTestDetection[] | undefined = existingMeasurement
    ? detectionsByMeasurement.get(existingMeasurement.id)
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
            {!editing && (
              <button
                onClick={startSessionEdit}
                className="text-muted hover:text-[var(--brass)] transition-colors"
                aria-label="Edit test"
                title="Edit"
              >
                <Pencil size={18} />
              </button>
            )}
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
              onClick={() => setPendingDelete({ kind: 'test' })}
              disabled={deleteMutation.isPending}
              className="text-muted hover:text-[var(--error-text)] transition-colors"
              aria-label="Delete test"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>

        {editing && (
          <div className="mt-4 space-y-3 border border-amber-500/30 dark:border-amber-400/30 rounded-lg p-4 bg-amber-500/5 dark:bg-amber-500/10">
            <h2 className="text-[11px] tracking-widest uppercase text-muted">Edit Test Details</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="pellet-edit-test-date" className="block text-[11px] tracking-widest uppercase text-muted mb-1">Test Date</label>
                <input
                  id="pellet-edit-test-date"
                  type="date"
                  value={editMeta.test_date}
                  onChange={e => setEditMeta(m => ({ ...m, test_date: e.target.value }))}
                  className={inputCls + ' font-mono'}
                />
              </div>
              <div>
                <label htmlFor="pellet-edit-location" className="block text-[11px] tracking-widest uppercase text-muted mb-1">Location</label>
                <input
                  id="pellet-edit-location"
                  type="text"
                  value={editMeta.location}
                  onChange={e => setEditMeta(m => ({ ...m, location: e.target.value }))}
                  placeholder="Range / club"
                  className={inputCls}
                />
              </div>
              <div>
                <label htmlFor="pellet-edit-distance" className="block text-[11px] tracking-widest uppercase text-muted mb-1">Distance</label>
                <input
                  id="pellet-edit-distance"
                  type="number"
                  inputMode="decimal"
                  value={editMeta.distance_value}
                  onChange={e => setEditMeta(m => ({ ...m, distance_value: e.target.value }))}
                  className={inputCls + ' font-mono'}
                />
              </div>
              <div>
                <label htmlFor="pellet-edit-distance-unit" className="block text-[11px] tracking-widest uppercase text-muted mb-1">Unit</label>
                <select
                  id="pellet-edit-distance-unit"
                  value={editMeta.distance_unit}
                  onChange={e => setEditMeta(m => ({ ...m, distance_unit: e.target.value }))}
                  className={inputCls}
                >
                  <option value="meters">meters</option>
                  <option value="yards">yards</option>
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="pellet-edit-notes" className="block text-[11px] tracking-widest uppercase text-muted mb-1">Notes</label>
              <textarea
                id="pellet-edit-notes"
                value={editMeta.notes}
                onChange={e => setEditMeta(m => ({ ...m, notes: e.target.value }))}
                rows={2}
                className={inputCls + ' resize-none'}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-secondary">
              <input
                type="checkbox"
                checked={editMeta.is_public}
                onChange={e => setEditMeta(m => ({ ...m, is_public: e.target.checked }))}
              />
              Share this test on the public leaderboard
            </label>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => updateSessionMutation.mutate()}
                disabled={updateSessionMutation.isPending || !editMeta.test_date}
                className="flex-1 py-2.5 rounded bg-[var(--brass)] text-inverse text-sm font-medium tracking-widest uppercase disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {updateSessionMutation.isPending ? 'Saving…' : 'Save Changes'}
              </button>
              <button
                onClick={() => setEditing(false)}
                disabled={updateSessionMutation.isPending}
                className="px-4 py-2.5 rounded border border-subtle text-muted text-sm hover:text-secondary transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
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
            <div className={`grid gap-2 ${newGroupMethod === 'image' ? 'grid-cols-1' : 'grid-cols-2'}`}>
              <div>
                <label className="text-[10px] text-muted tracking-wide">Shots</label>
                <input type="number" min="1" value={newShotCount} onChange={e => setNewShotCount(Number(e.target.value) || 5)} className={inputCls} />
              </div>
              {newGroupMethod === 'manual' && (
                <div>
                  <label className="text-[10px] text-muted tracking-wide">Size (mm)</label>
                  <input type="number" step="0.01" min="0" value={newGroupSize} onChange={e => setNewGroupSize(e.target.value)} placeholder="0.00" className={inputCls} />
                </div>
              )}
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
              <button
                onClick={() => newGroupMethod === 'image' ? startImageGroupMeasurement() : addGroupMutation.mutate()}
                disabled={
                  addGroupMutation.isPending ||
                  (newGroupMethod === 'manual' && (!newGroupSize || Number(newGroupSize) <= 0)) ||
                  (newGroupMethod === 'image' && !newGroupImageId)
                }
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[var(--brass)] text-inverse text-[11px] tracking-widest uppercase hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Check size={13} /> {addGroupMutation.isPending ? 'Saving…' : newGroupMethod === 'image' ? 'Analyze image' : 'Save'}
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
                  onClick={() => setPendingDelete({ kind: 'group', id: g.id })}
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
            {images.map((img: PelletTestImage) => {
              const m = measurementsByImage.get(img.id)
              const dets = m ? detectionsByMeasurement.get(m.id) : undefined
              return (
                <ScoredImageCard
                  key={img.id}
                  image={img}
                  measurement={m}
                  detections={dets}
                  sessionDistanceM={session.distance_m}
                  sessionDistanceUnit={session.distance_unit}
                  onOpen={() => setMeasureImage(img)}
                  onDelete={() => setPendingDelete({ kind: 'image', id: img.id })}
                />
              )
            })}
          </div>
        )}

        <div className="flex gap-2">
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending} className="flex-1 flex items-center justify-center gap-2 border border-dashed border-subtle rounded p-3 text-muted text-sm hover:border-[var(--brass)]/50 hover:text-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            <Upload size={16} /> {uploadMutation.isPending ? 'Uploading…' : 'Upload'}
          </button>
          <button type="button" onClick={() => cameraInputRef.current?.click()} disabled={uploadMutation.isPending} className="flex-1 flex items-center justify-center gap-2 border border-dashed border-subtle rounded p-3 text-muted text-sm hover:border-[var(--brass)]/50 hover:text-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            <Camera size={16} /> Camera
          </button>
        </div>
      </div>

      {/* Measurement Modal */}
      {measureImage && session && (
        <ImageMeasurement
          key={`${measureImage.id}:${existingMeasurement?.id ?? 'new'}`}
          imageUrl={measureImage.image_url}
          distanceM={session.distance_m}
          sessionId={id!}
          imageId={measureImage.id}
          existingMeasurement={existingMeasurement}
          existingDetections={existingDetections}
          onSave={(payload, analysisMeta) => saveMeasurementMutation.mutate({ imageId: measureImage.id, payload, measurementId: existingMeasurement?.id, existingGroupId: existingMeasurement?.group_id, analyzedSizeMM: analysisMeta.groupSizeMM, analyzedShotCount: analysisMeta.shotCount, analyzedDistanceValue: analysisMeta.distanceValue, analyzedDistanceUnit: analysisMeta.distanceUnit })}
          onSaveDetections={(payload, detections, annotatedBlob, analysisMeta) =>
            saveDetectionsMutation.mutate({
              imageId: measureImage.id,
              payload,
              measurementId: existingMeasurement?.id,
              existingGroupId: existingMeasurement?.group_id,
              detections,
              annotatedBlob,
              analyzedSizeMM: analysisMeta.groupSizeMM,
              analyzedShotCount: analysisMeta.shotCount,
              analyzedDistanceValue: analysisMeta.distanceValue,
              analyzedDistanceUnit: analysisMeta.distanceUnit,
            })
          }
          isSaving={saveMeasurementMutation.isPending || saveDetectionsMutation.isPending}
          saveError={saveMeasurementMutation.isError ? 'Failed to save.' : saveDetectionsMutation.isError ? 'Failed to save.' : null}
          onClose={() => { setMeasureImage(null); setPendingGroupSync(null) }}
          defaultDistanceUnit={(authUser?.default_distance_unit as 'meters' | 'yards') ?? undefined}
          defaultMeasurementUnit={(authUser?.default_measurement_unit as 'cm' | 'mm') ?? undefined}
        />
      )}

      {showShare && id && (
        <ShareDialog
          targetId={id}
          targetType="pellet_test"
          targetLabel="Pellet Test"
          onClose={() => setShowShare(false)}
        />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={
          pendingDelete?.kind === 'test' ? 'Delete pellet test?' :
          pendingDelete?.kind === 'group' ? 'Delete group?' :
          'Remove photo?'
        }
        message={
          pendingDelete?.kind === 'test' ? 'This removes the test and all its groups and photos. This cannot be undone.' :
          pendingDelete?.kind === 'group' ? 'This group will be permanently removed.' :
          'This photo will be removed from the test.'
        }
        confirmLabel={pendingDelete?.kind === 'image' ? 'Remove' : 'Delete'}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (!pendingDelete) return
          if (pendingDelete.kind === 'test') deleteMutation.mutate()
          else if (pendingDelete.kind === 'group') deleteGroupMutation.mutate(pendingDelete.id)
          else if (pendingDelete.kind === 'image') deleteImageMutation.mutate(pendingDelete.id)
          setPendingDelete(null)
        }}
      />
    </div>
  )
}
