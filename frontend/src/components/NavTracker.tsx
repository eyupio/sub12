import { useEffect } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { useNavigationStore } from '../store/navigation'

/**
 * Mount once inside the authed shell. Subscribes to router location changes and
 * pushes each new pathname into the navigation history store so pages can
 * compute smart back targets.
 */
export function NavTracker() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const push = useNavigationStore((s) => s.push)

  useEffect(() => {
    push(pathname)
  }, [pathname, push])

  return null
}
