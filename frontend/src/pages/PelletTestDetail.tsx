import { useState, useRef, useMemo } from 'react'
import { useParams, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  ResponsiveContainer,
} from 'recharts'
import { ChevronLeft, Trash2, Plus, Camera, Upload, Check, Download, Share2, X, Pencil, ArrowLeftRight, Wind, Thermometer, MapPin, Trophy } from 'lucide-react'
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
import { useSmartBack } from '../hooks/useSmartBack'

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

function Row({ label, value, mono, accent }: { label: React.ReactNode; value: React.ReactNode; mono?: boolean; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs uppercase tracking-widest text-muted shrink-0">{label}</dt>
      <dd className={`text-sm text-right ${accent ? 'text-gold' : 'text-ink'} ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  )
}

function computeGroupSpread(groups: PelletTestGroup[]) {
  return [...groups]
    .sort((a, b) => a.group_number - b.group_number)
    .map(g => ({ label: `G${g.group_number}`, value: Number(g.group_size_mm.toFixed(2)) }))
}

export default function PelletTestDetail() {
  const { id } = useParams({ strict: false })
  const smartBack = useSmartBack('/pellet-testing', ['/feed', '/pellet-testing', '/leagues/', '/clubs/', '/profile'])
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

  const { data: alternatesData } = useQuery({
    queryKey: ['pellet-test-leaderboard', session?.rifle_id],
    queryFn: () => pelletTestApi.leaderboard(session!.rifle_id),
    enabled: !!session?.rifle_id,
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
      smartBack()
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

  const groupCount = groups.length
  const isEmerging = badge?.level === 'emerging' || badge?.level === 'single' || (groupCount > 0 && groupCount < 3)
  const groupsNeeded = Math.max(0, 3 - groupCount)
  const distanceLabel = formatDistance(session.distance_m, session.distance_unit)
  const alternates = (alternatesData?.items ?? []).filter(a => a.pellet_id !== session.pellet_id).slice(0, 5)
  const groupSpread = computeGroupSpread(groups)

  return (
    <div className="bg-bg min-h-screen">
      <div className="p-4 lg:p-8 space-y-6 max-w-lg lg:max-w-5xl mx-auto pb-32">

      {/* Top action bar */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={smartBack}
          className="inline-flex items-center gap-1 text-[11px] uppercase tracking-widest text-muted hover:text-ink-2 transition-colors"
        >
          <ChevronLeft size={14} /> Back to testing
        </button>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setAddingGroup(true)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-line text-[11px] uppercase tracking-widest text-ink-2 hover:border-gold/40 hover:text-ink transition-colors"
          >
            <Plus size={12} /> Add group
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-line text-[11px] uppercase tracking-widest text-ink-2 hover:border-gold/40 hover:text-ink transition-colors disabled:opacity-50"
          >
            <Camera size={12} /> Add photo
          </button>
          <Link
            to="/pellet-testing/compare"
            className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-line text-[11px] uppercase tracking-widest text-ink-2 hover:border-gold/40 hover:text-ink transition-colors"
          >
            <ArrowLeftRight size={12} /> Compare
          </Link>
          <button
            onClick={() => setShowShare(true)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-line text-[11px] uppercase tracking-widest text-ink-2 hover:border-gold/40 hover:text-ink transition-colors"
            aria-label="Share pellet test"
          >
            <Share2 size={12} /> Share
          </button>
          {!editing && (
            <button
              onClick={startSessionEdit}
              className="p-1.5 text-muted hover:text-gold transition-colors"
              aria-label="Edit test"
            >
              <Pencil size={16} />
            </button>
          )}
          <button
            onClick={handleExport}
            className="p-1.5 text-muted hover:text-ink-2 transition-colors"
            aria-label="Export test data"
          >
            <Download size={16} />
          </button>
          <button
            onClick={() => setPendingDelete({ kind: 'test' })}
            disabled={deleteMutation.isPending}
            className="p-1.5 text-muted hover:text-[var(--error-text)] transition-colors"
            aria-label="Delete test"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Emerging banner */}
      {isEmerging && groupCount > 0 && (
        <div className="px-4 py-3 rounded-lg bg-gold-tint/40 border border-gold/30 text-sm text-ink-2 flex items-start gap-2">
          <span className="text-gold">✦</span>
          <span>
            Emerging test — only {groupCount} {groupCount === 1 ? 'group' : 'groups'} logged so far.
            {groupsNeeded > 0 && ` Add ${groupsNeeded} more for a confident reading.`}
          </span>
        </div>
      )}

      {/* Header card */}
      <header className="bg-surface border border-line rounded-lg p-5 lg:p-6 shadow-card">
        <div className="flex items-center gap-2 flex-wrap text-[11px] uppercase tracking-widest text-muted mb-3">
          {session.rifle?.calibre && (
            <span className="px-1.5 py-0.5 rounded-full bg-bg-2 border border-line text-ink-2 font-mono normal-case">
              {session.rifle.calibre}
            </span>
          )}
          {badge && <ConfidenceBadge badge={badge} />}
          <span className="font-mono normal-case text-ink-2">{session.test_date}</span>
          <span>· {distanceLabel}</span>
          {session.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin size={11} /> {session.location}
            </span>
          )}
        </div>
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-serif text-3xl lg:text-5xl text-ink leading-tight">
              {session.rifle ? `${session.rifle.make} ${session.rifle.model}` : 'Rifle'}
              <span className="text-muted-2 mx-2">×</span>
              <span className="text-gold">{session.pellet ? `${session.pellet.brand} ${session.pellet.model}` : 'Pellet'}</span>
            </h1>
            <p className="text-sm text-muted mt-1">
              {[
                session.pellet?.weight_grains != null && `${session.pellet.weight_grains}gr`,
                session.pellet?.batch_code && session.pellet.batch_code,
                session.pellet?.brand,
              ].filter(Boolean).join(' · ')}
            </p>
          </div>
          {session.group_count > 0 && (
            <div className="flex items-end gap-8 shrink-0">
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-widest text-muted">Best Group</p>
                <p className="font-serif text-3xl lg:text-4xl text-gold leading-none">
                  {session.best_group_size_mm?.toFixed(2)}
                  <span className="text-xs uppercase tracking-widest text-muted ml-1 font-sans">mm</span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-widest text-muted">Avg</p>
                <p className="font-serif text-3xl lg:text-4xl text-ink leading-none">
                  {session.average_group_size_mm?.toFixed(2)}
                  <span className="text-xs uppercase tracking-widest text-muted ml-1 font-sans">mm</span>
                </p>
              </div>
            </div>
          )}
        </div>

      </header>

      {/* Hidden file inputs (used by Add photo button & Photos card) */}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={e => { handleImageSelect(e.target.files?.[0]); e.target.value = '' }} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { handleImageSelect(e.target.files?.[0]); e.target.value = '' }} />

      {editing && (
        <div className="space-y-3 border border-gold/40 rounded-lg p-4 bg-gold-tint/30">
          <h2 className="text-[11px] tracking-widest uppercase text-muted">Edit Test Details</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="pellet-edit-test-date" className="block text-[11px] tracking-widest uppercase text-muted mb-1">Test Date</label>
              <input id="pellet-edit-test-date" type="date" value={editMeta.test_date} onChange={e => setEditMeta(m => ({ ...m, test_date: e.target.value }))} className={inputCls + ' font-mono'} />
            </div>
            <div>
              <label htmlFor="pellet-edit-location" className="block text-[11px] tracking-widest uppercase text-muted mb-1">Location</label>
              <input id="pellet-edit-location" type="text" value={editMeta.location} onChange={e => setEditMeta(m => ({ ...m, location: e.target.value }))} placeholder="Range / club" className={inputCls} />
            </div>
            <div>
              <label htmlFor="pellet-edit-distance" className="block text-[11px] tracking-widest uppercase text-muted mb-1">Distance</label>
              <input id="pellet-edit-distance" type="number" inputMode="decimal" value={editMeta.distance_value} onChange={e => setEditMeta(m => ({ ...m, distance_value: e.target.value }))} className={inputCls + ' font-mono'} />
            </div>
            <div>
              <label htmlFor="pellet-edit-distance-unit" className="block text-[11px] tracking-widest uppercase text-muted mb-1">Unit</label>
              <select id="pellet-edit-distance-unit" value={editMeta.distance_unit} onChange={e => setEditMeta(m => ({ ...m, distance_unit: e.target.value }))} className={inputCls}>
                <option value="meters">meters</option>
                <option value="yards">yards</option>
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="pellet-edit-notes" className="block text-[11px] tracking-widest uppercase text-muted mb-1">Notes</label>
            <textarea id="pellet-edit-notes" value={editMeta.notes} onChange={e => setEditMeta(m => ({ ...m, notes: e.target.value }))} rows={2} className={inputCls + ' resize-none'} />
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-2">
            <input type="checkbox" checked={editMeta.is_public} onChange={e => setEditMeta(m => ({ ...m, is_public: e.target.checked }))} />
            Share this test on the public leaderboard
          </label>
          <div className="flex gap-2 pt-1">
            <button onClick={() => updateSessionMutation.mutate()} disabled={updateSessionMutation.isPending || !editMeta.test_date} className="flex-1 py-2.5 rounded bg-gold text-inverse text-sm font-medium tracking-widest uppercase disabled:opacity-50 disabled:cursor-not-allowed">
              {updateSessionMutation.isPending ? 'Saving…' : 'Save Changes'}
            </button>
            <button onClick={() => setEditing(false)} disabled={updateSessionMutation.isPending} className="px-4 py-2.5 rounded border border-line text-muted text-sm hover:text-ink-2 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Two-column body */}
      <div className="grid lg:grid-cols-3 gap-4 lg:gap-6">

        {/* ── Left column (2/3) ───────────────────────────── */}
        <div className="lg:col-span-2 space-y-4 lg:space-y-6">

          {/* Groups */}
          <section className="bg-surface border border-line rounded-lg p-4 lg:p-5 shadow-card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-serif text-xl text-ink">Groups</h2>
                <p className="text-[11px] text-muted mt-0.5">
                  {groups.length} {groups.length === 1 ? 'group' : 'groups'}
                  {groups.length > 0 && ` · ${groups[0].shot_count} shots each · click to analyze`}
                </p>
              </div>
              {!addingGroup && (
                <button onClick={() => setAddingGroup(true)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-line text-[11px] uppercase tracking-widest text-ink-2 hover:border-gold/40 hover:text-ink transition-colors">
                  <Plus size={11} /> Add group
                </button>
              )}
            </div>

            {addingGroup && (
              <div className="p-3 rounded-lg border border-line bg-bg-2 space-y-2 mb-4">
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
                  <button onClick={() => setNewGroupMethod('manual')} className={`py-2 rounded text-[11px] tracking-widest uppercase border ${newGroupMethod === 'manual' ? 'border-gold text-gold bg-gold-tint/40' : 'border-line text-muted'}`}>Manual</button>
                  <button onClick={() => setNewGroupMethod('image')} className={`py-2 rounded text-[11px] tracking-widest uppercase border ${newGroupMethod === 'image' ? 'border-gold text-gold bg-gold-tint/40' : 'border-line text-muted'}`}>Image analysis</button>
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
                  <button onClick={() => newGroupMethod === 'image' ? startImageGroupMeasurement() : addGroupMutation.mutate()} disabled={addGroupMutation.isPending || (newGroupMethod === 'manual' && (!newGroupSize || Number(newGroupSize) <= 0)) || (newGroupMethod === 'image' && !newGroupImageId)} className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-gold text-inverse text-[11px] tracking-widest uppercase hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed">
                    <Check size={13} /> {addGroupMutation.isPending ? 'Saving…' : newGroupMethod === 'image' ? 'Analyze image' : 'Save'}
                  </button>
                  <button onClick={() => setAddingGroup(false)} className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-line text-[11px] tracking-widest uppercase text-muted hover:text-ink-2 transition-colors">
                    <X size={13} /> Cancel
                  </button>
                </div>
              </div>
            )}

            {groups.length === 0 ? (
              <p className="text-sm text-muted text-center py-8 border border-dashed border-line rounded-lg">No groups recorded yet.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {groups.map((g: PelletTestGroup) => {
                  const isBest = session.best_group_size_mm != null && Math.abs(g.group_size_mm - session.best_group_size_mm) < 0.001
                  // Find the image attached to this group (if any) for thumbnail
                  const linkedImg = images.find(img => img.group_id === g.id) ?? images[g.group_number - 1]
                  return (
                    <div
                      key={g.id}
                      className={`relative rounded-lg border overflow-hidden bg-bg-2 ${isBest ? 'border-gold/60 ring-1 ring-gold/30' : 'border-line'}`}
                    >
                      <div className="absolute top-2 left-2 z-10 flex items-center gap-1">
                        <span className="px-1.5 py-0.5 rounded bg-surface/90 text-[10px] uppercase tracking-widest text-ink-2">Group {g.group_number}</span>
                        {isBest && (
                          <span className="px-1.5 py-0.5 rounded bg-gold text-inverse text-[10px] uppercase tracking-widest">Best</span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setPendingDelete({ kind: 'group', id: g.id })}
                        className="absolute top-2 right-2 z-10 p-1 rounded bg-surface/90 text-muted hover:text-[var(--error-text)] transition-colors"
                        aria-label="Delete group"
                      >
                        <Trash2 size={12} />
                      </button>
                      <div className="aspect-square bg-bg flex items-center justify-center">
                        {linkedImg ? (
                          <img src={linkedImg.image_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="text-center px-3">
                            <div className="w-12 h-12 rounded-full border border-line mx-auto mb-2 flex items-center justify-center">
                              <Plus size={14} className="text-muted opacity-40" />
                            </div>
                            <p className="text-[10px] text-muted">No photo</p>
                          </div>
                        )}
                      </div>
                      <div className="px-2 py-2 flex items-baseline justify-between">
                        <span className="font-serif text-xl text-ink">{g.group_size_mm.toFixed(2)}<span className="text-[9px] uppercase tracking-widest text-muted ml-0.5 font-sans">mm</span></span>
                        {g.group_size_moa != null && (
                          <span className="text-[10px] font-mono text-muted">{g.group_size_moa.toFixed(2)} MOA</span>
                        )}
                      </div>
                    </div>
                  )
                })}
                {/* Add-group placeholder tile */}
                {!addingGroup && (
                  <button
                    type="button"
                    onClick={() => setAddingGroup(true)}
                    className="aspect-square rounded-lg border border-dashed border-line bg-bg-2/40 text-muted text-xs hover:border-gold/40 hover:text-ink-2 transition-colors flex flex-col items-center justify-center gap-1"
                  >
                    <Plus size={18} />
                    Add group
                  </button>
                )}
              </div>
            )}
          </section>

          {/* Group-by-group spread */}
          {groups.length > 1 && (
            <section className="bg-surface border border-line rounded-lg p-4 lg:p-5 shadow-card">
              <div className="mb-3">
                <h2 className="font-serif text-xl text-ink">Group-by-group</h2>
                <p className="text-[11px] text-muted mt-0.5">Spread across this session</p>
              </div>
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={groupSpread} margin={{ top: 4, right: 8, bottom: 4, left: 4 }}>
                    <CartesianGrid strokeDasharray="2 4" stroke="var(--line)" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--muted)' }} stroke="var(--line)" />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} domain={['auto', 'auto']} tickFormatter={(v: number) => v.toFixed(1)} stroke="var(--line)" />
                    <RTooltip
                      contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 6, fontSize: 11 }}
                      labelStyle={{ color: 'var(--muted)' }}
                      formatter={(v) => `${Number(v).toFixed(2)}mm`}
                    />
                    <Line type="monotone" dataKey="value" stroke="var(--gold)" strokeWidth={1.5} dot={{ r: 4, fill: 'var(--gold)' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}

          {/* Notes */}
          {session.notes && (
            <section className="bg-surface border border-line rounded-lg p-4 lg:p-5 shadow-card">
              <h2 className="font-serif text-xl text-ink mb-2">Notes</h2>
              <blockquote className="border-l-2 border-gold pl-3 text-sm text-ink-2 italic">
                "{session.notes}"
              </blockquote>
            </section>
          )}

          {/* Alternate pellets for this rifle */}
          {alternates.length > 0 && session.rifle && (
            <section className="bg-surface border border-line rounded-lg p-4 lg:p-5 shadow-card">
              <div className="mb-3">
                <h2 className="font-serif text-xl text-ink">
                  Alternate pellets for {session.rifle.make} {session.rifle.model}
                </h2>
                <p className="text-[11px] text-muted mt-0.5">Same rifle, ranked by best group</p>
              </div>
              <div className="space-y-2">
                {alternates.map(a => (
                  <div key={a.pellet_id} className="flex items-center gap-3 p-2 rounded-lg border border-line hover:border-gold/40 transition-colors">
                    <Trophy size={14} className="text-gold shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-ink truncate">{a.pellet_brand} {a.pellet_model}</p>
                      <p className="text-[11px] text-muted">{a.test_count} {a.test_count === 1 ? 'test' : 'tests'} · avg {a.avg_group_mm.toFixed(2)}mm</p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-serif text-lg text-gold">{a.best_group_mm.toFixed(2)}</span>
                      <span className="text-[10px] uppercase tracking-widest text-muted ml-0.5">mm</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* ── Right column (1/3) ──────────────────────────── */}
        <div className="space-y-4 lg:space-y-6">

          {/* Setup */}
          <section className="bg-surface border border-line rounded-lg p-4 lg:p-5 shadow-card">
            <h2 className="font-serif text-xl text-ink mb-3">Setup</h2>
            <dl className="space-y-2.5 text-sm">
              <Row label="Rifle" value={session.rifle ? `${session.rifle.make} ${session.rifle.model}` : '—'} />
              {session.rifle?.power_ftlb != null && (
                <Row label="Spec" value={`${session.rifle.power_ftlb} ft-lb${session.rifle.tune_notes ? ' · ' + session.rifle.tune_notes : ''}`} />
              )}
              <Row label="Pellet" value={session.pellet ? `${session.pellet.brand} ${session.pellet.model}` : '—'} accent />
              {session.pellet?.weight_grains != null && (
                <Row label="Weight" value={`${session.pellet.weight_grains}gr`} />
              )}
              {session.pellet?.batch_code && <Row label="Batch" value={session.pellet.batch_code} mono />}
              <Row label="Distance" value={distanceLabel} mono />
              {session.bench_setup && <Row label="Bench" value={session.bench_setup} />}
              {session.scope_details && <Row label="Scope" value={session.scope_details} />}
            </dl>
          </section>

          {/* Conditions */}
          {(session.location || session.wind_mph != null || session.temp_celsius != null || session.humidity_pct != null || session.barometric_pressure_mbar != null) && (
            <section className="bg-surface border border-line rounded-lg p-4 lg:p-5 shadow-card">
              <h2 className="font-serif text-xl text-ink mb-3">Conditions</h2>
              <dl className="space-y-2.5 text-sm">
                {session.wind_mph != null && (
                  <Row label={<><Wind size={11} className="inline -mt-px mr-1" /> Wind</>} value={session.wind_mph === 0 ? 'Calm' : `${session.wind_mph} mph`} mono />
                )}
                {session.temp_celsius != null && (
                  <Row label={<><Thermometer size={11} className="inline -mt-px mr-1" /> Temp</>} value={`${session.temp_celsius}°C`} mono />
                )}
                {session.humidity_pct != null && <Row label="Humidity" value={`${session.humidity_pct}%`} mono />}
                {session.barometric_pressure_mbar != null && <Row label="Pressure" value={`${session.barometric_pressure_mbar} mbar`} mono />}
                {session.location && (
                  <Row label={<><MapPin size={11} className="inline -mt-px mr-1" /> Location</>} value={session.location} />
                )}
              </dl>
            </section>
          )}

          {/* Chronograph */}
          {(session.velocity_fps != null || session.velocity_sd != null || session.extreme_spread_fps != null) && (
            <section className="bg-surface border border-line rounded-lg p-4 lg:p-5 shadow-card">
              <h2 className="font-serif text-xl text-ink mb-3">Chronograph</h2>
              <dl className="space-y-2.5 text-sm">
                {session.velocity_fps != null && <Row label="Avg fps" value={String(session.velocity_fps)} mono />}
                {session.velocity_sd != null && <Row label="SD" value={String(session.velocity_sd)} mono />}
                {session.extreme_spread_fps != null && <Row label="ES" value={`${session.extreme_spread_fps} fps`} mono />}
              </dl>
            </section>
          )}

          {/* Photos */}
          <section className="bg-surface border border-line rounded-lg p-4 lg:p-5 shadow-card">
            <h2 className="font-serif text-xl text-ink mb-3">Photos</h2>
            <div className="grid grid-cols-2 gap-3">
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
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadMutation.isPending}
                className="aspect-square rounded-lg border border-dashed border-line bg-bg-2/40 text-muted text-xs hover:border-gold/40 hover:text-ink-2 transition-colors flex flex-col items-center justify-center gap-1"
              >
                <Upload size={18} />
                {uploadMutation.isPending ? 'Uploading…' : 'Add photo'}
              </button>
            </div>
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              disabled={uploadMutation.isPending}
              className="mt-3 w-full inline-flex items-center justify-center gap-2 border border-dashed border-line rounded-lg py-2.5 text-muted text-sm hover:border-gold/40 hover:text-ink-2 transition-colors disabled:opacity-50"
            >
              <Camera size={14} /> Take photo
            </button>
          </section>
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

      {showShare && id && session && (() => {
        const pelletName = session.pellet ? `${session.pellet.brand} ${session.pellet.model}`.trim() : ''
        const rifleName = session.rifle ? `${session.rifle.make} ${session.rifle.model}`.trim() : ''
        const bits: string[] = []
        if (pelletName) bits.push(`Pellet test: ${pelletName}`)
        else bits.push('Pellet test')
        if (session.best_group_size_mm != null) bits.push(`Best ${session.best_group_size_mm.toFixed(2)}mm`)
        if (session.distance_m > 0) bits.push(`${session.distance_m.toFixed(1)}m`)
        if (rifleName) bits.push(rifleName)
        const shareText = `${bits.join(' · ')} on sub-12`
        const shareTitle = pelletName ? `Pellet test: ${pelletName}` : 'Pellet test'
        return (
          <ShareDialog
            targetId={id}
            targetType="pellet_test"
            targetLabel="Pellet Test"
            shareTitle={shareTitle}
            shareText={shareText}
            onClose={() => setShowShare(false)}
          />
        )
      })()}

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
    </div>
  )
}
