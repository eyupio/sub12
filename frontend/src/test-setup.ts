import '@testing-library/jest-dom/vitest'
import { configure } from '@testing-library/react'

configure({
  asyncUtilTimeout: process.env.CI ? 5000 : 1000,
})

// Vitest's object URL shim expects Node Blobs, but jsdom creates its own File
// objects. Tests do not load blob contents, so use stable URLs instead.
let objectURLId = 0
URL.createObjectURL = () => `blob:test-${++objectURLId}`
URL.revokeObjectURL = () => {}

// jsdom lacks ResizeObserver; tests that mount canvas-based components rely on it.
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver
}

// jsdom implements no layout, so it ships no scrollIntoView. Components that
// bring a deep-linked element into view would otherwise throw on mount.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {}
}
