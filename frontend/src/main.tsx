import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { registerSW } from 'virtual:pwa-register'
import { Capacitor } from '@capacitor/core'
import { App as CapApp } from '@capacitor/app'
import { SplashScreen } from '@capacitor/splash-screen'
import { StatusBar, Style } from '@capacitor/status-bar'
import App from './App'
import { initTheme } from './store/theme'
import './index.css'
import 'tippy.js/dist/tippy.css'

// Apply theme before React mounts to prevent FOUC
initTheme()

if (Capacitor.isNativePlatform()) {
  // Marks the document so safe-area-inset CSS (index.css) applies only inside the
  // native shell, leaving mobile-web/PWA layout untouched.
  document.documentElement.classList.add('native-app')

  // Inside a native WebView the Workbox service worker is redundant (assets ship
  // inside the app) and can serve a stale app shell after an update, so we skip
  // registration entirely. Splash dismissal and status-bar styling are native-only.
  SplashScreen.hide().catch(() => {})
  StatusBar.setStyle({ style: Style.Dark }).catch(() => {})
  StatusBar.setBackgroundColor({ color: '#0f172a' }).catch(() => {})

  // Map the Android hardware back button onto browser history so it navigates
  // the SPA (TanStack Router uses the history API) instead of closing the app;
  // exit only when there's nowhere left to go back to.
  CapApp.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back()
    } else {
      CapApp.exitApp()
    }
  })
} else {
  // One-time sweep: drop the legacy SW `api-cache` from clients that loaded an
  // older build. Authenticated API responses are no longer cached (NetworkOnly),
  // but stragglers in Cache Storage could still be served by an old SW until it
  // updates. Best-effort, fire-and-forget.
  if (typeof caches !== 'undefined') {
    caches.delete('api-cache').catch(() => {})
  }

  registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (registration) {
        setInterval(() => registration.update(), 60 * 60 * 1000)
      }
    },
    onNeedRefresh() {
      window.location.reload()
    },
  })
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
