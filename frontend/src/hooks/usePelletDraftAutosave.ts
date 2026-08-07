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
  // Mirrors state.draftId, read inside queued work instead of the closed-over
  // `state`. Two calls fired from the same stale render (a double-tapped
  // Continue button before React re-renders) share the same `state.draftId`
  // closure, so the second would still see it as null when its turn in the
  // queue comes up and quickCreate a second, orphaned draft session instead
  // of patching the first. The ref is mutated synchronously the moment a
  // draft id is known, so a later-queued check always sees it.
  const draftIdRef = useRef<string | null>(initialId ?? null)

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['pellet-tests'] })
    qc.invalidateQueries({ queryKey: ['pellet-drafts'] })
    qc.invalidateQueries({ queryKey: ['pellet-drafts-count'] })
    if (draftIdRef.current) {
      qc.invalidateQueries({ queryKey: ['pellet-tests', draftIdRef.current] })
      qc.invalidateQueries({ queryKey: ['pellet-test', draftIdRef.current] })
    }
  }, [qc])

  const enqueue = useCallback(<T,>(work: () => Promise<T>): Promise<T> => {
    const next = queueRef.current.then(() => work())
    queueRef.current = next.catch(() => undefined)
    return next
  }, [])

  const ensureDraft = useCallback(
    async (payload: QuickCreatePelletTestPayload): Promise<PelletTestSession> => {
      return enqueue(async () => {
        if (draftIdRef.current) {
          // Already exists — patch instead.
          const id = draftIdRef.current
          setState(s => ({ ...s, isSaving: true, error: null }))
          try {
            const session = await pelletTestApi.update(id, payload as UpdatePelletTestPayload)
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
          draftIdRef.current = session.id
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

  const patch = useCallback(
    async (payload: UpdatePelletTestPayload): Promise<PelletTestSession | null> => {
      if (!draftIdRef.current) return null
      return enqueue(async () => {
        const id = draftIdRef.current
        if (!id) return null
        setState(s => ({ ...s, isSaving: true, error: null }))
        try {
          const session = await pelletTestApi.update(id, payload)
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
    [enqueue, invalidate],
  )

  const createFull = useCallback(
    async (payload: CreatePelletTestPayload): Promise<PelletTestSession> => {
      return enqueue(async () => {
        setState(s => ({ ...s, isSaving: true, error: null }))
        try {
          const session = await pelletTestApi.create(payload)
          draftIdRef.current = session.id
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
