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
        // Brand darks — these drive the install splash and the OS task-switcher
        // chrome, so they have to match --gunmetal rather than a stock slate.
        theme_color: '#0C0C0C',
        background_color: '#0C0C0C',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        categories: ['sports', 'utilities', 'productivity'],
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        // Long-press the installed icon to jump straight into the actions
        // people open the app for.
        shortcuts: [
          { name: 'Quick capture', short_name: 'Capture', url: '/quick-capture' },
          { name: 'Log a score card', short_name: 'New card', url: '/scores/new' },
          { name: 'Leagues', short_name: 'Leagues', url: '/leagues' },
        ],
      },
      workbox: {
        // Route-level lazy loading keeps the main entry below the 2 MiB
        // default Workbox precache ceiling — no override needed.
        // Prevent the service worker from serving the SPA shell for
        // backend-generated SEO endpoints (sitemap, robots, IndexNow key files)
        // and for the demo recordings.
        //
        // /demos/* is a real file on disk, not a router path. Opening one
        // directly — the README links to them, and so does anyone sharing a
        // recording — is a *navigation*, so without this the service worker
        // answers it with index.html and the router, which has no /demos route,
        // renders "Target not found". The file is served correctly by nginx;
        // only visitors who had already loaded the site (and so registered the
        // worker) ever saw the 404.
        navigateFallbackDenylist: [
          /^\/sitemap\.xml$/,
          /^\/siteindex\.xml$/,
          /^\/robots\.txt$/,
          /^\/[a-fA-F0-9]+\.txt$/,
          /^\/demos\//,
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
