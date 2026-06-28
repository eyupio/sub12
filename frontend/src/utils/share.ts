import { Capacitor } from '@capacitor/core'
import { Share } from '@capacitor/share'

export interface ShareContent {
  title?: string
  text?: string
  url: string
}

// 'shared'      — handed off to the OS / browser share sheet successfully.
// 'cancelled'   — a share sheet opened but the user dismissed it (not an error).
// 'unavailable' — no system share mechanism exists; the caller should fall back
//                 (copy link, explicit channel grid, etc.).
export type ShareResult = 'shared' | 'cancelled' | 'unavailable'

// Hands content to the platform share sheet. Native builds use the Capacitor
// Share plugin because Android WebViews don't expose navigator.share; web / PWA
// uses the Web Share API where present. Returns 'unavailable' when neither
// exists so the caller can reveal an explicit fallback.
export async function shareExternally(content: ShareContent): Promise<ShareResult> {
  if (Capacitor.isNativePlatform()) {
    try {
      await Share.share({
        title: content.title,
        text: content.text,
        url: content.url,
        dialogTitle: content.title,
      })
      return 'shared'
    } catch {
      // The plugin rejects when the user cancels the sheet; treat that as a
      // benign cancel rather than surfacing it as an error.
      return 'cancelled'
    }
  }

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: content.title, text: content.text, url: content.url })
      return 'shared'
    } catch {
      return 'cancelled'
    }
  }

  return 'unavailable'
}

// Whether a one-tap system share sheet is available, used to decide whether to
// surface the primary Share button or fall straight back to explicit channels.
// Native always has the Share plugin; web depends on the Web Share API.
export function hasSystemShare(): boolean {
  return (
    Capacitor.isNativePlatform() ||
    (typeof navigator !== 'undefined' && typeof navigator.share === 'function')
  )
}
