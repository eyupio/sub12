import '@testing-library/jest-dom/vitest'
import { configure } from '@testing-library/react'

configure({
  asyncUtilTimeout: process.env.CI ? 5000 : 1000,
})

// jsdom lacks ResizeObserver; tests that mount canvas-based components rely on it.
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver
}

// jsdom File objects are incompatible with Vitest's native Blob object URL shim.
URL.createObjectURL = () => 'blob:vitest-test'
URL.revokeObjectURL = () => {}

// jsdom implements no layout, so it ships no scrollIntoView. Components that
// bring a deep-linked element into view would otherwise throw on mount.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {}
}

// Vitest's jsdom createObjectURL shim reads Blob's private _buffer, which jsdom 30 does not expose.
URL.createObjectURL = () => 'blob:stub'
URL.revokeObjectURL = () => {}
