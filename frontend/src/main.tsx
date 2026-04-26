import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { initTheme } from './store/theme'
import './index.css'
import 'tippy.js/dist/tippy.css'

// Apply theme before React mounts to prevent FOUC
initTheme()

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
