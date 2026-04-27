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
      if (!analyzedSizeMM || analyzedSizeMM <= 0) return

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
          const existing = groups?.find(g => g.id === targetGroupId)
          await pelletTestApi.updateGroup(sessionId, targetGroupId, {
            group_size_mm: analyzedSizeMM,
            shot_count: resolvedShotCount,
            notes: withSourceTag(existing?.notes, 'image'),
          })
          return
        }
      }

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
      const measurement = measurementId
        ? await pelletTestApi.updateMeasurement(sessionId, imageId, measurementId, payload)
        : await pelletTestApi.createMeasurement(sessionId, imageId, payload)
      if (analyzedDistanceValue && analyzedDistanceValue > 0) {
        try {
          await pelletTestApi.update(sessionId, {
            distance_value: analyzedDistanceValue,
            distance_unit: analyzedDistanceUnit ?? 'meters',
          })
        } catch { /* best-effort */ }
      }
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
    onSuccess: () => {
      invalidate()
      setPendingGroupSync(null)
      onSettled?.()
    },
    onError: () => {
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
    }: SaveDetectionsArgs) => {
      const measurement = measurementId
        ? await pelletTestApi.updateMeasurement(sessionId, imageId, measurementId, payload)
        : await pelletTestApi.createMeasurement(sessionId, imageId, payload)

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
      if (analyzedDistanceValue && analyzedDistanceValue > 0) {
        try {
          await pelletTestApi.update(sessionId, {
            distance_value: analyzedDistanceValue,
            distance_unit: analyzedDistanceUnit ?? 'meters',
          })
        } catch { /* best-effort */ }
      }

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
    onSuccess: () => {
      invalidate()
      setPendingGroupSync(null)
      onSettled?.()
    },
    onError: () => {
      setPendingGroupSync(null)
    },
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
