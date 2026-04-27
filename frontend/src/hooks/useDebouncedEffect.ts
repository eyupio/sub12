import { useEffect, useRef } from 'react'

export function useDebouncedEffect(
  effect: () => void,
  deps: ReadonlyArray<unknown>,
  delayMs: number,
): void {
  const cb = useRef(effect)
  cb.current = effect
  useEffect(() => {
    const t = window.setTimeout(() => cb.current(), delayMs)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, delayMs])
}
