import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Capacitor } from '@capacitor/core'
import { siteOrigin } from '../site'

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: vi.fn(() => false) },
}))

const isNative = vi.mocked(Capacitor.isNativePlatform)

describe('siteOrigin', () => {
  beforeEach(() => {
    isNative.mockReturnValue(false)
    Object.assign(window, { location: { ...window.location, origin: 'https://app.test' } })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('uses window.location.origin on web', () => {
    expect(siteOrigin()).toBe('https://app.test')
  })

  it('uses the canonical public host on native, not the local WebView origin', () => {
    isNative.mockReturnValue(true)
    expect(siteOrigin()).toBe('https://sub12.io')
  })

  it('honours VITE_SITE_URL on every platform and trims a trailing slash', () => {
    vi.stubEnv('VITE_SITE_URL', 'https://beta.sub12.io/')
    expect(siteOrigin()).toBe('https://beta.sub12.io')
    isNative.mockReturnValue(true)
    expect(siteOrigin()).toBe('https://beta.sub12.io')
  })
})
