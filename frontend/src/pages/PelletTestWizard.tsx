import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, MapPin, Sparkles, Trash2 } from 'lucide-react'
import {
  pelletTestApi,
  type PelletTestDetection,
  type PelletTestMeasurement,
  type UpdatePelletTestPayload,
  type QuickCreatePelletTestPayload,
} from '../api/pelletTesting'
import { toast } from '../store/toast'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { useSmartBack } from '../hooks/useSmartBack'
import { useDebouncedEffect } from '../hooks/useDebouncedEffect'
import { usePelletDraftAutosave } from '../hooks/usePelletDraftAutosave'
import { WizardShell } from '../components/wizard/WizardShell'
import type { WizardStepDescriptor } from '../components/wizard/WizardStepper'
import { EquipmentStep } from '../components/pelletWizard/EquipmentStep'
import { ConditionsStep } from '../components/pelletWizard/ConditionsStep'
import { PhotosStep } from '../components/pelletWizard/PhotosStep'
import { MeasureStep } from '../components/pelletWizard/MeasureStep'
import { ReviewStep } from '../components/pelletWizard/ReviewStep'
import {
  distanceToMeters,
  type WizardConditionsValues,
  type WizardEquipmentValues,
} from '../components/pelletWizard/wizardShared'
import type { LocationValue } from '../components/LocationField'

const today = () => new Date().toISOString().slice(0, 10)
const LAST_USED_KEY = 'sub12.pelletTest.lastUsed'

interface LastUsedPelletTest {
  rifleId?: string
  pelletId?: string
  distanceValue?: string
  distanceUnit?: string
  location?: LocationValue
}

function readLastUsed(): LastUsedPelletTest {
  try {
    const raw = localStorage.getItem(LAST_USED_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeLastUsed(patch: LastUsedPelletTest): void {
  try {
    const existing = readLastUsed()
    const merged = { ...existing }
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === '' || v === null) continue
      ;(merged as Record<string, unknown>)[k] = v
    }
    localStorage.setItem(LAST_USED_KEY, JSON.stringify(merged))
  } catch {
    // ignore (privacy mode, quota)
  }
}

const WIZARD_STEPS = ['equipment', 'conditions', 'photos', 'measure', 'review'] as const
type StepKey = (typeof WIZARD_STEPS)[number]

const STEP_LABELS: Record<StepKey, string> = {
  equipment: 'Equipment',
  conditions: 'Conditions',
  photos: 'Photos',
  measure: 'Measure',
  review: 'Review',
}

function indexFromSearch(step: number | undefined, fallback: number): number {
  if (typeof step === 'number' && step >= 1 && step <= WIZARD_STEPS.length) return step - 1
  return fallback
}

export default function PelletTestWizard() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const smartBack = useSmartBack('/pellet-testing')
  const search = useSearch({ strict: false }) as { draftId?: string; step?: number; imageId?: string }
  const incomingDraftId = search.draftId
  const incomingStep = search.step
  const incomingImageId = search.imageId

  // Form state -------------------------------------------------------------
  const lastUsed = useRef<LastUsedPelletTest | null>(incomingDraftId ? null : readLastUsed()).current
  const [equipment, setEquipment] = useState<WizardEquipmentValues>({
    rifleId: lastUsed?.rifleId ?? '',
    pelletId: lastUsed?.pelletId ?? '',
    testDate: today(),
  })
  const [conditions, setConditions] = useState<WizardConditionsValues>({
    distanceValue: lastUsed?.distanceValue ?? '',
    distanceUnit: (lastUsed?.distanceUnit === 'yards' ? 'yards' : 'meters'),
    savedLocationId: null,
    location: lastUsed?.location ?? { label: '' },
    windMph: '',
    tempCelsius: '',
    humidityPct: '',
    notes: '',
    velocityFps: '',
    velocitySd: '',
    extremeSpreadFps: '',
    benchSetup: '',
    scopeDetails: '',
    barometricPressure: '',
  })
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Draft autosave ---------------------------------------------------------
  const autosave = usePelletDraftAutosave({
    initialId: incomingDraftId,
    onCreated: id => {
      // Replace URL with the new draftId so refresh keeps working.
      navigate({
        to: '/pellet-testing/new',
        search: { draftId: id, step: stepIndex + 1 },
        replace: true,
      })
    },
  })
  const draftId = autosave.draftId

  // Hydrate from server-side draft ----------------------------------------
  const { data: draft } = useQuery({
    queryKey: ['pellet-test', draftId],
    queryFn: () => pelletTestApi.get(draftId!),
    enabled: !!draftId,
  })
  const isSubmitted = !!draft && !draft.is_draft
  const hydratedRef = useRef(false)
  useEffect(() => {
    if (!draft || hydratedRef.current) return
    hydratedRef.current = true
    setEquipment({
      rifleId: draft.rifle_id,
      pelletId: draft.pellet_id,
      testDate: draft.test_date,
    })
    const unit: 'meters' | 'yards' = draft.distance_unit === 'yards' ? 'yards' : 'meters'
    const distanceValue =
      draft.distance_m > 0
        ? String(Number((unit === 'yards' ? draft.distance_m / 0.9144 : draft.distance_m).toFixed(2)))
        : ''
    setConditions(c => ({
      ...c,
      distanceValue,
      distanceUnit: unit,
      savedLocationId: draft.location_id ?? null,
      location: {
        label: draft.location ?? '',
        lat: draft.location_lat ?? undefined,
        lng: draft.location_lng ?? undefined,
      },
      windMph: draft.wind_mph != null ? String(draft.wind_mph) : '',
      tempCelsius: draft.temp_celsius != null ? String(draft.temp_celsius) : '',
      humidityPct: draft.humidity_pct != null ? String(draft.humidity_pct) : '',
      notes: draft.notes ?? '',
      velocityFps: draft.velocity_fps != null ? String(draft.velocity_fps) : '',
      velocitySd: draft.velocity_sd != null ? String(draft.velocity_sd) : '',
      extremeSpreadFps: draft.extreme_spread_fps != null ? String(draft.extreme_spread_fps) : '',
      benchSetup: draft.bench_setup ?? '',
      scopeDetails: draft.scope_details ?? '',
      barometricPressure:
        draft.barometric_pressure_mbar != null ? String(draft.barometric_pressure_mbar) : '',
    }))
  }, [draft])

  // Scoring data (measurements + detections) for Photos/Measure ------------
  const { data: scoring } = useQuery({
    queryKey: ['pellet-tests', draftId, 'scoring'],
    queryFn: () => pelletTestApi.getSessionScoring(draftId!),
    enabled: !!draftId,
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

  // Step state -------------------------------------------------------------
  const computedFirstIncomplete = useMemo<number>(() => {
    if (!draft) return 0
    if (!draft.distance_m || draft.distance_m <= 0) return 1 // Conditions
    if ((draft.images ?? []).length === 0) return 2 // Photos
    const anyMeasured = (draft.images ?? []).some(img => measurementsByImage.has(img.id))
    if (!anyMeasured) return 3 // Measure
    return 4 // Review
  }, [draft, measurementsByImage])

  const [stepIndex, setStepIndex] = useState<number>(() =>
    indexFromSearch(incomingStep, incomingDraftId ? 0 : 0),
  )
  // When the draft hydrates and the URL didn't specify a step, jump to the
  // first incomplete one — but only the first time, so the user can navigate
  // freely after.
  const stepFromDraftRef = useRef(false)
  useEffect(() => {
    if (stepFromDraftRef.current) return
    if (!draft) return
    if (incomingStep != null) {
      stepFromDraftRef.current = true
      return
    }
    stepFromDraftRef.current = true
    setStepIndex(computedFirstIncomplete)
    navigate({
      to: '/pellet-testing/new',
      search: { draftId: draft.id, step: computedFirstIncomplete + 1 },
      replace: true,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, computedFirstIncomplete])

  const stepKey: StepKey = WIZARD_STEPS[stepIndex]

  // For the Measure step we may receive an imageId via the search param.
  const [measureSeed, setMeasureSeed] = useState<string | undefined>(incomingImageId)
  useEffect(() => setMeasureSeed(incomingImageId), [incomingImageId])

  // Validation helpers ----------------------------------------------------
  const equipmentValid = !!equipment.rifleId && !!equipment.pelletId && !!equipment.testDate
  const distanceM = useMemo(() => {
    const n = Number(conditions.distanceValue)
    return n > 0 ? distanceToMeters(n, conditions.distanceUnit) : 0
  }, [conditions.distanceValue, conditions.distanceUnit])
  const hasGroupOrPhoto =
    (draft?.groups ?? []).length > 0 || (draft?.images ?? []).length > 0

  function patchPayload(): UpdatePelletTestPayload {
    const distance = Number(conditions.distanceValue)
    const hasDistance = !!conditions.distanceValue && distance > 0
    return {
      rifle_id: equipment.rifleId || undefined,
      pellet_id: equipment.pelletId || undefined,
      test_date: equipment.testDate || undefined,
      distance_value: hasDistance ? distance : undefined,
      distance_unit: hasDistance ? conditions.distanceUnit : undefined,
      location: conditions.location.label || undefined,
      location_lat: conditions.location.lat,
      location_lng: conditions.location.lng,
      location_id: conditions.savedLocationId ?? undefined,
      wind_mph: conditions.windMph ? Number(conditions.windMph) : undefined,
      temp_celsius: conditions.tempCelsius ? Number(conditions.tempCelsius) : undefined,
      humidity_pct: conditions.humidityPct ? Number(conditions.humidityPct) : undefined,
      notes: conditions.notes || undefined,
      velocity_fps: conditions.velocityFps ? Number(conditions.velocityFps) : undefined,
      velocity_sd: conditions.velocitySd ? Number(conditions.velocitySd) : undefined,
      extreme_spread_fps: conditions.extremeSpreadFps
        ? Number(conditions.extremeSpreadFps)
        : undefined,
      bench_setup: conditions.benchSetup || undefined,
      scope_details: conditions.scopeDetails || undefined,
      barometric_pressure_mbar: conditions.barometricPressure
        ? Number(conditions.barometricPressure)
        : undefined,
    }
  }

  function quickCreatePayload(): QuickCreatePelletTestPayload {
    const distance = Number(conditions.distanceValue)
    const hasDistance = !!conditions.distanceValue && distance > 0
    return {
      rifle_id: equipment.rifleId,
      pellet_id: equipment.pelletId,
      test_date: equipment.testDate,
      distance_value: hasDistance ? distance : undefined,
      distance_unit: hasDistance ? conditions.distanceUnit : undefined,
      location: conditions.location.label || undefined,
      location_lat: conditions.location.lat,
      location_lng: conditions.location.lng,
      location_id: conditions.savedLocationId ?? undefined,
      wind_mph: conditions.windMph ? Number(conditions.windMph) : undefined,
      temp_celsius: conditions.tempCelsius ? Number(conditions.tempCelsius) : undefined,
      humidity_pct: conditions.humidityPct ? Number(conditions.humidityPct) : undefined,
      notes: conditions.notes || undefined,
    }
  }

  // Within a step, debounce-save patches so leaving the tab still persists.
  useDebouncedEffect(
    () => {
      if (!draftId) return
      if (!equipmentValid) return
      autosave.patch(patchPayload()).catch(() => {/* error toast in hook state */})
    },
    [
      draftId,
      equipmentValid,
      equipment.rifleId,
      equipment.pelletId,
      equipment.testDate,
      conditions.distanceValue,
      conditions.distanceUnit,
      conditions.location.label,
      conditions.location.lat,
      conditions.location.lng,
      conditions.savedLocationId,
      conditions.windMph,
      conditions.tempCelsius,
      conditions.humidityPct,
      conditions.notes,
      conditions.velocityFps,
      conditions.velocitySd,
      conditions.extremeSpreadFps,
      conditions.benchSetup,
      conditions.scopeDetails,
      conditions.barometricPressure,
    ],
    3000,
  )

  // Step transition --------------------------------------------------------
  const ensureDraftIfNeeded = useCallback(async (): Promise<string | null> => {
    if (draftId) {
      try {
        await autosave.patch(patchPayload())
      } catch {
        return null
      }
      return draftId
    }
    if (!equipmentValid) return null
    try {
      const session = await autosave.ensureDraft(quickCreatePayload())
      return session.id
    } catch {
      return null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autosave, draftId, equipmentValid, equipment, conditions])

  const goToStep = useCallback(
    (idx: number) => {
      const clamped = Math.max(0, Math.min(WIZARD_STEPS.length - 1, idx))
      setStepIndex(clamped)
      navigate({
        to: '/pellet-testing/new',
        search: draftId
          ? { draftId, step: clamped + 1 }
          : { step: clamped + 1 },
        replace: true,
      })
    },
    [draftId, navigate],
  )

  const onNext = useCallback(async () => {
    const nextIdx = stepIndex + 1
    // From Equipment we must have a draft id before advancing so that the
    // remaining steps have a session to attach data to.
    if (stepKey === 'equipment') {
      if (!equipmentValid) {
        toast('Pick a rifle, pellet and date to continue', 'error')
        return
      }
      const id = await ensureDraftIfNeeded()
      if (!id) {
        toast('Could not save. Try again.', 'error')
        return
      }
    } else if (draftId) {
      // Fire-and-forget patch on Conditions/Photos/Measure transitions.
      try { await autosave.patch(patchPayload()) } catch { /* surfaced in shell */ }
    }
    goToStep(nextIdx)
    // patchPayload reads `equipment`/`conditions` directly; not in deps
    // because the debounced effect already covers field-level autosaves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autosave, draftId, ensureDraftIfNeeded, equipmentValid, goToStep, stepIndex, stepKey])

  const onBack = useCallback(() => goToStep(stepIndex - 1), [goToStep, stepIndex])

  // Submit -----------------------------------------------------------------
  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!draftId) throw new Error('No draft to submit')
      // Final patch first.
      await autosave.patch(patchPayload())
      if (draft?.is_draft) {
        return pelletTestApi.graduate(draftId)
      }
      // Editing a submitted test: just return the patched session.
      return pelletTestApi.get(draftId)
    },
    onSuccess: session => {
      writeLastUsed({
        rifleId: equipment.rifleId,
        pelletId: equipment.pelletId,
        distanceValue: conditions.distanceValue,
        distanceUnit: conditions.distanceUnit,
        location: conditions.location.label || conditions.location.lat != null ? conditions.location : undefined,
      })
      qc.invalidateQueries({ queryKey: ['pellet-tests'] })
      qc.invalidateQueries({ queryKey: ['pellet-test-stats'] })
      qc.invalidateQueries({ queryKey: ['pellet-drafts'] })
      qc.invalidateQueries({ queryKey: ['pellet-drafts-count'] })
      toast(draft?.is_draft ? 'Test saved' : 'Changes saved', 'success')
      navigate({ to: '/pellet-testing/$id', params: { id: session.id } })
    },
    onError: err => {
      toast(err instanceof Error ? err.message : 'Failed to save', 'error')
    },
  })

  const deleteDraftMutation = useMutation({
    mutationFn: () => pelletTestApi.delete(draftId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pellet-drafts'] })
      qc.invalidateQueries({ queryKey: ['pellet-drafts-count'] })
      qc.invalidateQueries({ queryKey: ['pellet-tests'] })
      toast('Draft deleted', 'success')
      navigate({ to: '/pellet-testing' })
    },
    onError: err => toast(err instanceof Error ? err.message : 'Failed to delete', 'error'),
  })

  // Step descriptors -------------------------------------------------------
  const steps: WizardStepDescriptor[] = useMemo(() => {
    const status = (idx: number, complete: boolean): WizardStepDescriptor['status'] =>
      idx === stepIndex ? 'current' : complete ? 'complete' : 'pending'
    return [
      {
        key: 'equipment',
        label: STEP_LABELS.equipment,
        status: status(0, equipmentValid),
        reachable: true,
      },
      {
        key: 'conditions',
        label: STEP_LABELS.conditions,
        status: status(1, distanceM > 0),
        reachable: equipmentValid,
      },
      {
        key: 'photos',
        label: STEP_LABELS.photos,
        status: status(2, (draft?.images ?? []).length > 0),
        reachable: !!draftId,
      },
      {
        key: 'measure',
        label: STEP_LABELS.measure,
        status: status(
          3,
          (draft?.images ?? []).some(img => measurementsByImage.has(img.id)),
        ),
        reachable: !!draftId && (draft?.images ?? []).length > 0,
      },
      {
        key: 'review',
        label: STEP_LABELS.review,
        status: status(4, !!draft && (draft.groups ?? []).length > 0),
        reachable: !!draftId,
      },
    ]
  }, [draft, draftId, distanceM, equipmentValid, measurementsByImage, stepIndex])

  // Footer/labels ----------------------------------------------------------
  const isLast = stepIndex === WIZARD_STEPS.length - 1
  const submitLabel = draft?.is_draft === false ? 'Save changes' : 'Save test'
  const nextLabel = isLast ? submitLabel : 'Continue'
  const nextDisabled =
    submitMutation.isPending ||
    (stepKey === 'equipment' && !equipmentValid) ||
    (isLast && (!draftId || !equipmentValid || !hasGroupOrPhoto))

  function StepBody() {
    switch (stepKey) {
      case 'equipment':
        return (
          <EquipmentStep
            values={equipment}
            onChange={patch => setEquipment(v => ({ ...v, ...patch }))}
          />
        )
      case 'conditions':
        return (
          <ConditionsStep
            values={conditions}
            onChange={patch => setConditions(v => ({ ...v, ...patch }))}
          />
        )
      case 'photos':
        return (
          <PhotosStep
            sessionId={draftId}
            images={draft?.images ?? []}
            measurementsByImage={measurementsByImage}
            onMeasure={img => {
              setMeasureSeed(img.id)
              goToStep(3)
            }}
            onRequireDraft={ensureDraftIfNeeded}
          />
        )
      case 'measure':
        if (!draftId) return null
        return (
          <MeasureStep
            sessionId={draftId}
            distanceM={distanceM > 0 ? distanceM : draft?.distance_m ?? 0}
            images={draft?.images ?? []}
            measurementsByImage={measurementsByImage}
            detectionsByMeasurement={detectionsByMeasurement}
            initialImageId={measureSeed}
            onClearInitialImage={() => setMeasureSeed(undefined)}
            defaultShotCount={5}
          />
        )
      case 'review':
        return (
          <ReviewStep
            session={draft ?? null}
            distanceM={distanceM > 0 ? distanceM : draft?.distance_m ?? 0}
            defaultShotCount={5}
          />
        )
    }
  }

  const onSubmit = () => submitMutation.mutate()

  return (
    <>
      <WizardShell
        steps={steps}
        currentIndex={stepIndex}
        onJump={idx => {
          if (steps[idx]?.reachable) goToStep(idx)
        }}
        onBack={stepIndex === 0 ? undefined : onBack}
        onNext={isLast ? onSubmit : onNext}
        nextLabel={nextLabel}
        nextDisabled={!!nextDisabled}
        isLast={isLast}
        isSaving={autosave.isSaving || submitMutation.isPending}
        lastSavedAt={autosave.lastSavedAt}
        saveError={autosave.error}
        topBar={
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={smartBack}
              aria-label="Back"
              className="inline-flex items-center gap-1.5 t-section-title hover:text-secondary transition-colors"
            >
              <ChevronLeft size={16} /> Back
            </button>
            <div className="flex items-center gap-2">
              <h1 className="t-page-title hidden sm:block">
                {isSubmitted ? 'Edit pellet test' : draftId ? 'Refine draft' : 'New pellet test'}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              {draftId && draft?.is_draft && (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  disabled={deleteDraftMutation.isPending}
                  className="flex items-center gap-1.5 t-section-title hover:text-[var(--error-text)] border border-line hover:border-[var(--error-text)]/40 rounded-full px-3 py-1.5 transition-colors disabled:opacity-50"
                  aria-label="Delete draft"
                >
                  <Trash2 size={13} /> Delete
                </button>
              )}
            </div>
          </div>
        }
      >
        {draftId && draft?.is_draft && stepKey !== 'equipment' && (
          <DraftBanner
            location={draft.location ?? undefined}
            createdAt={draft.created_at}
            valid={equipmentValid && distanceM > 0 && hasGroupOrPhoto}
          />
        )}
        <StepBody />
      </WizardShell>
      <ConfirmDialog
        open={confirmDelete}
        title="Delete draft?"
        message="This pellet test draft will be permanently deleted."
        confirmLabel={deleteDraftMutation.isPending ? 'Deleting…' : 'Delete'}
        onConfirm={() => {
          if (!deleteDraftMutation.isPending) deleteDraftMutation.mutate()
        }}
        onCancel={() => {
          if (!deleteDraftMutation.isPending) setConfirmDelete(false)
        }}
      />
    </>
  )
}

function captureDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short' })
}

function DraftBanner({ location, createdAt, valid }: { location?: string; createdAt: string; valid: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 flex-wrap">
      <span className="text-[11px] tracking-widest uppercase text-amber-600 dark:text-amber-400 font-medium">
        Draft
      </span>
      <span className="t-section-title">·</span>
      <span className="text-xs text-secondary">Captured {captureDate(createdAt)}</span>
      {location && (
        <>
          <span className="t-section-title">·</span>
          <span className="text-xs text-secondary inline-flex items-center gap-1">
            <MapPin size={11} className="opacity-70" />
            {location}
          </span>
        </>
      )}
      <span className="ml-auto inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
        <Sparkles size={12} /> {valid ? 'Ready to publish' : 'Keep going to publish'}
      </span>
    </div>
  )
}
