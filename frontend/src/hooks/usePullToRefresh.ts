import { RefObject, useCallback, useEffect, useRef, useState } from 'react'
import { haptics } from '../utils/haptics'

// Finger travel needed to arm a refresh, and where the indicator stops.
const TRIGGER = 72
const MAX_TRAVEL = 110
// Damping: the indicator moves at half the finger's speed so the pull feels
// rubbery instead of stuck to the thumb.
const RESISTANCE = 0.5
// Parked offsets, relative to the indicator's own `fixed` position.
const HIDDEN_Y = -56
const SPINNING_Y = 16

/**
 * How far the page is scrolled from its top.
 *
 * The app shell is document-height, so `main` only overflows — and only carries
 * a non-zero `scrollTop` — when something above it constrains its height. On
 * every normal screen the document is the scroller, and reading `main.scrollTop`
 * reports 0 no matter how far down the user is.
 */
export function pageScrollTop(el: HTMLElement | null): number {
  if (el && el.scrollHeight > el.clientHeight) return el.scrollTop
  return window.scrollY || document.documentElement.scrollTop || 0
}

interface PullToRefresh {
  /** Attach to the floating indicator; the hook drives its transform directly. */
  indicatorRef: RefObject<HTMLDivElement>
  /** True from release until onRefresh settles — spin the icon while set. */
  refreshing: boolean
}

/**
 * Touch pull-to-refresh for a scroll container. The native shell has no browser
 * chrome to reload from, so this is the only gesture that forces fresh data.
 *
 * The drag is animated by writing to the indicator's style directly rather than
 * through React state: the container is the whole page, and re-rendering it on
 * every touchmove drops frames.
 */
export function usePullToRefresh(
  scrollRef: RefObject<HTMLElement>,
  onRefresh: () => Promise<unknown>,
  enabled = true,
): PullToRefresh {
  const indicatorRef = useRef<HTMLDivElement>(null)
  const [refreshing, setRefreshing] = useState(false)
  // Keeps the listeners off the render loop while still calling the latest
  // refresh callback.
  const refreshCb = useRef(onRefresh)
  refreshCb.current = onRefresh

  const place = useCallback((travel: number, animate: boolean) => {
    const node = indicatorRef.current
    if (!node) return
    const progress = Math.min(travel / TRIGGER, 1)
    node.style.transition = animate
      ? 'transform var(--dur-base) var(--ease-out), opacity var(--dur-base) var(--ease-out)'
      : 'none'
    node.style.transform = `translate(-50%, ${HIDDEN_Y + travel}px) scale(${0.7 + 0.3 * progress})`
    node.style.opacity = String(progress)
  }, [])

  // Park it out of sight before the first gesture, and again if the gesture is
  // switched off mid-pull (keyboard opening, sheet opening).
  useEffect(() => { place(0, false) }, [place, enabled])

  useEffect(() => {
    const el = scrollRef.current
    if (!el || !enabled) return

    let startY = 0
    let pulling = false
    let armed = false
    let travel = 0

    const start = (e: TouchEvent) => {
      if (e.touches.length !== 1 || pageScrollTop(el) > 0) return
      startY = e.touches[0].clientY
      pulling = true
      armed = false
      travel = 0
    }

    const move = (e: TouchEvent) => {
      if (!pulling) return
      const dy = e.touches[0].clientY - startY
      // Swiping up, or the container scrolled under us — hand the gesture back.
      if (dy <= 0 || pageScrollTop(el) > 0) {
        pulling = false
        travel = 0
        place(0, true)
        return
      }
      travel = Math.min(dy * RESISTANCE, MAX_TRAVEL)
      // We own the gesture now; stop the container overscrolling behind it.
      if (e.cancelable) e.preventDefault()
      if (travel >= TRIGGER && !armed) {
        armed = true
        haptics.selectionChanged()
      } else if (travel < TRIGGER) {
        armed = false
      }
      place(travel, false)
    }

    const end = () => {
      if (!pulling) return
      pulling = false
      const fire = travel >= TRIGGER
      travel = 0
      if (!fire) {
        place(0, true)
        return
      }
      haptics.tapMedium()
      place(SPINNING_Y - HIDDEN_Y, true)
      setRefreshing(true)
      Promise.resolve(refreshCb.current())
        .catch(() => {})
        .finally(() => {
          setRefreshing(false)
          place(0, true)
        })
    }

    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', end)
    el.addEventListener('touchcancel', end)
    return () => {
      el.removeEventListener('touchstart', start)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', end)
      el.removeEventListener('touchcancel', end)
    }
  }, [scrollRef, enabled, place])

  return { indicatorRef, refreshing }
}
