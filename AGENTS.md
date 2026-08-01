# AGENTS.md — sub-12 Project Instructions

## Project Overview

sub-12 is a target shooting companion app (PWA + Capacitor) for logging 25-shot score cards, managing gear (rifles & pellets), running leagues, pellet testing with image-based measurement, clubs, achievements, and social features (follows, activity feed, comments). Monorepo with `backend/` (Go) and `frontend/` (React/TypeScript).

## Repository Structure

```
backend/              Go API server
  cmd/api/            Entrypoint (main.go)
  internal/
    api/
      handler/        HTTP handlers (one file per domain)
      middleware/      Auth (JWT extraction) and request logger
      router.go       Chi route definitions
    config/           Env-based config (envconfig struct tags)
    db/
      db.go           pgxpool connection
      migrate.go      Embedded golang-migrate runner
      migrations/     Sequential SQL migrations (000001–000019)
      redis.go        Redis client setup
      seed/           Dev seed data (seed.sql + seed.go)
    email/            Email template renderer (renderer.go)
    model/            Domain types (15 files: user, score_card, league, club, pellet, rifle, achievement, activity, image, stats, social, smtp, email_template, pellet_testing, admin)
    repository/       Data access layer (pgx queries, one file per domain)
    service/          Business logic layer (one file per domain + auth, email_sender)
frontend/             React SPA
  src/
    api/              API client modules (typed fetch wrappers per domain)
      client.ts       Base fetch client with Bearer token injection
      __tests__/      API module tests
    catalog/          Static data catalogs (pelletCatalog.ts, rifleCatalog.ts)
    components/       Shared UI components (Layout, AuthLayout, ThemeToggle, Toast, ConfirmDialog, ImageMeasurement, etc.)
    config/           App configuration (targetPresets.ts)
    pages/            Route page components (~37 pages)
      __tests__/      Page-level tests
    store/            Zustand stores (auth, theme, toast)
    utils/            Utilities (ballistics, holeDetection, date)
    routeTree.ts      TanStack Router file-based route tree
brand/                SVG brand assets
landing/              Static landing page (index.html + favicon.svg)
```

## Tech Stack

- **Backend:** Go 1.24, Chi v5 router, pgx v5, zerolog, envconfig, golang-jwt v5, go-redis v9
- **Database:** PostgreSQL 16, Redis 7
- **Frontend:** React 18, TypeScript 5.5, Vite 5, TanStack Router + Query, Zustand 4, Tailwind CSS v3, Recharts, Lucide React icons
- **Mobile:** Capacitor 6 (PWA-first, via vite-plugin-pwa)
- **Testing:** Go test + testify (backend), Vitest + Testing Library (frontend)
- **CI/CD:** GitHub Actions (ci.yml + release.yml) → GHCR container images; android.yml + ios.yml build the Capacitor apps
- **Migrations:** golang-migrate with embedded SQL files (pgx5 driver)

## Build & Run Commands

### Development

```bash
# Start infra (postgres + redis) via top-level Makefile
make dev                        # docker compose -f docker-compose.dev.yml up -d

# Backend
cd backend && make run          # starts API on :8080
cd backend && make test         # go test -race -count=1 ./...
cd backend && make lint         # go vet ./...
cd backend && make build        # compiles to bin/api
cd backend && make tidy         # go mod tidy + verify
cd backend && make seed         # load dev seed data (admin accounts, password: password123)

# Frontend
cd frontend && npm run dev      # Vite dev server on :5173
cd frontend && npm run check    # TypeScript type check (tsc --noEmit)
cd frontend && npm run lint     # ESLint
cd frontend && npm test         # Vitest (vitest run)
cd frontend && npm run build    # Production build (tsc -b && vite build)

# Mobile (Capacitor) — wraps the dist/ bundle as native Android/iOS apps.
# Native apps target https://sub12.io/api/v1 (relative /api won't resolve in a
# WebView); see frontend/README.md for prerequisites and the full workflow.
cd frontend && npm run build:mobile   # tsc -b && vite build && cap sync
cd frontend && npm run run:android    # build + launch on emulator/device
cd frontend && npm run run:ios         # macOS + Xcode only
```

Both the `android/` and `ios/` projects are committed (`ios/` was generated with
`npx cap add ios` on a Mac — it can't be created on Linux). The web assets
`cap sync` copies into the native projects are git-ignored (regenerated from
`dist/`). CI builds both: `android.yml` on a Linux runner, `ios.yml` on a
Blacksmith macOS runner.

### Production

```bash
docker compose up -d            # pulls GHCR images, runs all 4 services
docker compose logs backend     # check for migration/startup errors
```

### Top-Level Makefile

```bash
make dev    # start infra (postgres + redis) for local dev
make up     # start full stack (infra + backend + frontend containers)
make down   # stop all containers
make logs   # tail all container logs
make build  # build backend binary + frontend bundle
```

### Database Migrations

```bash
cd backend
make migrate-create NAME=add_foo   # creates next sequential migration files
make migrate-up                    # apply pending migrations
make migrate-down                  # rollback last migration
make migrate-lint                  # check for duplicate prefixes
```

Current migration count: **112** (000001–000112). Latest: `000112_simulation_realism_settings`.

## Critical Migration Rules

**These rules exist because we've had production outages from migration conflicts.**

1. **Always use `make migrate-create`** — never manually create migration files. The Makefile auto-detects the next sequence number.
2. **All DDL must be idempotent:**
   - `CREATE TABLE IF NOT EXISTS` (not `CREATE TABLE`)
   - `CREATE INDEX IF NOT EXISTS` (not `CREATE INDEX`)
   - `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (not `ADD COLUMN`)
   - For `CREATE TYPE`, wrap in a PL/pgSQL block:
     ```sql
     DO $$ BEGIN
         CREATE TYPE my_enum AS ENUM ('a', 'b');
     EXCEPTION WHEN duplicate_object THEN NULL;
     END $$;
     ```
   - For `ADD CONSTRAINT`, wrap similarly with `EXCEPTION WHEN duplicate_object`
   - Use `ON CONFLICT ... DO NOTHING` for seed INSERTs
3. **Never reuse a migration number.** CI will reject duplicate prefixes.
4. **One concern per migration.** Don't mix unrelated schema changes.
5. **Every `.up.sql` must have a matching `.down.sql`** that fully reverses it.

## Code Conventions

### Backend (Go)

- **Architecture:** Handler → Service → Repository (strict layer separation)
- **Error handling:** Return errors up the stack; handlers write HTTP responses, services return domain errors
- **Logging:** Use `zerolog` structured logging; don't use `fmt.Printf` or `log.Printf`
- **Config:** All config via environment variables through `envconfig` struct tags
- **SQL:** Use `pgx` with parameterized queries (`$1`, `$2`). Never build SQL with string concatenation
- **Auth middleware:** `middleware.Authenticate(auth)` extracts user ID/role into context; use `middleware.UserIDFromContext(ctx)` and `middleware.UserRoleFromContext(ctx)` to read them
- **Admin middleware:** `middleware.RequireAdmin` gates admin-only routes
- **Tests:** Use `testify` assertions. Test files go next to the code they test (e.g. `handler/health_test.go`, `service/score_card_test.go`)
- **Handler pattern:** One file per domain in `internal/api/handler/`. Constructor: `NewXxx(service)` returns handler struct. Methods are HTTP handler funcs.
- **Repository pattern:** One file per domain in `internal/repository/`. Direct pgx queries, no ORM.
- **Service pattern:** One file per domain in `internal/service/`. Business logic between handlers and repositories.

### Frontend (TypeScript/React)

- **Routing:** TanStack Router with file-based route tree (`routeTree.ts`)
- **Data fetching:** TanStack Query — define queries/mutations in `src/api/` modules (one per domain)
- **State:** Zustand stores in `src/store/` (auth persisted to localStorage, theme, toast)
- **Styling:** Tailwind CSS utility classes; dark mode via `ThemeToggle` and `theme` store
- **API client:** `src/api/client.ts` auto-injects Bearer token from auth store
- **Components:** Shared components in `src/components/`, page components in `src/pages/`
- **Icons:** Lucide React (`lucide-react`)
- **Charts:** Recharts (`recharts`)
- **Static data:** Pellet and rifle catalogs in `src/catalog/`, target presets in `src/config/`

### Outgoing public URLs

Any link sent to a user via email, push, or other out-of-band channel **must** be built from a config field. Never hard-code a host, and never let one default to `localhost` in production.

- Add new such config to `backend/internal/config/config.go` with an empty default.
- Derive it from `SITE_URL` in `applyDerivedDefaults()` when the specific env var is unset, so a single `SITE_URL` change rolls out to every link type.
- Add the new field name to the `Validate()` localhost guard so production refuses to boot with a localhost link.
- Document the new env var in this file (and `CLAUDE.md`), in `.env.example`, and in `docker-compose.yml`.
- Existing examples to copy: `PasswordResetURL` (used in `backend/internal/service/auth.go` `buildResetLink`), `EventInvitationURL` (used in `backend/internal/service/event_invitation.go`).

### General

- Don't add features, refactoring, or improvements beyond what is asked
- Don't add comments or docstrings to code you didn't change
- Don't create wrapper functions for one-time operations
- Prefer editing existing files over creating new ones

## API Structure

All API routes under `/api/v1/`. Health probes at root (`/healthz`, `/readyz`).

### Public (no auth)

- `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`
- `POST /auth/forgot-password`, `POST /auth/reset-password`
- `GET /images/{id}`
- `GET /leagues`, `GET /leagues/{id}`
- `GET /clubs`, `GET /clubs/{id}`, `GET /clubs/{id}/standings`, `GET /clubs/{id}/opening-hours`, `GET /clubs/disciplines`
  - The club directory accepts `?q=` (name, town, region or postcode), `?discipline=`, and `?lat=&lng=[&radius_km=]` to return `distance_km` and sort nearest-first. `?code=` still resolves a single club by join code and ignores the other filters.
- `GET /score-cards/{id}/comments`
- `GET /pellet-tests/public-leaderboard`

### Protected (requires `Authorization: Bearer <jwt>`)

- **Score cards:** CRUD + image upload + comments (write)
- **Rifles:** CRUD + image upload + showcase (`GET /rifles/{id}/showcase`)
- **Pellets:** CRUD + image upload + showcase (`GET /pellets/{id}/showcase`)
- **Gear comparison:** `PATCH /users/me/gear-comparison` opts every owned rifle and pellet in or out at once. Per-item control is the `comparison_opt_in` field on the rifle/pellet PATCH. A showcase bundles the owner's own stats, trends, distributions and pairings with an anonymised cross-user comparison for the same make/model — built only from opted-in items owned by non-private profiles, and suppressed entirely below `model.GearMinComparisonOwners` (3) contributing owners.
- **Pellet tests:** CRUD + groups + images + measurements + detections + export + leaderboard + stats + compare + timeline + confidence + batch-report + combo-analytics
- **Leagues:** Create, join, standings, scores, score counts, config, members (incl. promote/demote admin), seasons, rounds, join requests, score verification (confirm/amend/reject/reopen + audit trail)
- **Clubs:** Create, update, delete (club admins, not just platform admins), join, members, image upload, opening hours (`PUT /clubs/{id}/opening-hours` replaces the published week). The club profile carries a real-world identity — postal address, map pin, website/email/phone, disciplines, distances, facilities, membership and visitor info, founding year — surfaced as the About panel on the club page and editable from club settings. Text profile fields follow an "omit to keep, empty string to clear" convention; arrays clear with `[]`; coordinates clear only via `clear_coordinates`. Disciplines are validated against `model.ClubDisciplines`.
- **Feature board:** `GET /feature-requests` (recent) and `/feature-requests/ranking` (most-voted) list the ideas visible to the viewer — platform ideas for everyone, league/club ideas for members of that league or club. `POST /feature-requests/{id}/vote` toggles the viewer's upvote, `/comments` carries the discussion, and `GET /feature-requests/{id}/events` returns the request's history (created, status, priority and owner changes). Rows come back enriched with requester, owner, scope *name* and vote/comment counts so the board never renders a raw ID. New ideas are not created here: the board's composer opens a `feature`-category support ticket, which an admin refines onto the board via `POST /admin/tickets/{id}/feature-request`. Admins set `status` and `priority` with `PATCH /admin/feature-requests/{id}`; both changes are recorded in the history. The UI collapses the eight statuses into five stages (under review, planned, in progress, shipped, not planned) defined once in `frontend/src/utils/featureBoard.ts`.
- **Users:** Update profile, avatar upload, email change, view profiles
- **Social:** Follow/unfollow users
- **Activity:** `GET /feed`
- **Achievements:** List own + list for user
- **Stats:** User stats, rifle stats, score trends
- **Images:** Upload

### Admin (requires `middleware.RequireAdmin`)

- **Email:** SMTP settings (get/patch/test), email templates (list/get/patch/preview)
- **Users:** List, get, update role, delete
- **Gear analytics:** Site-wide gear stats (`/admin/gear/stats`), a paginated/sortable gear-model leaderboard (`/admin/gear/models?kind=rifle|pellet`), and a per-model drill-down with owners and trend (`/admin/gear/model?kind=&make=&model=`). Admin views cover the whole estate — unlike the user-facing showcase they ignore `comparison_opt_in`, and report opt-in rates instead.
- **Leagues:** List, get, update, delete, members management
- **Clubs:** List (private clubs included), get, update, delete, members management

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `DB_PASSWORD` | PostgreSQL password |
| `JWT_SECRET` | JWT signing secret |

### Optional (with defaults)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | API server port |
| `ENV` | `development` | Environment (development/production/test) |
| `DB_HOST` | `localhost` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_NAME` | `sub12` | Database name |
| `DB_USER` | `sub12` | Database user |
| `DB_SSLMODE` | `disable` | libpq TLS mode; set to `require` (or `verify-full`) in production |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection URL |
| `JWT_EXPIRY_HOURS` | `24` | JWT token expiry in hours |
| `PASSWORD_RESET_TTL_MINUTES` | `60` | Password reset token TTL |
| `SITE_URL` | `https://sub12.io` | Canonical public host. `PASSWORD_RESET_URL` and `EVENT_INVITATION_URL` are derived from this when unset. Override to `http://localhost:5173` in dev so emailed links open the local Vite server. |
| `PASSWORD_RESET_URL` | *(derived from `SITE_URL`)* | Frontend password reset page URL. Production must not contain `localhost` — the backend refuses to start if it does. |
| `EVENT_INVITATION_URL` | *(derived from `SITE_URL`)* | Base URL for event invitation accept pages; token is appended as `/{token}`. Production must not contain `localhost`. |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed CORS origin |
| `SEED_ADMIN` | `false` | Auto-seed admin user on startup |
| `ADMIN_PASSWORD` | *(empty)* | Password for seeded admin user |

## CI Pipeline

Four GitHub Actions workflows:

### ci.yml (push/PR to `main`)

1. **Backend:** Migration lint (duplicate check) → `go vet` → `go test -race` → `go build`
   - Runs against a PostgreSQL 16 service container
2. **Frontend:** `npm ci` → type check → lint → test → build
   - Node.js 20
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
  `ANDROID_VERSION_NAME`, read in `android/app/build.gradle`

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
- `ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme` is committed —
  `xcodebuild -scheme App` needs a *shared* scheme, and Xcode only writes a
  per-user one by default.

### release.yml (push to `main`)

- Builds and pushes backend + frontend Docker images to GHCR
- Tags: `sha-<commit>` + `latest`
- Uses Docker Buildx with GitHub Actions cache

## Frontend Design System

Shared visual and motion vocabulary lives in `frontend/src/index.css`. Prefer
these over ad-hoc Tailwind so surfaces stay consistent.

- **Motion tokens** — `--dur-instant/fast/base/slow` and `--ease-out`,
  `--ease-in-out`, `--ease-spring`. A global `prefers-reduced-motion` guard
  collapses every animation and transition.
- **Elevation** — `--shadow-sm/md/lg/xl`, `--shadow-gold`, plus the
  `.shadow-card`, `.shadow-float`, `.shadow-overlay`, `.shadow-gold` utilities.
- **Entrance animations** — `.animate-fade-in`, `.animate-fade-in-up`,
  `.animate-scale-in` (modals), `.animate-sheet-up` (bottom sheets),
  `.animate-pop` (value changes), `.u-stagger` (sequenced list children).
- **Interaction utilities** — `.u-lift` (cards that link somewhere), `.u-press`
  (buttons and icon controls), `.u-nudge` (nav and list rows), `.u-sheen`
  (primary CTAs), `.u-hairline`, `.u-tnum`, `.u-text-gold-gradient`.
- **Touch targets** — on `pointer: coarse` every button gets `min-height: 40px`.
  A control whose drawn size *is* the design (a pill switch, a round icon badge
  over an image) must carry `.tap-target`, or that floor stretches the circle
  into an ellipse; the class keeps the box and moves the 40px touch area onto a
  centred pseudo-element. `.no-min-target` opts out with no replacement area.
- **Component classes** — `.btn` + `.btn-primary/secondary/ghost/danger` +
  `.btn-sm/lg`, `.field`, `.surface-card`, `.skeleton`, `.spinner`,
  `.skip-link`, `.app-tab` (mobile bottom-nav dot/pill markers).
- **Loading states** — use `src/components/Skeleton.tsx` (`Skeleton`,
  `SkeletonText`, `SkeletonCard`, `SkeletonList`, `SkeletonTable`,
  `SkeletonStats`, `SkeletonPage`, `Spinner`) or `LoadingRows` from
  `src/components/leagues` inside a `<Section>`. Don't ship a bare "Loading…"
  string — it collapses the layout and reflows when data lands.
- **Native-only rules** — `.native-app` selectors in the base layer disable
  long-press callouts, chrome text selection, and overscroll bounce inside the
  Capacitor WebView. Add `.selectable` to opt real content back in.
- **Refreshing** — `Layout` owns the app's only reload affordances: pull down on
  the page scroller (`usePullToRefresh`, touch only) or tap the SUB12 lockup.
  Both refetch active TanStack queries rather than reloading the WebView, which
  would reset the router. Android targets SDK 35, so `android/app/src/main/
  res/values-v35/styles.xml` opts out of Android 15's forced edge-to-edge — the
  WebView never reports system-bar insets to `env(safe-area-inset-*)`, so the
  app shell would otherwise draw under the status and gesture bars.

- **Scrolling** — the document is the app's only scroller. The shell is
  `min-h-screen`, a floor rather than a height, so `<main>` always grows to its
  content and can never scroll itself. Do not give it (or any full-page wrapper)
  an `overflow` value: that makes it a scroll container which can never scroll,
  and an `overscroll-behavior` of `contain`/`none` on such a dead container
  stops touch gestures inside it chaining out to the document — the page then
  will not scroll at all on a phone. Native pull-to-refresh/bounce is suppressed
  on `body` (which propagates to the viewport) instead.

## Container Images

- `ghcr.io/jnnngs/sub-12-backend:latest`
- `ghcr.io/jnnngs/sub-12-frontend:latest`
- Tag with `IMAGE_TAG` env var in `docker-compose.yml` for pinned deploys
- Production frontend nginx proxies `/api/` to backend container (no host port exposed for backend)
