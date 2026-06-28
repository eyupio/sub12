import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Capacitor } from '@capacitor/core'
import { Share } from '@capacitor/share'
import { hasSystemShare, shareExternally } from '../share'

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: vi.fn(() => false) },
}))

vi.mock('@capacitor/share', () => ({
  Share: { share: vi.fn() },
}))

const isNative = vi.mocked(Capacitor.isNativePlatform)
const nativeShare = vi.mocked(Share.share)

function setNavigatorShare(value: unknown) {
  Object.defineProperty(navigator, 'share', { configurable: true, value })
}

const content = { title: 'Title', text: 'Body', url: 'https://sub12.io/x/1' }

describe('shareExternally', () => {
  beforeEach(() => {
    isNative.mockReturnValue(false)
    nativeShare.mockReset()
    setNavigatorShare(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uses the Capacitor Share plugin on native', async () => {
    isNative.mockReturnValue(true)
    nativeShare.mockResolvedValue(undefined as unknown as Awaited<ReturnType<typeof Share.share>>)

    await expect(shareExternally(content)).resolves.toBe('shared')
    expect(nativeShare).toHaveBeenCalledWith({
      title: 'Title',
      text: 'Body',
      url: 'https://sub12.io/x/1',
      dialogTitle: 'Title',
    })
  })

  it('treats a native cancel as cancelled, not an error', async () => {
    isNative.mockReturnValue(true)
    nativeShare.mockRejectedValue(new Error('Share canceled'))

    await expect(shareExternally(content)).resolves.toBe('cancelled')
  })

  it('uses the Web Share API on web when available', async () => {
    const webShare = vi.fn().mockResolvedValue(undefined)
    setNavigatorShare(webShare)

    await expect(shareExternally(content)).resolves.toBe('shared')
    expect(webShare).toHaveBeenCalledWith({
      title: 'Title',
      text: 'Body',
      url: 'https://sub12.io/x/1',
    })
    expect(nativeShare).not.toHaveBeenCalled()
  })

  it('returns cancelled when the Web Share API rejects', async () => {
    setNavigatorShare(vi.fn().mockRejectedValue(new Error('dismissed')))
    await expect(shareExternally(content)).resolves.toBe('cancelled')
  })

  it('returns unavailable on web with no Web Share API', async () => {
    await expect(shareExternally(content)).resolves.toBe('unavailable')
  })
})

describe('hasSystemShare', () => {
  beforeEach(() => {
    isNative.mockReturnValue(false)
    setNavigatorShare(undefined)
  })

  it('is true on native regardless of navigator.share', () => {
    isNative.mockReturnValue(true)
    expect(hasSystemShare()).toBe(true)
  })

  it('is true on web when navigator.share exists', () => {
    setNavigatorShare(vi.fn())
    expect(hasSystemShare()).toBe(true)
  })

  it('is false on web without navigator.share', () => {
    expect(hasSystemShare()).toBe(false)
  })
})
