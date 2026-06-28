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

User-facing share links are built from a canonical public origin
(`src/utils/site.ts`): `VITE_SITE_URL` (if set) → `https://sub12.io` on native →
`window.location.origin` on web. Native must not use the WebView origin
(`capacitor://localhost` / `https://localhost`), or copied/sent links would be
dead outside the app. Set `VITE_SITE_URL` to retarget share links for a
staging/beta build.

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

The Camera plugin needs usage-description strings or iOS crashes the first time a
capture/photo-picker is opened. Add these to `ios/App/App/Info.plist` after
generating the project (Android needs no equivalent — capture goes through the
system camera intent + photo picker, and the `FileProvider` in
`android/app/src/main/AndroidManifest.xml` is already configured):

- `NSCameraUsageDescription` — e.g. "Take photos of your targets and score cards."
- `NSPhotoLibraryUsageDescription` — e.g. "Attach target and score-card photos from your library."
- `NSLocationWhenInUseUsageDescription` — e.g. "Tag your score cards and pellet tests with where you were shooting."

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

Branded source assets live in `assets/` (the SUB12 brass crosshair on gunmetal
`#0C0C0C`, generated from `brand/svg/`):

- `icon-only.png` (1024²) — full-bleed icon for iOS and legacy Android launchers.
- `icon-foreground.png` / `icon-background.png` (1024²) — Android adaptive icon
  layers (transparent reticle over a solid gunmetal field).
- `splash.png` / `splash-dark.png` (2732²) — the primary stacked lockup centred
  on gunmetal.

The committed Android resources under `android/app/src/main/res/` are already
generated from these. To regenerate every density (and iOS, once that project is
added) after editing the sources, run:

```bash
npm run cap:assets       # uses @capacitor/assets via npx; needs libvips/sharp
```

### Deep linking (Universal Links / App Links)

Tapping a `https://sub12.io/...` link opens the installed app instead of the
browser, landing on the matching in-app screen. The in-app routing is handled in
`src/main.tsx` (the `@capacitor/app` `appUrlOpen` listener → `deepLinkToPath` →
router). The OS-level verification needs three things wired up for production:

1. **Association files** (served from the web root, already in `public/.well-known/`):
   - `assetlinks.json` — replace `REPLACE_WITH_RELEASE_SIGNING_SHA256_FINGERPRINT`
     with the release keystore's SHA-256
     (`keytool -list -v -keystore <release.keystore>` → SHA256, or the Play
     Console "App signing" fingerprint).
   - `apple-app-site-association` — replace `REPLACE_WITH_APPLE_TEAM_ID` with the
     Apple Developer Team ID (→ `<TEAMID>.uk.sub12.app`). Served as
     `application/json` with no redirect (see `nginx.conf`).
2. **Android** — `AndroidManifest.xml` already has the `autoVerify` intent-filter
   for `https://sub12.io`. Until `assetlinks.json` carries the real fingerprint,
   Android falls back to opening the link in the browser (no breakage).
3. **iOS** — after `npx cap add ios`, add the Associated Domains capability with
   `applinks:sub12.io` (Xcode → Signing & Capabilities, writes `App.entitlements`).

### Push notifications

The device-registration pipeline is wired end to end: on native the app requests
permission and registers once the user is authenticated (`src/utils/push.ts`),
forwards the token to `POST /devices`, removes it on logout, and routes a tapped
notification to the matching screen. The backend stores tokens (`device_tokens`)
and fans push out from the same path as in-app/email notifications, through a
pluggable `PushSender`.

Delivery is the one part that needs your provider accounts — until then the
backend uses a no-op sender (tokens are stored, nothing is sent) and the app
still builds and runs:

- **Android (FCM)** — add a Firebase project's `google-services.json` to
  `android/app/`, apply the `com.google.gms.google-services` Gradle plugin, and
  provide the backend an FCM-backed `service.PushSender`. Without Firebase the
  app builds but `register()` is a no-op at runtime.
- **iOS (APNs)** — enable the Push Notifications capability and add an APNs key
  in the Apple Developer account; Firebase can bridge APNs→FCM if you want one
  backend transport.
- **Backend** — implement a `service.PushSender` (FCM HTTP v1 / APNs) and swap it
  in for `NewNoopPushSender` in `cmd/api/main.go`.

### Notes

- **Auth on native:** the `sub12_refresh` cookie is `SameSite=Lax` and is not
  delivered cross-site to `sub12.io` from the WebView, so native builds persist the
  refresh token and pass it explicitly on `/auth/refresh` and `/auth/logout` (the
  backend accepts it as a JSON body fallback). Web/PWA keeps the cookie-only flow.
- **Networking:** `CapacitorHttp`/`CapacitorCookies` are enabled in
  `capacitor.config.ts` so requests go through the native HTTP stack (no browser
  CORS preflight; native cookie handling).
- **Sharing:** the share sheet uses the `@capacitor/share` plugin on native
  (Android WebViews don't expose `navigator.share`) and the Web Share API on web,
  behind one helper (`src/utils/share.ts`). Shareable URLs come from the canonical
  host helper (`src/utils/site.ts`) so a link copied or sent from the app resolves
  to `https://sub12.io`, not the local WebView origin.
- **Camera & photos:** target / score-card capture routes through the
  `@capacitor/camera` plugin on native via one helper (`src/utils/imagePicker.ts`),
  so the in-app Camera/Upload buttons open the native camera or photo picker
  instead of a WebView file dialog. Web keeps the `<input type="file">` flow
  unchanged. Wired into the capture surfaces that already had a camera affordance:
  Quick Capture, score entry, score-card detail, pellet-test detail, and the
  pellet-test wizard. iOS needs the `Info.plist` usage strings noted under
  One-time iOS setup.
- **Geolocation:** the "use my location" controls resolve position through the
  `@capacitor/geolocation` plugin on native (`src/utils/geolocation.ts`) and the
  browser API on web. Android location permissions are declared in
  `AndroidManifest.xml`; iOS needs `NSLocationWhenInUseUsageDescription` (see
  One-time iOS setup).
- The Workbox service worker is skipped on native (`main.tsx`) to avoid serving a
  stale app shell after an app update.
