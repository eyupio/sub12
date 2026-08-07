import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { usePelletDraftAutosave } from '../usePelletDraftAutosave'
import { pelletTestApi, type PelletTestSession } from '../../api/pelletTesting'

function makeSession(id: string): PelletTestSession {
  return {
    id,
    user_id: 'user-1',
    rifle_id: 'rifle-1',
    pellet_id: 'pellet-1',
    test_date: '2026-08-01',
    distance_m: 10,
    distance_unit: 'm',
    group_count: 0,
    is_public: false,
    is_draft: true,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
  }
}

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('usePelletDraftAutosave', () => {
  it('does not create a second draft when ensureDraft is called twice before the first resolves', async () => {
    // Mirrors a double-tapped "Continue" on the Equipment step: both calls
    // fire from the same render, before React has applied the first one's
    // setState, so both would see draftId as null unless the hook tracks it
    // some other way.
    let resolveCreate!: (session: PelletTestSession) => void
    const created = new Promise<PelletTestSession>(resolve => {
      resolveCreate = resolve
    })
    const quickCreateSpy = vi.spyOn(pelletTestApi, 'quickCreate').mockReturnValue(created)
    const updateSpy = vi
      .spyOn(pelletTestApi, 'update')
      .mockImplementation(async (id, payload) => ({ ...makeSession(id), ...payload }) as PelletTestSession)

    const { result } = renderHook(() => usePelletDraftAutosave({}), { wrapper })

    const payload = { rifle_id: 'rifle-1', pellet_id: 'pellet-1', test_date: '2026-08-01', distance_m: 10 }
    let firstCall!: Promise<PelletTestSession>
    let secondCall!: Promise<PelletTestSession>
    act(() => {
      firstCall = result.current.ensureDraft(payload as never)
      secondCall = result.current.ensureDraft(payload as never)
    })

    // Let the first call's quickCreate resolve; the second call is still
    // queued behind it.
    act(() => resolveCreate(makeSession('session-1')))

    await act(async () => {
      await Promise.all([firstCall, secondCall])
    })

    expect(quickCreateSpy).toHaveBeenCalledTimes(1)
    expect(updateSpy).toHaveBeenCalledTimes(1)
    expect(updateSpy).toHaveBeenCalledWith('session-1', payload)

    await waitFor(() => expect(result.current.draftId).toBe('session-1'))
  })
})
