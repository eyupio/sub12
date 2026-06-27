# sub-12 frontend

React 18 + TypeScript + Vite SPA. Ships three ways from one codebase:

- **Web / PWA** — built to `dist/`, served by nginx (see `Dockerfile`, `nginx.conf`).
- **Android / iOS** — the same `dist/` bundle wrapped in a native shell by
  [Capacitor 6](https://capacitorjs.com/).

## Web development

```bash
npm install
npm run dev        # Vite dev server on :5173 (proxies /api → :8080)
npm run check      # tsc --noEmit
npm run lint
npm test
npm run build      # tsc -b && vite build → dist/
```

## Mobile (Capacitor)

The native apps load the production build and talk to the live API at
`https://sub12.io/api/v1`. The API host is resolved in `src/api/client.ts`:
`VITE_API_URL` (if set) → `https://sub12.io/api/v1` on native → relative `/api/v1`
on web. Set `VITE_API_URL` at build time to retarget a staging/beta build.

### Prerequisites

- **Android:** Android Studio + Android SDK, JDK 17, and an emulator or a device
  with USB debugging.
- **iOS (macOS only):** Xcode 15+, CocoaPods (`sudo gem install cocoapods`), and a
  simulator or registered device.

### One-time iOS setup

The `android/` project is committed. The `ios/` project must be generated on a Mac
(it can't be created on Linux/CI) and then committed:

```bash
npm run build
npx cap add ios
cd ios/App && pod install
```

### Build & run

```bash
npm run build:mobile     # tsc -b && vite build && cap sync (copies dist into native)
npm run run:android      # build + launch on emulator/device
npm run run:ios          # macOS only
# or open the IDE projects:
npm run open:android     # Android Studio
npm run open:ios         # Xcode
```

`cap sync` regenerates the web assets and config inside `android/` and `ios/`; those
copies are git-ignored (regenerated from `dist/`), so always run `build:mobile`
after pulling.

### App icons & splash screens

Capacitor ships working default icons. To regenerate branded assets from a
1024×1024 source, drop `icon.png` (and an optional `splash.png`) in `assets/` and run:

```bash
npm run cap:assets       # uses @capacitor/assets via npx; needs libvips/sharp
```

### Notes

- **Auth on native:** the `sub12_refresh` cookie is `SameSite=Lax` and is not
  delivered cross-site to `sub12.io` from the WebView, so native builds persist the
  refresh token and pass it explicitly on `/auth/refresh` and `/auth/logout` (the
  backend accepts it as a JSON body fallback). Web/PWA keeps the cookie-only flow.
- **Networking:** `CapacitorHttp`/`CapacitorCookies` are enabled in
  `capacitor.config.ts` so requests go through the native HTTP stack (no browser
  CORS preflight; native cookie handling).
- The Workbox service worker is skipped on native (`main.tsx`) to avoid serving a
  stale app shell after an app update.
