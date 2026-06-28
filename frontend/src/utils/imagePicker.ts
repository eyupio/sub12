import { Capacitor } from '@capacitor/core'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'

export type ImageSource = 'camera' | 'photos'

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
      resultType: CameraResultType.Uri,
      quality: 90,
      // The app has its own ImageEditor (crop/rotate), so don't double up with
      // the OS editor.
      allowEditing: false,
      correctOrientation: true,
    })
    const webPath = photo.webPath
    if (!webPath) return null
    const res = await fetch(webPath)
    const blob = await res.blob()
    const format = photo.format || 'jpeg'
    const type = blob.type || `image/${format}`
    return new File([blob], `photo-${Date.now()}.${format}`, { type })
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
