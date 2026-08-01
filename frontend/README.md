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

Both the `android/` and `ios/` projects are committed, so there is nothing to
generate — clone, `npm ci`, `npm run build`, then `cd ios/App && pod install`.
The `ios/` project was originally created on a Mac with `npx cap add ios` (it
can't be created on Linux/CI); the notes below record what had to be added
by hand afterwards.

`ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme` is committed too.
`xcodebuild -scheme App` in CI needs a *shared* scheme, and Xcode writes only a
per-user one (under the git-ignored `xcuserdata/`) by default.

The Camera plugin needs usage-description strings or iOS crashes the first time a
capture/photo-picker is opened. These are in `ios/App/App/Info.plist`
(Android needs no equivalent — capture goes through the
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

### Build output locations

**Android** — Gradle writes the APK to:
```
android/app/build/outputs/apk/debug/app-debug.apk       # debug (run:android)
android/app/build/outputs/apk/release/app-release.apk   # signed release
android/app/build/outputs/apk/release/app-release-unsigned.apk  # unsigned release
```

**iOS** — Xcode archives to the default Xcode Organizer location (`~/Library/Developer/Xcode/Archives`). For simulator/device runs, the `.app` bundle is written to the Derived Data folder (`~/Library/Developer/Xcode/DerivedData/<project>/Build/Products/`). Export a distributable `.ipa` via Xcode → Product → Archive → Distribute App.

### CI builds

`.github/workflows/android.yml` builds the APK on a Linux runner and
`.github/workflows/ios.yml` builds the `.ipa` on a Blacksmith macOS runner
(`blacksmith-6vcpu-macos-15`, Apple Silicon M4). Both run on PRs touching
`frontend/**`, on pushes to `main`, and on `v*` tags.

The two are not equivalent, because Apple's rules differ from Android's. An APK
is installable however it is signed, so CI mints its own key when no release
keystore is configured — reused from the Actions cache across runs, so builds
stay upgradeable — and every build is downloadable. An `.ipa` will not
install unless it is signed by a paid Apple Developer Program account against a
provisioning profile that names the target device. So `ios.yml` defaults to a
compile check — it archives unsigned, packages the `.app` into a `Payload/` zip,
and uploads that as a workflow artifact without publishing a release.

To get installable builds out of CI, set these repository secrets:

| Secret | Contents |
|---|---|
| `IOS_CERTIFICATE_BASE64` | base64 of the signing certificate `.p12` (Apple Distribution, or Apple Development for a `development` export) |
| `IOS_CERTIFICATE_PASSWORD` | the `.p12` export password |
| `IOS_PROVISIONING_PROFILE_BASE64` | base64 of the matching `.mobileprovision` |

With those present the workflow imports the identity into a temporary keychain,
installs the profile, re-signs through `xcodebuild -exportArchive`, refreshes the
rolling `ios-latest` pre-release on `main`, and attaches the `.ipa` to `v*`
releases. Set the `IOS_EXPORT_METHOD` repository variable to `ad-hoc` or
`development` for direct device installs; it defaults to `app-store`. Adding the
App Store Connect API key (`APPSTORE_KEY_ID`, `APPSTORE_ISSUER_ID`,
`APPSTORE_PRIVATE_KEY` — the `.p8` contents) also uploads each push to
TestFlight, which is the practical way to hand builds to testers who aren't on
the profile's device list.

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

The backend FCM transport (HTTP v1) is implemented — it just needs credentials.
Until they're provided the backend uses a no-op sender (tokens are stored,
nothing is sent) and the apps still build and run:

- **Backend (FCM)** — set `FCM_CREDENTIALS_JSON` to a Firebase service-account
  JSON. The `service.PushSender` (`internal/service/push_fcm.go`) is selected
  automatically in `cmd/api/main.go` when the var is set; otherwise the no-op
  sender is used.
- **Android (FCM)** — add the matching Firebase project's `google-services.json`
  to `android/app/` and apply the `com.google.gms.google-services` Gradle plugin.
  Without it the app builds but `register()` is a no-op at runtime.
- **iOS (APNs)** — enable the Push Notifications capability and add an APNs key in
  the Apple Developer account; Firebase bridges APNs→FCM so the same backend
  transport covers both platforms.

### Pre-submission checklist

The committed projects build and run, but a store submission needs the
deploy-time identifiers and signing material that don't live in git. Work through
these before uploading to App Store Connect / Play Console.

**iOS (App Store)**

- [x] Camera / photo-library / location usage strings in `ios/App/App/Info.plist`
  (`NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`,
  `NSPhotoLibraryAddUsageDescription`, `NSLocationWhenInUseUsageDescription`) —
  required, and the app crashes on first capture without them.
- [ ] Set the signing team and a distribution certificate/provisioning profile in
  Xcode → Signing & Capabilities (`DEVELOPMENT_TEAM` is unset in the committed
  project).
- [ ] Add the **Associated Domains** capability (`applinks:sub12.io`) for
  Universal Links, and the **Push Notifications** capability for APNs.
- [ ] Replace `REPLACE_WITH_APPLE_TEAM_ID` in
  `public/.well-known/apple-app-site-association` with the real Apple Team ID and
  deploy the web root.
- [ ] Bump `MARKETING_VERSION` (and `CURRENT_PROJECT_VERSION` per build) for each
  release.

**Android (Play Store)**

- [x] `compileSdk`/`targetSdk` set to **35** (Android 15) in `variables.gradle` —
  Play requires API 35 for new submissions. Verify the Gradle build locally; if
  AGP complains about the SDK level, bump `com.android.tools.build:gradle` to
  8.6.0+ (`android/build.gradle`) and the Gradle wrapper to 8.7+.
- [ ] Generate a release keystore and add `android/keystore.properties`
  (`storeFile`, `storePassword`, `keyAlias`, `keyPassword`) — the release
  `signingConfig` falls back to the debug key until this exists, which Play will
  reject.
- [ ] Replace `REPLACE_WITH_RELEASE_SIGNING_SHA256_FINGERPRINT` in
  `public/.well-known/assetlinks.json` with the release (or Play App Signing)
  SHA-256, and deploy the web root, to enable verified App Links.
- [ ] Add `android/app/google-services.json` (and set `VITE_FCM_ENABLED=true` at
  build time) to turn on push; without it the app builds and runs with push
  disabled.
- [ ] Bump `versionCode` (and `versionName`) in `android/app/build.gradle` for
  each upload — Play rejects a duplicate `versionCode`.

**Both stores**

- [ ] Build with the production API/host defaults (`VITE_API_URL` →
  `https://sub12.io/api/v1`, `VITE_SITE_URL` → `https://sub12.io`) — these are the
  native defaults, so just don't override them for a release build.
- [ ] Privacy policy and terms are served at `/app/privacy` and `/app/terms`
  (linked from the landing page) — supply those URLs in the store listings and
  fill in the App Privacy / Data Safety questionnaires.
- [ ] Prepare store-listing assets: app name (SUB12), description, keywords,
  screenshots per required device size, and the 1024² icon (sourced from
  `assets/icon-only.png`).

### Notes

- **Auth on native:** the `sub12_refresh` cookie is `SameSite=Lax` and is not
  delivered cross-site to `sub12.io` from the WebView, so native builds persist the
  refresh token and pass it explicitly on `/auth/refresh` and `/auth/logout` (the
  backend accepts it as a JSON body fallback). Web/PWA keeps the cookie-only flow.
  The native token is stored in device storage (`@capacitor/preferences`,
  `src/store/nativeToken.ts`) rather than the WebView's localStorage, and loaded
  into the auth store at startup (`main.tsx`); only the user record is persisted to
  localStorage. For at-rest encryption a Keychain/Keystore plugin can be layered
  in later behind the same module.
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
