import { useCallback, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  pelletTestApi,
  type CreatePelletTestPayload,
  type PelletTestSession,
  type QuickCreatePelletTestPayload,
  type UpdatePelletTestPayload,
} from '../api/pelletTesting'

export interface UsePelletDraftAutosaveOptions {
  initialId?: string
  onCreated?: (id: string) => void
}

export interface AutosaveState {
  draftId: string | null
  isSaving: boolean
  lastSavedAt: Date | null
  error: string | null
}

export function usePelletDraftAutosave({ initialId, onCreated }: UsePelletDraftAutosaveOptions) {
  const qc = useQueryClient()
  const [state, setState] = useState<AutosaveState>({
    draftId: initialId ?? null,
    isSaving: false,
    lastSavedAt: null,
    error: null,
  })
  // A simple FIFO queue so that rapid step transitions don't fire overlapping
  // PATCHes — each save awaits the previous one before starting.
  const queueRef = useRef<Promise<unknown>>(Promise.resolve())

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['pellet-tests'] })
    qc.invalidateQueries({ queryKey: ['pellet-drafts'] })
    qc.invalidateQueries({ queryKey: ['pellet-drafts-count'] })
    if (state.draftId) {
      qc.invalidateQueries({ queryKey: ['pellet-tests', state.draftId] })
      qc.invalidateQueries({ queryKey: ['pellet-test', state.draftId] })
    }
  }, [qc, state.draftId])

  const enqueue = useCallback(<T,>(work: () => Promise<T>): Promise<T> => {
    const next = queueRef.current.then(() => work())
    queueRef.current = next.catch(() => undefined)
    return next
  }, [])

  const ensureDraft = useCallback(
    async (payload: QuickCreatePelletTestPayload): Promise<PelletTestSession> => {
      return enqueue(async () => {
        if (state.draftId) {
          // Already exists — patch instead.
          setState(s => ({ ...s, isSaving: true, error: null }))
          try {
            const session = await pelletTestApi.update(state.draftId!, payload as UpdatePelletTestPayload)
            setState(s => ({ ...s, isSaving: false, lastSavedAt: new Date() }))
            invalidate()
            return session
          } catch (e) {
            const msg = e instanceof Error ? e.message : 'Failed to save'
            setState(s => ({ ...s, isSaving: false, error: msg }))
            throw e
          }
        }
        setState(s => ({ ...s, isSaving: true, error: null }))
        try {
          const session = await pelletTestApi.quickCreate(payload)
          setState({
            draftId: session.id,
            isSaving: false,
            lastSavedAt: new Date(),
            error: null,
          })
          onCreated?.(session.id)
          invalidate()
          return session
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Failed to save'
          setState(s => ({ ...s, isSaving: false, error: msg }))
          throw e
        }
      })
    },
    [enqueue, invalidate, onCreated, state.draftId],
  )

  const patch = useCallback(
    async (payload: UpdatePelletTestPayload): Promise<PelletTestSession | null> => {
      if (!state.draftId) return null
      return enqueue(async () => {
        setState(s => ({ ...s, isSaving: true, error: null }))
        try {
          const session = await pelletTestApi.update(state.draftId!, payload)
          setState(s => ({ ...s, isSaving: false, lastSavedAt: new Date() }))
          invalidate()
          return session
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Failed to save'
          setState(s => ({ ...s, isSaving: false, error: msg }))
          throw e
        }
      })
    },
    [enqueue, invalidate, state.draftId],
  )

  const createFull = useCallback(
    async (payload: CreatePelletTestPayload): Promise<PelletTestSession> => {
      return enqueue(async () => {
        setState(s => ({ ...s, isSaving: true, error: null }))
        try {
          const session = await pelletTestApi.create(payload)
          setState({
            draftId: session.id,
            isSaving: false,
            lastSavedAt: new Date(),
            error: null,
          })
          onCreated?.(session.id)
          invalidate()
          return session
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Failed to save'
          setState(s => ({ ...s, isSaving: false, error: msg }))
          throw e
        }
      })
    },
    [enqueue, invalidate, onCreated],
  )

  return {
    ...state,
    ensureDraft,
    patch,
    createFull,
  }
}
