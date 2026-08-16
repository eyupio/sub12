# Mobile Store Readiness — App Store & Google Play

Review of the Capacitor apps (`frontend/android`, `frontend/ios`) against what
Apple and Google actually check at submission. Nothing in this file has been
changed in the apps themselves — it is the punch list.

State at review: web bundle builds clean (`tsc --noEmit` + `vite build` both
pass), both native projects are committed, both CI workflows produce artifacts.

---

## Already handled

Worth recording, because these are the items that most commonly bounce a first
submission and they are all in place:

| Requirement | Where it lives |
|---|---|
| In-app account deletion (Apple 5.1.1(v), Play data-deletion policy) | `DELETE /users/me` → `uh.DeleteMe`; Profile → "Delete account" |
| Data export | `POST /users/me/export` |
| UGC report / block / moderation queue (Apple 1.2) | `components/ReportDialog.tsx`, `repository/block.go`, `repository/report.go`, `pages/AdminReportsQueue.tsx` |
| Privacy policy, terms, cookie policy reachable **without** an account | `/privacy`, `/terms`, `/cookies` hang off `rootRoute`, not `appRoute`; linked from the login screen footer |
| No third-party social login, so Sign in with Apple (4.8) is not triggered | `pages/Login.tsx` — email/password only |
| No payments or IAP, so 3.1.1 is not triggered | no Stripe/PayPal/subscription code |
| Native capability beyond a web wrapper (Apple 4.2 minimum functionality) | camera, geolocation, haptics, share, deep links, hardware back button, splash |
| iOS app icon: 1024×1024, RGB, **no alpha channel** (alpha is an automatic rejection) | `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` |
| Purpose strings for camera, photo library, photo-add and location | `ios/App/App/Info.plist` |
| App Transport Security clean — no `NSAppTransportSecurity` exceptions, all traffic to `https://sub12.io` | `Info.plist`, `api/client.ts` |
| Android adaptive icon (foreground + background + round) at every density | `android/app/src/main/res/mipmap-*` |

---

## Blockers

### 1. Play requires an AAB; CI only builds an APK

`.github/workflows/android.yml` runs `assembleRelease` and publishes
`sub12.apk`. Google Play has required the Android App Bundle for new apps since
August 2021 — an APK upload is rejected at the Play Console.

The sideload channel (`android-latest`) is still worth keeping, so the fix is
additive: also run `bundleRelease` and publish
`app/build/outputs/bundle/release/app-release.aab`.

### 2. Release signing silently falls back to a debug keystore

`android/app/build.gradle`:

```groovy
release {
    def propsFile = rootProject.file('keystore.properties')
    if (propsFile.exists()) { ...real key... }
    else { storeFile file(System.getProperty("user.home") + "/.android/debug.keystore") ... }
}
```

A missing `keystore.properties` produces a **debug-signed release build**. Play
rejects that outright ("You uploaded an APK/AAB signed with a debug
certificate"). The CI fallback key (`CN=SUB12 CI`, restored from an Actions
cache) is equally unsuitable — it is documented as testing-only and a cache
eviction rotates it.

Before submitting: generate a real upload key, store it as
`ANDROID_KEYSTORE_BASE64` / `ANDROID_KEYSTORE_PASSWORD` / `ANDROID_KEY_ALIAS` /
`ANDROID_KEY_PASSWORD`, back it up off-CI, and enrol in Play App Signing. The
build should **fail** rather than fall back when signing a store artifact.

### 3. iOS has no entitlements file at all

There is no `App.entitlements` anywhere in `ios/`, so neither capability is
declared:

- **Associated Domains** (`applinks:sub12.io`) — without it, iOS Universal Links
  do not work. `frontend/public/.well-known/apple-app-site-association` is
  served (nginx has an explicit `location =` block for it) and `main.tsx` wires
  up `appUrlOpen` / `getLaunchUrl`, but iOS will never hand the app a
  `https://sub12.io/...` link. The whole deep-link path is dead on iOS today.
- **Push Notifications** (`aps-environment`) — see §7.

Note that `.github/workflows/ios.yml` archives with `CODE_SIGN_ENTITLEMENTS=""`
and re-signs in `exportArchive`. That is correct today (nothing to sign) but
must be revisited the moment an entitlements file exists, or you get an app that
installs and has no capabilities.

### 4. Deep-link association files still hold placeholders

```
public/.well-known/apple-app-site-association → "REPLACE_WITH_APPLE_TEAM_ID.uk.sub12.app"
public/.well-known/assetlinks.json           → "REPLACE_WITH_RELEASE_SIGNING_SHA256_FINGERPRINT"
```

`AndroidManifest.xml` sets `android:autoVerify="true"` on the `https://sub12.io`
intent filter, so App Links verification will fail and every link falls back to
the browser.

The Android fingerprint must be the certificate **Play** signs with (Play App
Signing → App signing key certificate), not the upload key — using the upload
key's fingerprint is the classic mistake here.

### 5. Version numbers are not submittable as-is

| | Non-tag build | Needed |
|---|---|---|
| iOS `MARKETING_VERSION` | `0.0.<run_number>` | `1.0.0` |
| Android `versionName` | `0.0.<run>-<sha>` | `1.0.0` |
| Android `versionCode` | `github.run_number` | monotonic forever after first upload |

Only a `v*` tag produces a real version, so the submission build has to come
from a `v1.0.0` tag on both workflows. Also confirm `github.run_number` is
already ahead of anything sideloaded — Play never lets `versionCode` go
backwards.

---

## Apple review risk

### 6. Export-compliance and device-capability keys in `Info.plist`

- **`ITSAppUsesNonExemptEncryption` is missing.** Every TestFlight and App Store
  build will stall on the export-compliance question until it is answered by
  hand. The app is HTTPS-only, which is exempt, so `<false/>` is the right value
  and removes the manual step.
- **`UIRequiredDeviceCapabilities` is `armv7`** — Capacitor's stale scaffold
  default. It is 32-bit, and every device that can run the iOS 13.0 deployment
  target is arm64. Should be `arm64`.

### 7. No `PrivacyInfo.xcprivacy` in the App target

Only two privacy manifests exist across the whole install:

```
node_modules/@capacitor/ios/Capacitor/Capacitor/PrivacyInfo.xcprivacy
node_modules/@capacitor/ios/CapacitorCordova/CapacitorCordova/PrivacyInfo.xcprivacy
```

None of `@capacitor/preferences`, `camera`, `geolocation`,
`push-notifications`, `share`, `splash-screen`, `status-bar` or `keyboard` ship
one at these versions, and the App target has none. `CapacitorPreferences`
writes through `UserDefaults` (`PreferencesPlugin.swift`), which is a
required-reason API (`CA92.1`), and file-timestamp APIs are reachable through
the camera path.

Expect `ITMS-91053: Missing API declaration` from App Store Connect on upload.
Add an app-level `PrivacyInfo.xcprivacy` declaring the required-reason API uses
and the collected data types.

### 8. The app is submitted as Universal — decide deliberately

`TARGETED_DEVICE_FAMILY = "1,2"` and `UISupportedInterfaceOrientations~ipad`
allows all four orientations. That means:

- iPad review — the reviewer runs it on an iPad, including Split View at ⅓
  width.
- 13" iPad screenshots become mandatory in App Store Connect.

If the layout has not been exercised on iPad, setting the family to `"1"`
(iPhone only) for v1 removes an entire review surface. iPhone also currently
allows landscape (`UISupportedInterfaceOrientations` includes both landscape
orientations) — worth confirming the score-card grid and image-measurement
screens hold up rotated.

### 9. Submission metadata that App Review will block on

- **Demo account.** The app is login-gated behind `requireAuth`, so Apple 2.1
  requires working credentials in the App Review Information field. Seed a real
  account with score cards, a rifle, a pellet and some league data — an empty
  account reads as a broken app.
- **Review notes.** State plainly that this is a scorekeeping app for
  sub-12 ft·lb airguns (target shooting), that no firearms, ammunition or
  accessories are sold or linked, and that the pellet catalog is reference data.
  Both stores have weapons-related policies and the app name and imagery will
  draw the question.
- **Age rating.** Answer the questionnaires honestly on weapons references. Play
  runs the IARC questionnaire; expect Teen/PEGI 12 territory.
- **Play "Dangerous products" policy** prohibits facilitating the sale of
  ammunition. The pellet catalog carries no purchase or affiliate links today
  (verified) — keep it that way.

---

## Push notifications are dead in both store builds

Not a submission blocker, but it should be a deliberate decision rather than a
discovery after launch.

1. **The feature is compiled off.** `initPushNotifications()` returns early
   unless `VITE_FCM_ENABLED === 'true'`, and neither `android.yml` nor `ios.yml`
   sets it. No `google-services.json` or `GoogleService-Info.plist` is committed
   either. The user-facing `NotificationSettings` page only offers in-app and
   email toggles, so nothing is falsely advertised.
2. **iOS push would not work even if enabled.** The backend sends exclusively
   over FCM HTTP v1 (`service/push_fcm.go`). On iOS,
   `@capacitor/push-notifications` registers against APNs and returns an **APNs
   device token**, which FCM will not accept as a registration token. Making
   iOS push work needs either the Firebase iOS SDK in the app (to exchange the
   APNs token for an FCM token) or an APNs sender on the backend — plus the
   `aps-environment` entitlement from §3 and a Push Notifications key in the
   Apple Developer portal.
3. **Android still pays for it.** `capacitor-push-notifications` pulls
   `com.google.firebase:firebase-messaging:23.3.1` and merges a
   `MessagingService` into the release manifest regardless of the JS flag.
   Recent firebase-messaging manifests also contribute a `POST_NOTIFICATIONS`
   declaration — check the merged manifest, because a notifications permission
   on the store listing for a feature that is switched off is a bad look.

Either wire push up end-to-end before launch, or drop
`@capacitor/push-notifications` from the v1 bundle and re-add it when the
transport is ready.

---

## Android platform notes

### targetSdk 36 is due in a month, and it breaks the current safe-area fix

`variables.gradle` pins `targetSdkVersion = 35`. Play's API-level requirement
moves to API 36 on 31 August 2026 for new apps and updates.

That bump is not mechanical here.
`android/app/src/main/res/values-v35/styles.xml` opts out of forced
edge-to-edge with `android:windowOptOutEdgeToEdgeEnforcement`, which is what
keeps the sticky top bar off the status bar and the bottom nav off the gesture
bar. Android 16 removes that opt-out for apps targeting API 36 — the WebView
still does not report system-bar insets to `env(safe-area-inset-*)`, so the
layout regression the workaround was written for comes back.

Doing this properly means feeding the real insets from `MainActivity` into CSS
custom properties (or adopting a Capacitor plugin that does). Worth starting
before the deadline rather than under it.

### Auto-backup copies the refresh token to Google Drive

`AndroidManifest.xml` sets `android:allowBackup="true"` with no
`android:dataExtractionRules` or `android:fullBackupContent`. Google auto-backup
therefore includes the WebView's localStorage (the persisted auth store and user
record) and Capacitor Preferences (the native refresh token, per
`store/nativeToken.ts`).

Not a policy violation, but a refresh token in a user's cloud backup is worth a
decision: either `allowBackup="false"` or extraction rules that exclude the
Preferences file and WebView storage.

### Minor

- `minifyEnabled false` on release — no R8, larger download. Fine to ship, worth
  enabling once you have a crash-reporting symbol upload path.
- `minSdkVersion 22` is fine and costs nothing.

---

## Pre-submission checklist

**Android**
- [ ] Generate and back up a real upload keystore; set the `ANDROID_KEYSTORE_*` secrets
- [ ] Make the release signing config fail rather than fall back to debug
- [ ] Build and publish an `.aab` (`bundleRelease`) alongside the sideload APK
- [ ] Fill `assetlinks.json` with the Play App Signing SHA-256, redeploy, verify with the App Links tester
- [ ] Confirm `versionCode` starts ahead of every sideloaded build
- [ ] Complete the Data safety form and supply an account-deletion URL
- [ ] Plan the API 36 / edge-to-edge work before 31 Aug 2026

**iOS**
- [ ] Add `App.entitlements` with `com.apple.developer.associated-domains` = `applinks:sub12.io`
- [ ] Fill the AASA `appID` with the real Team ID, redeploy, validate
- [ ] Add `ITSAppUsesNonExemptEncryption = false`
- [ ] Change `UIRequiredDeviceCapabilities` to `arm64`
- [ ] Add an app-level `PrivacyInfo.xcprivacy`
- [ ] Decide iPhone-only vs Universal; produce the matching screenshot sets
- [ ] Verify landscape and (if Universal) iPad + Split View layouts
- [ ] Tag `v1.0.0` so `MARKETING_VERSION` is a real version
- [ ] Provide App Review demo credentials against a populated account

**Both**
- [ ] Decide: ship push, or drop the plugin for v1
- [ ] Privacy nutrition labels / Data safety: email, name, photos, precise location, user content
- [ ] App preview videos: portrait (390×844) demo recordings already exist at
      `frontend/public/demos/showcase-score-card-mobile.webm` and
      `…/showcase-pellet-testing-mobile.webm` (re-record with
      `./scripts/record-demos.sh` — see docs/demo-recordings.md, "Portrait
      variants"). Store uploads need them transcoded to the stores' mp4/mov
      specs; the webm is the source of truth.
- [ ] Support URL, marketing URL, privacy policy URL (`https://sub12.io/privacy` is live and public)
- [ ] Review notes covering the airgun/target-shooting context
