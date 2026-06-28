import { Capacitor } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'

export interface Coords {
  lat: number
  lng: number
}

const OPTIONS = { enableHighAccuracy: true, timeout: 8000, maximumAge: 30_000 }

// Resolve the device's current position. Uses the native Geolocation plugin on
// native — it drives the OS permission prompt, and a WebView's
// navigator.geolocation is unreliable there — and the browser Geolocation API on
// web. Rejects on permission denial, timeout, or when geolocation is
// unavailable, so callers keep their own "couldn't get location" messaging.
export async function requestPosition(): Promise<Coords> {
  if (Capacitor.isNativePlatform()) {
    const pos = await Geolocation.getCurrentPosition(OPTIONS)
    return { lat: pos.coords.latitude, lng: pos.coords.longitude }
  }
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    throw new Error('Geolocation unavailable')
  }
  return new Promise<Coords>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(err),
      OPTIONS,
    )
  })
}
