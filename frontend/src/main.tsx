import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { registerSW } from 'virtual:pwa-register'
import { Capacitor } from '@capacitor/core'
import { App as CapApp } from '@capacitor/app'
import { SplashScreen } from '@capacitor/splash-screen'
import { StatusBar, Style } from '@capacitor/status-bar'
import App from './App'
import { router } from './router'
import { useAuthStore } from './store/auth'
import { loadStoredRefreshToken } from './store/nativeToken'
import { initTheme } from './store/theme'
import { deepLinkToPath } from './utils/deepLink'
import { initPushNotifications, teardownPushNotifications } from './utils/push'
import './index.css'
import 'tippy.js/dist/tippy.css'

// Apply theme before React mounts to prevent FOUC
initTheme()

function setupNative() {
  // Marks the document as running inside the native shell. Safe-area insets are
  // applied globally via the `html` padding rule in index.css (env() is 0 on web
  // without insets), so this is a hook for any future native-only styling.
  document.documentElement.classList.add('native-app')

  // Inside a native WebView the Workbox service worker is redundant (assets ship
  // inside the app) and can serve a stale app shell after an update, so we skip
  // registration entirely. Splash dismissal and status-bar styling are native-only.
  SplashScreen.hide().catch(() => {})
  StatusBar.setStyle({ style: Style.Dark }).catch(() => {})
  StatusBar.setBackgroundColor({ color: '#0C0C0C' }).catch(() => {})

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

  // Universal Links (iOS) / App Links (Android): when the OS hands a
  // https://sub12.io/... link to the app, route the SPA to the matching in-app
  // path via the router's own history.
  let lastDeepLink: string | null = null
  const openDeepLink = (url: string | undefined) => {
    if (!url || url === lastDeepLink) return
    lastDeepLink = url
    const path = deepLinkToPath(url)
    if (path) router.history.push(path)
  }
  // Warm starts: the OS delivers the link to this listener.
  CapApp.addListener('appUrlOpen', ({ url }) => openDeepLink(url))
  // Cold starts: the launch URL is often delivered before any JS listener is
  // attached, so addListener alone silently drops it. Read the launch URL
  // explicitly; the lastDeepLink guard keeps it from double-navigating if the
  // listener does also fire.
  CapApp.getLaunchUrl().then((res) => openDeepLink(res?.url)).catch(() => {})

  // Push notifications: register the device once the user is authenticated (the
  // token POST requires auth) and tear down on logout.
  let pushAuthed = !!useAuthStore.getState().user
  if (pushAuthed) void initPushNotifications()
  useAuthStore.subscribe((state) => {
    const authed = !!state.user
    if (authed && !pushAuthed) void initPushNotifications()
    else if (!authed && pushAuthed) void teardownPushNotifications()
    pushAuthed = authed
  })
}

function setupWeb() {
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

async function bootstrap() {
  if (Capacitor.isNativePlatform()) {
    // Seed the in-memory refresh token from native device storage before the app
    // makes any authed request or push registration runs. The user record is
    // already rehydrated synchronously by the persist store from localStorage.
    const token = await loadStoredRefreshToken()
    if (token) useAuthStore.setState({ refreshToken: token })
    setupNative()
  } else {
    setupWeb()
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </StrictMode>,
  )
}

void bootstrap()
