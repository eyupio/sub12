import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Capacitor } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'
import { requestPosition } from '../geolocation'

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: vi.fn(() => false) },
}))

vi.mock('@capacitor/geolocation', () => ({
  Geolocation: { getCurrentPosition: vi.fn() },
}))

const isNative = vi.mocked(Capacitor.isNativePlatform)
const nativeGet = vi.mocked(Geolocation.getCurrentPosition)

function setBrowserGeolocation(value: unknown) {
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value })
}

describe('requestPosition', () => {
  beforeEach(() => {
    isNative.mockReturnValue(false)
    nativeGet.mockReset()
  })
  afterEach(() => vi.restoreAllMocks())

  it('uses the native Geolocation plugin on native', async () => {
    isNative.mockReturnValue(true)
    nativeGet.mockResolvedValue({
      coords: { latitude: 51.5, longitude: -0.12 },
    } as Awaited<ReturnType<typeof Geolocation.getCurrentPosition>>)

    await expect(requestPosition()).resolves.toEqual({ lat: 51.5, lng: -0.12 })
    expect(nativeGet).toHaveBeenCalledTimes(1)
  })

  it('uses the browser Geolocation API on web', async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) =>
      success({ coords: { latitude: 40, longitude: -73 } } as GeolocationPosition),
    )
    setBrowserGeolocation({ getCurrentPosition })

    await expect(requestPosition()).resolves.toEqual({ lat: 40, lng: -73 })
    expect(nativeGet).not.toHaveBeenCalled()
  })

  it('rejects when the browser denies or errors', async () => {
    const getCurrentPosition = vi.fn((_s: PositionCallback, error?: PositionErrorCallback) =>
      error?.({ code: 1, message: 'denied' } as GeolocationPositionError),
    )
    setBrowserGeolocation({ getCurrentPosition })

    await expect(requestPosition()).rejects.toBeDefined()
  })

  it('rejects when geolocation is unavailable on web', async () => {
    setBrowserGeolocation(undefined)
    await expect(requestPosition()).rejects.toThrow(/unavailable/i)
  })
})
