import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'

// Keep the native status bar in sync with the active theme so it doesn't sit as
// a fixed black strip above a light-themed app. Capacitor's Style.Dark renders
// light icons/text (for dark backgrounds) and Style.Light renders dark ones (for
// light backgrounds); the background colour only takes effect on Android. The
// colours mirror the theme-color <meta> values set in store/theme.ts. No-ops on
// web, where there's no native status bar to style.
export function syncStatusBar(resolved: 'light' | 'dark'): void {
  if (!Capacitor.isNativePlatform()) return
  StatusBar.setStyle({ style: resolved === 'dark' ? Style.Dark : Style.Light }).catch(() => {})
  StatusBar.setBackgroundColor({ color: resolved === 'dark' ? '#0C0C0C' : '#F5F5F0' }).catch(() => {})
}
