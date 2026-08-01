import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Crosshair } from 'lucide-react'
import ImageMeasurement from '../ImageMeasurement'
import { useAuthStore } from '../../store/auth'
import {
  pelletTestApi,
  type PelletTestDetection,
  type PelletTestImage,
  type PelletTestMeasurement,
} from '../../api/pelletTesting'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMeasurementSync } from '../../hooks/useMeasurementSync'

interface Props {
  sessionId: string
  distanceM: number
  images: PelletTestImage[]
  measurementsByImage: Map<string, PelletTestMeasurement>
  detectionsByMeasurement: Map<string, PelletTestDetection[]>
  initialImageId?: string
  onClearInitialImage?: () => void
  defaultShotCount: number
  onRequestEditImage?: (img: PelletTestImage) => void
}

export function MeasureStep({
  sessionId,
  distanceM,
  images,
  measurementsByImage,
  detectionsByMeasurement,
  initialImageId,
  onClearInitialImage,
  defaultShotCount,
  onRequestEditImage,
}: Props) {
  const qc = useQueryClient()
  const authUser = useAuthStore(s => s.user)
  const { data: session } = useQuery({
    queryKey: ['pellet-test', sessionId],
    queryFn: () => pelletTestApi.get(sessionId),
    enabled: !!sessionId,
  })
  const groups = session?.groups ?? []

  const [activeId, setActiveId] = useState<string | null>(() => initialImageId ?? images[0]?.id ?? null)

  useEffect(() => {
    if (initialImageId && initialImageId !== activeId) {
      setActiveId(initialImageId)
      onClearInitialImage?.()
    }
    // If the active image is removed, fall back to the first available one.
    if (activeId && !images.find(i => i.id === activeId)) {
      setActiveId(images[0]?.id ?? null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images, initialImageId])

  const activeImage = useMemo(
    () => (activeId ? images.find(i => i.id === activeId) ?? null : null),
    [activeId, images],
  )
  const activeMeasurement = activeImage ? measurementsByImage.get(activeImage.id) : undefined
  const activeDetections = activeMeasurement
    ? detectionsByMeasurement.get(activeMeasurement.id)
    : undefined

  const { saveMeasurementMutation, saveDetectionsMutation, isSaving, saveError } =
    useMeasurementSync({
      sessionId,
      groups,
      defaultShotCount,
      onSettled: () => {
        qc.invalidateQueries({ queryKey: ['pellet-test', sessionId] })
      },
    })

  if (images.length === 0) {
    return (
      <section className="bg-surface border border-line rounded-lg p-5 lg:p-6 shadow-card space-y-3">
        <header>
          <h2 className="t-subsection-title">Measure</h2>
          <p className="text-sm text-muted mt-0.5">
            Add a target photo on the previous step to measure groups from the image.
          </p>
        </header>
        <p className="text-sm text-muted text-center py-10 border border-dashed border-line rounded-lg">
          No photos to measure. You can still skip ahead and add groups manually.
        </p>
      </section>
    )
  }

  if (!activeImage) {
    return null
  }

  const currentIndex = images.findIndex(i => i.id === activeImage.id)
  const goPrev = () => {
    const prev = images[currentIndex - 1]
    if (prev) setActiveId(prev.id)
  }
  const goNext = () => {
    const next = images[currentIndex + 1]
    if (next) setActiveId(next.id)
  }

  return (
    <section className="bg-surface border border-line rounded-lg p-5 lg:p-6 shadow-card space-y-4">
      <header className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <h2 className="t-subsection-title">Measure</h2>
          <p className="text-sm text-muted mt-0.5">
            Mark your aim point, calibrate, then either auto-detect holes or click each impact.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goPrev}
            disabled={currentIndex <= 0}
            className="tap-target p-1.5 rounded-full border border-line text-muted hover:text-ink-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Previous photo"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="text-[11px] uppercase tracking-widest text-muted">
            Photo {currentIndex + 1} of {images.length}
          </span>
          <button
            type="button"
            onClick={goNext}
            disabled={currentIndex >= images.length - 1}
            className="tap-target p-1.5 rounded-full border border-line text-muted hover:text-ink-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Next photo"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </header>

      {/* Photo rail */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {images.map(img => {
          const m = measurementsByImage.get(img.id)
          const measured = (m?.measured_size_mm ?? m?.auto_group_size_mm ?? 0) > 0
          return (
            <button
              key={img.id}
              type="button"
              onClick={() => setActiveId(img.id)}
              className={`relative shrink-0 w-16 h-16 rounded border overflow-hidden transition-colors ${
                img.id === activeImage.id ? 'border-gold' : 'border-line hover:border-gold/40'
              }`}
              aria-label={measured ? 'Measured photo' : 'Unmeasured photo'}
            >
              <img src={img.image_url} alt="" className="w-full h-full object-cover" />
              {measured && (
                <span className="absolute bottom-0.5 right-0.5 bg-gold text-inverse rounded-full p-0.5">
                  <Crosshair size={10} />
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Measurement wizard inline */}
      <ImageMeasurement
        key={`${activeImage.id}:${activeMeasurement?.id ?? 'new'}`}
        chromeless
        imageUrl={activeImage.image_url}
        distanceM={distanceM}
        sessionId={sessionId}
        imageId={activeImage.id}
        existingMeasurement={activeMeasurement}
        existingDetections={activeDetections}
        onSave={(payload, analysisMeta) =>
          saveMeasurementMutation.mutate({
            imageId: activeImage.id,
            payload,
            measurementId: activeMeasurement?.id,
            existingGroupId: activeMeasurement?.group_id,
            analyzedSizeMM: analysisMeta.groupSizeMM,
            analyzedShotCount: analysisMeta.shotCount,
            analyzedDistanceValue: analysisMeta.distanceValue,
            analyzedDistanceUnit: analysisMeta.distanceUnit,
          })
        }
        onSaveDetections={(payload, detections, annotatedBlob, analysisMeta) =>
          saveDetectionsMutation.mutate({
            imageId: activeImage.id,
            payload,
            measurementId: activeMeasurement?.id,
            existingGroupId: activeMeasurement?.group_id,
            detections,
            annotatedBlob,
            analyzedSizeMM: analysisMeta.groupSizeMM,
            analyzedShotCount: analysisMeta.shotCount,
            analyzedDistanceValue: analysisMeta.distanceValue,
            analyzedDistanceUnit: analysisMeta.distanceUnit,
          })
        }
        isSaving={isSaving}
        saveError={saveError}
        onRequestCrop={onRequestEditImage ? () => onRequestEditImage(activeImage) : undefined}
        onClose={() => { /* chromeless: parent owns navigation */ }}
        defaultDistanceUnit={(authUser?.default_distance_unit as 'meters' | 'yards') ?? undefined}
        defaultMeasurementUnit={(authUser?.default_measurement_unit as 'cm' | 'mm') ?? undefined}
      />
    </section>
  )
}
