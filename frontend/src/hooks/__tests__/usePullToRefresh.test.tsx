import { createRef } from 'react'
import { renderHook } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { usePullToRefresh, pageScrollTop } from '../usePullToRefresh'

// jsdom has no TouchEvent constructor, and the hook only reads `touches`.
function touch(type: string, clientY: number) {
  const e = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(e, 'touches', { value: [{ clientY }] })
  return e
}

function setWindowScroll(y: number) {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true, writable: true })
}

describe('pageScrollTop', () => {
  beforeEach(() => setWindowScroll(0))

  it('falls back to the document when the element does not overflow', () => {
    const el = document.createElement('div')
    setWindowScroll(240)
    expect(pageScrollTop(el)).toBe(240)
  })

  it('reads the element when it is the scroller', () => {
    const el = document.createElement('div')
    Object.defineProperty(el, 'scrollHeight', { value: 900 })
    Object.defineProperty(el, 'clientHeight', { value: 400 })
    el.scrollTop = 120
    setWindowScroll(0)
    expect(pageScrollTop(el)).toBe(120)
  })
})

describe('usePullToRefresh', () => {
  let el: HTMLDivElement

  beforeEach(() => {
    setWindowScroll(0)
    el = document.createElement('div')
    document.body.appendChild(el)
  })

  function mount(onRefresh = vi.fn().mockResolvedValue(undefined)) {
    const ref = createRef<HTMLElement>()
    Object.defineProperty(ref, 'current', { value: el, writable: true })
    renderHook(() => usePullToRefresh(ref, onRefresh))
    return onRefresh
  }

  it('leaves a downward drag alone when the document is scrolled', () => {
    mount()
    // The page shell is document-height, so `el.scrollTop` stays 0 even here.
    setWindowScroll(500)
    el.dispatchEvent(touch('touchstart', 200))
    const move = touch('touchmove', 320)
    el.dispatchEvent(move)
    // Preventing this is what stopped the page scrolling back up.
    expect(move.defaultPrevented).toBe(false)
  })

  it('hands the gesture back when the document scrolls mid-drag', () => {
    mount()
    el.dispatchEvent(touch('touchstart', 200))
    setWindowScroll(80)
    const move = touch('touchmove', 320)
    el.dispatchEvent(move)
    expect(move.defaultPrevented).toBe(false)
  })

  it('claims the drag and refreshes when pulled from the top', async () => {
    const onRefresh = mount()
    el.dispatchEvent(touch('touchstart', 200))
    const move = touch('touchmove', 400)
    el.dispatchEvent(move)
    expect(move.defaultPrevented).toBe(true)
    el.dispatchEvent(touch('touchend', 400))
    expect(onRefresh).toHaveBeenCalled()
  })

  it('ignores an upward drag', () => {
    mount()
    el.dispatchEvent(touch('touchstart', 400))
    const move = touch('touchmove', 200)
    el.dispatchEvent(move)
    expect(move.defaultPrevented).toBe(false)
  })
})
