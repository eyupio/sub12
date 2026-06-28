import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Capacitor } from '@capacitor/core'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { captureImageOrClick, nativeImagePicker, pickImage } from '../imagePicker'

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: vi.fn(() => false) },
}))

vi.mock('@capacitor/camera', () => ({
  Camera: { getPhoto: vi.fn() },
  CameraResultType: { Uri: 'uri', DataUrl: 'dataUrl' },
  CameraSource: { Camera: 'CAMERA', Photos: 'PHOTOS' },
}))

const isNative = vi.mocked(Capacitor.isNativePlatform)
const getPhoto = vi.mocked(Camera.getPhoto)

// base64 of the single byte "x" is "eA==".
function dataUrl(mime: string) {
  return `data:${mime};base64,eA==`
}

describe('nativeImagePicker', () => {
  afterEach(() => vi.restoreAllMocks())

  it('tracks the native platform flag', () => {
    isNative.mockReturnValue(false)
    expect(nativeImagePicker()).toBe(false)
    isNative.mockReturnValue(true)
    expect(nativeImagePicker()).toBe(true)
  })
})

describe('pickImage', () => {
  beforeEach(() => {
    isNative.mockReturnValue(true)
    getPhoto.mockReset()
  })
  afterEach(() => vi.restoreAllMocks())

  it('captures from the camera and returns a File', async () => {
    getPhoto.mockResolvedValue({ dataUrl: dataUrl('image/jpeg'), format: 'jpeg' } as Awaited<ReturnType<typeof Camera.getPhoto>>)

    const file = await pickImage('camera')

    expect(getPhoto).toHaveBeenCalledWith(
      expect.objectContaining({ source: CameraSource.Camera, resultType: CameraResultType.DataUrl, allowEditing: false }),
    )
    expect(file).toBeInstanceOf(File)
    expect(file?.type).toBe('image/jpeg')
    expect(file?.name).toMatch(/^photo-\d+\.jpeg$/)
  })

  it('picks from the photo library with the Photos source', async () => {
    getPhoto.mockResolvedValue({ dataUrl: dataUrl('image/jpeg'), format: 'jpeg' } as Awaited<ReturnType<typeof Camera.getPhoto>>)

    await pickImage('photos')

    expect(getPhoto).toHaveBeenCalledWith(expect.objectContaining({ source: CameraSource.Photos }))
  })

  it('derives the mime type from the data URL header', async () => {
    getPhoto.mockResolvedValue({ dataUrl: dataUrl('image/png'), format: 'png' } as Awaited<ReturnType<typeof Camera.getPhoto>>)

    const file = await pickImage('photos')

    expect(file?.type).toBe('image/png')
    expect(file?.name).toMatch(/\.png$/)
  })

  it('returns null when the user cancels or permission is denied', async () => {
    getPhoto.mockRejectedValue(new Error('User cancelled photos app'))
    expect(await pickImage('camera')).toBeNull()
  })

  it('returns null when the plugin yields no dataUrl', async () => {
    getPhoto.mockResolvedValue({ format: 'jpeg' } as Awaited<ReturnType<typeof Camera.getPhoto>>)
    expect(await pickImage('photos')).toBeNull()
  })
})

describe('captureImageOrClick', () => {
  beforeEach(() => {
    getPhoto.mockReset()
  })
  afterEach(() => vi.restoreAllMocks())

  it('routes to the native picker and forwards the File on native', async () => {
    isNative.mockReturnValue(true)
    getPhoto.mockResolvedValue({ dataUrl: dataUrl('image/jpeg'), format: 'jpeg' } as Awaited<ReturnType<typeof Camera.getPhoto>>)
    const onFile = vi.fn()
    const click = vi.fn()
    const ref = { current: { click } as unknown as HTMLInputElement }

    captureImageOrClick('camera', ref, onFile)

    await vi.waitFor(() => expect(onFile).toHaveBeenCalledTimes(1))
    expect(onFile.mock.calls[0][0]).toBeInstanceOf(File)
    expect(click).not.toHaveBeenCalled()
  })

  it('clicks the hidden file input on web and never touches the plugin', () => {
    isNative.mockReturnValue(false)
    const onFile = vi.fn()
    const click = vi.fn()
    const ref = { current: { click } as unknown as HTMLInputElement }

    captureImageOrClick('photos', ref, onFile)

    expect(click).toHaveBeenCalledTimes(1)
    expect(getPhoto).not.toHaveBeenCalled()
    expect(onFile).not.toHaveBeenCalled()
  })
})
