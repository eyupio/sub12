import { useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useNavigationStore } from '../store/navigation'

/**
 * Returns a function that navigates the user "back" to the most relevant previous
 * location. It prefers the most recent history entry matching one of the given
 * prefixes (e.g. a Club page if the user drilled in from a club), falls back to
 * the previous page if any, and finally to the provided fallback path.
 */
export function useSmartBack(fallback: string, preferPrefixes: string[] = []): () => void {
  const navigate = useNavigate()
  return useCallback(() => {
    const store = useNavigationStore.getState()

    if (preferPrefixes.length > 0) {
      const match = store.findRecent(preferPrefixes)
      if (match) {
        navigate({ to: match })
        return
      }
    }

    const prev = store.previous()
    if (prev) {
      navigate({ to: prev })
      return
    }

    navigate({ to: fallback })
  }, [navigate, fallback, preferPrefixes.join('|')]) // eslint-disable-line react-hooks/exhaustive-deps
}
