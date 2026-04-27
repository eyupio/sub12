import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'SUB12',
        short_name: 'SUB12',
        description: 'Track scores, manage gear, and compete in leagues. The platform for precision airgun shooters.',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
      workbox: {
        // The bundled SPA chunk has crept above the 2 MiB default precache
        // limit as more features land (now ~2.1 MiB). Raise the ceiling so the
        // service worker continues to precache the shell instead of falling
        // back to network-only for the main entry. A code-splitting pass
        // would be a more durable fix.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // Prevent the service worker from serving the SPA shell for
        // backend-generated SEO endpoints (sitemap, robots, IndexNow key files).
        navigateFallbackDenylist: [
          /^\/sitemap\.xml$/,
          /^\/siteindex\.xml$/,
          /^\/robots\.txt$/,
          /^\/[a-fA-F0-9]+\.txt$/,
        ],
        // All authenticated API responses are served NetworkOnly. Caching them
        // by URL is unsafe: cache keys don't include the user identity, so a
        // response fetched by user A could be served to user B on the same
        // browser. Offline GETs of authenticated data are not worth that risk.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/v1/'),
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      // Proxy /api to the Go backend (default PORT=8080 in backend/internal/config).
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      // SEO endpoints served by the backend.
      '/sitemap.xml': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/siteindex.xml': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
