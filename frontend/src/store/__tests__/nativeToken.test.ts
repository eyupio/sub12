import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { clearStoredRefreshToken, loadStoredRefreshToken, saveStoredRefreshToken } from '../nativeToken'

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: vi.fn(() => false) },
}))

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(),
    set: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  },
}))

const isNative = vi.mocked(Capacitor.isNativePlatform)
const prefGet = vi.mocked(Preferences.get)
const prefSet = vi.mocked(Preferences.set)
const prefRemove = vi.mocked(Preferences.remove)

describe('nativeToken', () => {
  beforeEach(() => {
    isNative.mockReturnValue(false)
    prefGet.mockReset()
    prefSet.mockReset().mockResolvedValue(undefined)
    prefRemove.mockReset().mockResolvedValue(undefined)
  })
  afterEach(() => vi.restoreAllMocks())

  it('no-ops on web', async () => {
    expect(await loadStoredRefreshToken()).toBeNull()
    saveStoredRefreshToken('abc')
    clearStoredRefreshToken()
    expect(prefGet).not.toHaveBeenCalled()
    expect(prefSet).not.toHaveBeenCalled()
    expect(prefRemove).not.toHaveBeenCalled()
  })

  it('loads the stored token on native', async () => {
    isNative.mockReturnValue(true)
    prefGet.mockResolvedValue({ value: 'rt-1' })
    expect(await loadStoredRefreshToken()).toBe('rt-1')
    expect(prefGet).toHaveBeenCalledWith({ key: 'sub12_refresh_token' })
  })

  it('returns null on native when nothing stored or read fails', async () => {
    isNative.mockReturnValue(true)
    prefGet.mockResolvedValue({ value: null })
    expect(await loadStoredRefreshToken()).toBeNull()
    prefGet.mockRejectedValue(new Error('boom'))
    expect(await loadStoredRefreshToken()).toBeNull()
  })

  it('saves and clears the token on native', () => {
    isNative.mockReturnValue(true)
    saveStoredRefreshToken('rt-2')
    expect(prefSet).toHaveBeenCalledWith({ key: 'sub12_refresh_token', value: 'rt-2' })
    clearStoredRefreshToken()
    expect(prefRemove).toHaveBeenCalledWith({ key: 'sub12_refresh_token' })
  })

  it('clears instead of saving an empty token', () => {
    isNative.mockReturnValue(true)
    saveStoredRefreshToken('')
    expect(prefSet).not.toHaveBeenCalled()
    expect(prefRemove).toHaveBeenCalledWith({ key: 'sub12_refresh_token' })
  })
})
