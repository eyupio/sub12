# CI pipeline, security scanning and workflow trust

What each workflow does, how security scanning is split, and why the CI workflows are a security surface. It appends to the root `CLAUDE.md` and never overrides it; sections the text names but that are not here (for example "Placeholder credentials are refused" or "Outgoing public URLs") are in `CLAUDE.md`.

### Security scanning

`make security` is the one command; `.github/workflows/security.yml` is the CI
version, and it runs on a schedule as well as on pull requests because the answer
changes when nothing in the repository does.

- **A stdlib `govulncheck` finding is fixed by raising the `go` directive in
  `backend/go.mod`** to the patch release the report names. CI resolves its
  toolchain from that file (`go-version-file: backend/go.mod`), so that directive
  — not the `golang:` tag in the Dockerfile — is what decides which stdlib the
  shipped binary is built against. A bare `go 1.25` left us on 1.25.0 and 44
  reachable advisories.
- **`npm audit` is split in two.** `--omit=dev` covers what ships to a browser
  and is a hard gate; the full run covers build and test tooling and is
  advisory, with the known exceptions written up in `SECURITY.md`. Don't merge
  the two lists — a vulnerability in Vite's dev server and one in a shipped
  bundle are different problems.

  That split only means anything if `package.json` classifies dependencies
  honestly. `@capacitor/cli` is a `devDependency`, as Capacitor's own install
  instructions have it: the CLI is invoked by the `cap sync` / `cap run` scripts
  at build time and is never imported by the app, so in `dependencies` it would
  drag its `tar` advisory into the runtime half. **A dev-only tool appearing in the runtime audit is a
  misclassification to fix in `package.json`, not a vulnerability to upgrade
  around.**
- `@capacitor/cli` → `tar` (critical) remains a known accepted risk in the
  advisory half: the fix is a Capacitor major that rewrites the native projects
  and needs on-device testing. Dependabot is configured to never propose it
  automatically.
- **Secret scanning runs the gitleaks CLI from its own pinned image, not
  `gitleaks-action`** — the wrapper requires a paid licence for
  organisation-owned repositories and fails hard without one. The tool itself is
  MIT. It scans the whole history, `--redact` so a real finding is not
  re-disclosed into a public Actions log, and confirmed false positives live in
  `.gitleaks.toml` as regexes against the specific construct rather than `paths`
  exclusions that would also hide the next real one.
- **CodeQL and dependency review are gated on
  `github.event.repository.private == false`.** Both are free for public repos
  and need Advanced Security on private ones; while sub12 is private, CodeQL
  analyses successfully and then cannot upload, and dependency review refuses.
  They skip rather than carrying `continue-on-error`, because a job that always
  passes while uploading nothing is the kind of check nobody notices has died.
  `== false` rather than `!private` so an event payload with no repository object
  skips instead of running and failing.

### CI workflows are a security surface

- **`opencode.yml` is gated on `author_association`** (`OWNER`, `MEMBER`,
  `COLLABORATOR`). It fires on `issue_comment`, so without that gate any GitHub
  user could spend `OPENCODE_API_KEY` in a loop and — worse — inject arbitrary
  instructions, since the comment body *is* the agent's prompt. `CONTRIBUTOR` is
  excluded on purpose: one merged PR is a low bar. Keep both halves in a single
  `if` on the job; moving the trust check into a step lets the job start, which is
  already a spend.
- **Never convert a workflow to `pull_request_target`**, and never check out
  `github.event.pull_request.head.sha`. Either runs fork-authored code with
  access to secrets.
- Every workflow declares explicit `permissions`. `contents: write` on
  `android.yml` / `ios.yml` exists only to publish releases; fork pull requests
  get a read-only token from GitHub regardless, so they cannot publish.
- The frontend image builds with `npm ci` from the committed lockfile, not
  `npm install`, so a container build resolves the same tree CI tested.

## CI Pipeline

The GitHub Actions workflows are in `.github/workflows/`. `ci.yml` is the one
that gates a PR; treat the rest as build/publish plumbing (`security.yml` is
described under "Security scanning").

### ci.yml (push/PR to `main`)

1. **Backend:** Migration lint (duplicate check) → `go vet` → `go test -race` → `go build`
   - Runs against a PostgreSQL 16 service container
2. **Frontend:** `npm ci` → type check → lint → test → build
   - Node.js 26
3. **Docker:** Smoke-test image builds for both services (depends on backend + frontend jobs)

### android.yml (PR / push to `main` / tag `v*` / manual)

Builds the Capacitor Android app and publishes the APK for download.

- PRs build a **debug** APK and upload it as a workflow artifact
- Pushes to `main` build a **release** APK and refresh the rolling
  `android-latest` pre-release, giving a stable download URL:
  `https://github.com/<owner>/<repo>/releases/download/android-latest/sub12.apk`
- Tags `v*` attach the APK to that version's GitHub Release
- Signs with the `ANDROID_KEYSTORE_BASE64` / `ANDROID_KEYSTORE_PASSWORD` /
  `ANDROID_KEY_ALIAS` / `ANDROID_KEY_PASSWORD` secrets when configured;
  otherwise falls back to a CI key minted once and reused from the Actions
  cache. The key has to be stable: Android identifies an installed app by
  (package name, signing certificate), so a key that changes between builds
  makes each new APK refuse to install over the last one and the device keeps
  running the build it already has. A cache eviction still rotates it, so the
  release notes carry the signer's SHA-256 fingerprint
- `versionCode` / `versionName` come from `ANDROID_VERSION_CODE` /
  `ANDROID_VERSION_NAME`, read in `frontend/android/app/build.gradle`

### ios.yml (PR / push to `main` / tag `v*` / manual)

Builds the Capacitor iOS app on a Blacksmith **macOS** runner
(`blacksmith-6vcpu-macos-15` — Apple Silicon M4, $0.08/min). macOS 15 rather
than `macos-latest`, because Blacksmith mirrors the GitHub-hosted images and the
15 image ships the Xcode 16 line Capacitor 6 and the iOS 13.0 pod deployment
target are tested against.

`npm ci` → `npm run build` → `npx cap sync ios` → `pod install` → `xcodebuild
archive` → export.

Unlike Android, an unsigned build is **not installable** — Apple requires a paid
Developer Program membership, so the workflow has two modes:

- **Without signing secrets** (the default): archives unsigned and packages the
  `.app` into a `Payload/` zip. This is a compile check — it proves the Xcode
  project, pods and web bundle still build — and it is uploaded as a workflow
  artifact only. Nothing is published to a release, because an unsigned `.ipa`
  behind a download link cannot install.
- **With `IOS_CERTIFICATE_BASE64` / `IOS_CERTIFICATE_PASSWORD` /
  `IOS_PROVISIONING_PROFILE_BASE64`**: imports the identity into a temporary
  keychain, installs the profile, and re-signs via `xcodebuild -exportArchive`.
  Pushes to `main` then refresh the rolling `ios-latest` pre-release
  (`.../releases/download/ios-latest/sub12.ipa`) and tags `v*` attach the `.ipa`
  to that version's Release.

The archive step is deliberately unsigned in both modes: applying manual signing
there would push the app's provisioning profile onto every CocoaPods framework
target, which then fails to match. `exportArchive` re-signs the app and its
embedded frameworks from `ExportOptions.plist`.

Other configuration:

- `IOS_EXPORT_METHOD` repository variable selects the export method
  (`app-store` by default; `ad-hoc` or `development` for direct device installs).
- `APPSTORE_KEY_ID` / `APPSTORE_ISSUER_ID` / `APPSTORE_PRIVATE_KEY` (App Store
  Connect API key) enable a TestFlight upload via `xcrun altool` on pushes when
  the export method is `app-store`.
- `MARKETING_VERSION` comes from the tag (or `0.0.<run_number>`) and
  `CURRENT_PROJECT_VERSION` from the run number, passed as `xcodebuild`
  overrides. `CFBundleShortVersionString` must be a plain dotted number, so the
  Android trick of appending a short SHA isn't available.
- `frontend/ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme` is committed —
  `xcodebuild -scheme App` needs a *shared* scheme, and Xcode only writes a
  per-user one by default.

### release.yml (push to `main`)

- Builds and pushes backend + frontend Docker images to GHCR
- Tags: `sha-<commit>` + `latest`
- Uses Docker Buildx with GitHub Actions cache

### e2e.yml (manual only)

Runs the Playwright suite in `e2e/` against a deployed staging environment. It
is `workflow_dispatch` only and is **not** part of the PR gate, so a change
that breaks a spec will not be caught by CI — run it locally when touching a
flow the suite covers (`E2E_TESTING.md` for the one-command quickstart).

### cleanup-packages.yml (scheduled)

Deletes untagged GHCR package versions left behind by buildx, keeping a recent
buffer. Tagged versions (`latest`, `sha-*`) are never touched.

### opencode.yml (issue / review comment)

Runs the opencode agent when a comment contains ` /oc`. Unrelated to the build.
