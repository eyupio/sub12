import { useCallback, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  pelletTestApi,
  type CreateMeasurementPayload,
  type PelletTestGroup,
} from '../api/pelletTesting'
import type { DetectedHole } from '../utils/holeDetection'

export type PendingGroupSync =
  | { mode: 'update'; groupId: string }
  | { mode: 'create'; shotCount: number; notes?: string }
  | null

function withSourceTag(notes: string | undefined, source: 'manual' | 'image'): string {
  const cleaned = (notes ?? '').replace(/\s*\[source:(manual|image)\]\s*/g, ' ').trim()
  const sourceTag = source === 'image' ? '[source:image]' : '[source:manual]'
  return cleaned ? `${cleaned} ${sourceTag}` : sourceTag
}

function upsertMeasurement(
  sessionId: string,
  imageId: string,
  measurementId: string | undefined,
  payload: CreateMeasurementPayload,
) {
  return measurementId
    ? pelletTestApi.updateMeasurement(sessionId, imageId, measurementId, payload)
    : pelletTestApi.createMeasurement(sessionId, imageId, payload)
}

// Best-effort: a distance the analyzer read off the image is a convenience
// update to the session, never something either save mutation should fail on.
async function applyAnalyzedDistance(
  sessionId: string,
  analyzedDistanceValue: number | undefined,
  analyzedDistanceUnit: 'meters' | 'yards' | undefined,
) {
  if (!analyzedDistanceValue || analyzedDistanceValue <= 0) return
  try {
    await pelletTestApi.update(sessionId, {
      distance_value: analyzedDistanceValue,
      distance_unit: analyzedDistanceUnit ?? 'meters',
    })
  } catch { /* best-effort */ }
}

interface SaveMeasurementArgs {
  imageId: string
  payload: CreateMeasurementPayload
  measurementId?: string
  existingGroupId?: string
  analyzedSizeMM?: number | null
  analyzedShotCount?: number
  analyzedDistanceValue?: number
  analyzedDistanceUnit?: 'meters' | 'yards'
}

interface SaveDetectionsArgs extends SaveMeasurementArgs {
  detections: DetectedHole[]
  annotatedBlob: Blob | null
}

export interface UseMeasurementSyncOptions {
  sessionId: string
  groups?: PelletTestGroup[]
  defaultShotCount?: number
  onSettled?: () => void
}

export function useMeasurementSync({
  sessionId,
  groups,
  defaultShotCount = 5,
  onSettled,
}: UseMeasurementSyncOptions) {
  const qc = useQueryClient()
  const [pendingGroupSync, setPendingGroupSync] = useState<PendingGroupSync>(null)

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['pellet-tests', sessionId] })
    qc.invalidateQueries({ queryKey: ['pellet-tests', sessionId, 'scoring'] })
    qc.invalidateQueries({ queryKey: ['pellet-tests'] })
    qc.invalidateQueries({ queryKey: ['pellet-test-stats'] })
    qc.invalidateQueries({ queryKey: ['pellet-drafts'] })
    qc.invalidateQueries({ queryKey: ['pellet-drafts-count'] })
  }, [qc, sessionId])

  const syncGroupFromAnalysis = useCallback(
    async (args: {
      imageId: string
      measurementId: string
      existingGroupId?: string
      analyzedSizeMM?: number | null
      analyzedShotCount?: number
    }) => {
      const { imageId, measurementId, existingGroupId, analyzedSizeMM, analyzedShotCount } = args

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
          const existing = groups?.find(g => g.id === targetGroupId)
          if (existing?.shot_count) return existing.shot_count
        }
        return defaultShotCount
      })()

      if (targetGroupId) {
        const linkedGroupExists = groups?.some(g => g.id === targetGroupId)
        if (linkedGroupExists) {
          // Group size is now resynced server-side from the measurement
          // (see PelletTestService.SyncGroupFromMeasurements); only patch
          // shot_count here, since that isn't derived from the measurement.
          const existing = groups?.find(g => g.id === targetGroupId)
          if (existing && existing.shot_count !== resolvedShotCount) {
            await pelletTestApi.updateGroup(sessionId, targetGroupId, {
              shot_count: resolvedShotCount,
              notes: withSourceTag(existing?.notes, 'image'),
            })
          }
          return
        }
      }

      if (!analyzedSizeMM || analyzedSizeMM <= 0) return

      const notes = pendingGroupSync?.mode === 'create' ? pendingGroupSync.notes : undefined
      const created = await pelletTestApi.createGroup(sessionId, {
        shot_count: resolvedShotCount,
        group_size_mm: analyzedSizeMM,
        notes: withSourceTag(notes, 'image'),
      })
      try {
        await pelletTestApi.updateMeasurement(sessionId, imageId, measurementId, {
          group_id: created.id,
        })
      } catch {
        // best-effort link-back; the group is persisted regardless
      }
    },
    [defaultShotCount, groups, pendingGroupSync, sessionId],
  )

  const settleHandlers = {
    onSuccess: () => {
      invalidate()
      setPendingGroupSync(null)
      onSettled?.()
    },
    onError: () => {
      setPendingGroupSync(null)
    },
  }

  const saveMeasurementMutation = useMutation({
    mutationFn: async ({
      imageId,
      payload,
      measurementId,
      existingGroupId,
      analyzedSizeMM,
      analyzedShotCount,
      analyzedDistanceValue,
      analyzedDistanceUnit,
    }: SaveMeasurementArgs) => {
      const measurement = await upsertMeasurement(sessionId, imageId, measurementId, payload)
      await applyAnalyzedDistance(sessionId, analyzedDistanceValue, analyzedDistanceUnit)
      try {
        await syncGroupFromAnalysis({
          imageId,
          measurementId: measurement.id,
          existingGroupId,
          analyzedSizeMM,
          analyzedShotCount,
        })
      } catch { /* best-effort */ }
      return measurement
    },
    ...settleHandlers,
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
    }: SaveDetectionsArgs) => {
      const measurement = await upsertMeasurement(sessionId, imageId, measurementId, payload)

      const detectionsPayload = {
        detection_method: 'auto',
        detections: detections.map(d => ({
          center_x: d.centerX,
          center_y: d.centerY,
          radius_pixels: d.radiusPixels,
          diameter_mm: d.diameterMM,
          confidence: d.confidence,
        })),
      }
      if (measurementId) {
        await pelletTestApi.replaceDetections(sessionId, imageId, measurement.id, detectionsPayload)
      } else {
        await pelletTestApi.createDetections(sessionId, imageId, measurement.id, detectionsPayload)
      }

      if (annotatedBlob) {
        try {
          await pelletTestApi.uploadAnnotatedImage(sessionId, imageId, measurement.id, annotatedBlob)
        } catch { /* best-effort */ }
      }
      await applyAnalyzedDistance(sessionId, analyzedDistanceValue, analyzedDistanceUnit)

      try {
        await syncGroupFromAnalysis({
          imageId,
          measurementId: measurement.id,
          existingGroupId,
          analyzedSizeMM,
          analyzedShotCount,
        })
      } catch { /* best-effort */ }

      return measurement
    },
    ...settleHandlers,
  })

  return {
    pendingGroupSync,
    setPendingGroupSync,
    saveMeasurementMutation,
    saveDetectionsMutation,
    isSaving: saveMeasurementMutation.isPending || saveDetectionsMutation.isPending,
    saveError:
      saveMeasurementMutation.isError || saveDetectionsMutation.isError
        ? 'Failed to save.'
        : null,
  }
}
