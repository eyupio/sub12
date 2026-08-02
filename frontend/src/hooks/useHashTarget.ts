import { useEffect } from 'react'

/**
 * Scroll the element named by the URL hash into view once it exists.
 *
 * Deep links from notifications and moderation emails point at a row inside a
 * list that is still loading on arrival, so the browser's own hash handling
 * finds nothing. Pass `ready` as the flag that flips when the list has
 * rendered; the effect re-runs then and lands on the row.
 */
export function useHashTarget(ready: boolean) {
  useEffect(() => {
    if (!ready) return
    const id = window.location.hash.replace(/^#/, '')
    if (!id) return
    document.getElementById(id)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [ready])
}
