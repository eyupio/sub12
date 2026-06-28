import { Capacitor } from '@capacitor/core'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'

export type ImageSource = 'camera' | 'photos'

// Decode a `data:` URL into a File without going through fetch(). The Camera
// plugin returns a base64 data URL we can parse directly; this matters on
// native where CapacitorHttp patches the global fetch and can intercept/break a
// fetch of the local capture URL.
function dataUrlToFile(dataUrl: string, filename: string): File | null {
  const comma = dataUrl.indexOf(',')
  if (comma === -1) return null
  const type = /^data:([^;]+)/.exec(dataUrl.slice(0, comma))?.[1] || 'image/jpeg'
  try {
    const binary = atob(dataUrl.slice(comma + 1))
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return new File([bytes], filename, { type })
  } catch {
    return null
  }
}

// Whether image capture should go through the native Camera plugin. On web we
// keep the existing <input type="file"> flow — the plugin's web fallback renders
// its own picker UI, which would duplicate the app's editor/upload affordances.
export function nativeImagePicker(): boolean {
  return Capacitor.isNativePlatform()
}

// Capture a photo ('camera') or pick one ('photos') via the native Camera plugin
// and return it as a File, ready for the existing FormData upload path. Returns
// null when the user cancels or denies permission — the same no-op the web file
// input produces when its dialog is dismissed.
export async function pickImage(source: ImageSource): Promise<File | null> {
  try {
    const photo = await Camera.getPhoto({
      source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
      // Return the image as a base64 data URL we can decode in JS. Using a Uri
      // result would force a fetch() of the local capture path, which the native
      // HTTP layer (CapacitorHttp) can intercept and fail on.
      resultType: CameraResultType.DataUrl,
      quality: 90,
      // The app has its own ImageEditor (crop/rotate), so don't double up with
      // the OS editor.
      allowEditing: false,
      correctOrientation: true,
    })
    const dataUrl = photo.dataUrl
    if (!dataUrl) return null
    const format = photo.format || 'jpeg'
    return dataUrlToFile(dataUrl, `photo-${Date.now()}.${format}`)
  } catch {
    // Cancel / permission denied / capture error — treat all as "no image",
    // matching how a dismissed file dialog behaves on web.
    return null
  }
}

// Route a capture affordance to the native picker on native, or fall back to
// clicking the hidden <input type="file"> on web. Keeps each call site a
// one-liner while leaving the web path byte-for-byte unchanged.
export function captureImageOrClick(
  source: ImageSource,
  fallbackInput: { current: HTMLInputElement | null } | null | undefined,
  onFile: (file: File) => void,
): void {
  if (nativeImagePicker()) {
    void pickImage(source).then((file) => {
      if (file) onFile(file)
    })
  } else {
    fallbackInput?.current?.click()
  }
}
