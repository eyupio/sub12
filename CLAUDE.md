# CLAUDE.md — sub-12 Project Instructions

## Project Overview

sub-12 is a target shooting companion app (PWA + Capacitor) for logging 25-shot score cards, managing gear (rifles & pellets), running leagues and events, pellet testing with image-based measurement, clubs, achievements, and social features (follows, activity feed, posts, comments). Monorepo with `backend/` (Go) and `frontend/` (React/TypeScript).

`AGENTS.md` is a pointer to this file — this is the single source of truth, so
document a change here (or in the `docs/claude/` file it points to) and nowhere else.

**sub12 is public and AGPL-3.0 licensed.** Two consequences that change how you
work on it:

- Every placeholder in `.env.example` is now public knowledge, so
  `config.Validate()` refuses to boot production with one. See "Placeholder
  credentials are refused" below — that section is the most security-relevant
  thing in this file.
- AGPL section 13 obliges a modified copy run as a network service to offer its
  source to the people using it. The **Source** link in `Layout.tsx`'s footer,
  built from `sourceUrl()` in `utils/site.ts`, is how we discharge that. It is a
  licence obligation, not decoration — don't remove it, and a fork sets
  `VITE_SOURCE_URL` rather than deleting it.

Contributor-facing documentation lives outside this file, because it is written
for people who have not read this one: `README.md` (features, install,
self-hosting), `CONTRIBUTING.md` (setup, review conventions), `SECURITY.md`
(disclosure, what a self-hoster owns, accepted risks), `CODE_OF_CONDUCT.md`,
`CHANGELOG.md`, and `docs/README.md` as the documentation index. Keep them in
step with this file when a convention changes.

## Repository Structure

Layer directories hold one file per domain, named after it (`league.go`,
`leagues.ts`), so the file you want is usually the domain name. Counts below
are orientation, not inventory — don't update them for a single new file.

```
backend/              Go API server
  cmd/api/            Entrypoint (main.go)
  internal/
    api/
      handler/        HTTP handlers, ~45 domains
      middleware/     auth.go (JWT → context), logger.go, ratelimit.go
      router.go       Chi route definitions — the one map of the whole API
    config/           Env-based config (envconfig struct tags) + Validate()
    db/
      db.go           pgxpool connection
      migrate.go      Embedded golang-migrate runner
      migrations/     Sequential SQL migrations (head: `ls` and look at the tail)
      redis.go        Redis client setup
      seed/           Dev seed data (seed.sql + seed.go)
    email/            Email template renderer (renderer.go)
    model/            Domain types, ~36 files. Also holds the pure rules worth
                      unit-testing without a DB (moderator.go, notification.go)
    repository/       Data access layer (pgx queries), ~40 domains
    service/          Business logic layer, ~44 domains
frontend/             React SPA
  src/
    api/              API client modules (typed fetch wrappers per domain)
      client.ts       Base fetch client with Bearer token injection
    catalog/          Static data catalogs (pelletCatalog.ts, rifleCatalog.ts)
    components/       Shared UI components, plus per-feature subfolders
                      (dashboard/, leagues/, wizard/, pelletWizard/, eventWizard/)
    config/           App configuration (targetPresets.ts)
    hooks/            usePullToRefresh, useSmartBack, autosave/measurement hooks
    offline/          scoreOutbox.ts — queued score submissions
    pages/            Route page components, ~88 pages
    store/            Zustand stores (auth, theme, toast, navigation, nativeToken)
    utils/            Ballistics, hole detection, dates, share, push, routing rules
    routeTree.tsx     TanStack Router route tree (rootRoute/authRoute/appRoute)
    router.ts         Router instance
e2e/                  Playwright suite (see E2E_TESTING.md)
docs/                 Long-form design notes
landing/              Static landing page (index.html, robots.txt, sitemap.xml)
brand/                SVG brand assets
scripts/              build-mobile + e2e helpers (.sh and .ps1)
```

`__tests__/` folders sit next to the code they cover (`api/`, `pages/`,
`components/`, `hooks/`, `store/`, `utils/`).

Root also carries the public-project files: `LICENSE` (AGPL-3.0), `README.md`,
`CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `CHANGELOG.md` and
`.editorconfig`, plus `.github/` issue and pull-request templates and
`dependabot.yml`. `.jules/` holds the engineering journals — recurring bug and
vulnerability patterns found in this codebase. Keep one such directory: a second one whose name
differs only by case (`.Jules/`) cannot be checked out on a case-insensitive
filesystem (macOS and Windows by default) and leaves a contributor with a
permanently dirty working tree.

The Go module is `github.com/jnnngs/sub-12/backend`, which no longer matches the
repository at `github.com/eyupio/sub12`. That is a known cosmetic inconsistency,
left alone deliberately: the module is an application rather than a library, so
nothing ever `go get`s that path, and renaming it rewrites the import line of
~157 files for no functional gain. If it is ever renamed, do it as its own commit
and nothing else.

## Tech Stack

- **Backend:** Go 1.26, Chi v5 router, pgx v5, zerolog, envconfig, golang-jwt v5, go-redis v9
- **Database:** PostgreSQL 16, Redis 7
- **Frontend:** React 19, TypeScript 6, Vite 8, TanStack Router + Query, Zustand 4, Tailwind CSS v3, Recharts 3, Lucide React icons
- **Mobile:** Capacitor 6 (PWA-first, via vite-plugin-pwa)
- **Also in the backend:** `fogleman/gg` + `golang.org/x/image` render the `/og/*.png` share cards, `pquerna/otp` backs two-factor auth, `minio-go` ships encrypted database backups to S3-compatible storage, `alicebob/miniredis` fakes Redis in tests
- **Testing:** Go test + testify (backend), Vitest + Testing Library (frontend), Playwright (e2e)
- **CI/CD:** GitHub Actions → GHCR container images (see `docs/claude/ci-pipeline.md`)
- **Migrations:** golang-migrate with embedded SQL files (pgx5 driver)

## Build & Run Commands

### Development

```bash
# Start infra (postgres + redis) via top-level Makefile
make dev                        # docker compose -f docker-compose.dev.yml up -d

# Backend
cd backend && make run          # starts API on :8080
cd backend && make test         # go test -race -count=1 ./...
                                # database-backed tests skip unless DB_HOST is set
cd backend && make lint         # go vet ./...
cd backend && make build        # compiles to bin/api
cd backend && make tidy         # go mod tidy + verify
cd backend && make seed         # load dev seed data (admin accounts, password: password123)

# Frontend
cd frontend && npm run dev      # Vite dev server on :5173
cd frontend && npm run check    # TypeScript type check (tsc -b — see below)
cd frontend && npm run lint     # ESLint
cd frontend && npm test         # Vitest (vitest run)
cd frontend && npm run build    # Production build (tsc -b && vite build)

# Mobile (Capacitor) — wraps the dist/ bundle as native Android/iOS apps.
# Native apps target https://sub12.io/api/v1 (relative /api won't resolve in a
# WebView); see frontend/README.md for prerequisites and the full workflow.
cd frontend && npm run build:mobile   # tsc -b && vite build && cap sync
cd frontend && npm run run:android    # build + launch on emulator/device
cd frontend && npm run run:ios         # macOS + Xcode only

# End-to-end (Playwright) — drives a real browser against a real stack.
./scripts/e2e.sh                # or scripts/e2e.ps1 on Windows; see E2E_TESTING.md
cd e2e && npm test              # once a stack is already up
```

The e2e suite is **not** in the PR gate (`e2e.yml` is manual only), so run it
yourself when changing a flow it covers — score capture, leagues, events, clubs.

`npm run check` is `tsc -b`, not `tsc --noEmit`. The root `tsconfig.json` is a
solution file — `"files": []` plus references to `tsconfig.app.json` and
`tsconfig.node.json` — so a plain `tsc --noEmit` resolves *no* input files and
exits 0 on any codebase, however broken. Only build mode follows the references.

Both `frontend/android/` and `frontend/ios/` are committed (the iOS project was generated with
`npx cap add ios` on a Mac — it can't be created on Linux). The web assets
`cap sync` copies into the native projects are git-ignored (regenerated from
`dist/`). CI builds both: `android.yml` on a Linux runner, `ios.yml` on a
Blacksmith macOS runner.

### Production

```bash
docker compose up -d            # pulls GHCR images: postgres, redis, backend, frontend
docker compose logs backend     # check for migration/startup errors
```

### Top-Level Makefile

```bash
make install   # interactive installer (scripts/install.sh)
make dev       # start infra (postgres + redis) for local dev
make up        # start full stack (infra + backend + frontend containers)
make down      # stop all containers
make logs      # tail all container logs
make build     # build backend binary + frontend bundle
make check     # everything the PR gate runs, both halves
make security  # govulncheck + npm audit, mirroring security.yml
make help      # list targets
```

`scripts/install.sh` is the front door for anyone who did not write this code:
it checks prerequisites, generates real secrets, writes `.env` at mode 600,
prepares `data/backups` with the UID the container needs, runs migrations and
waits for a healthy stack. Three modes — `dev`, `self-host`, `build` — plus
`--check`, `--yes` and `--no-start` for unattended use.

Two invariants it maintains, both of which bite if you edit it:

- **It never rotates a secret already in `.env`.** Rotating `JWT_SECRET` signs
  every user out; rotating `DB_PASSWORD` after Postgres has initialised locks the
  app out of its own database, because Postgres keeps the password it was created
  with and ignores the variable afterwards. `secret_for()` reuses any existing
  non-placeholder value, and `check_postgres_password_matches()` catches the
  leftover-data-directory case before it becomes a confusing migration failure.
- **`is_placeholder()` mirrors `isPlaceholderSecret()` in
  `internal/config/config.go`.** If the two drift, the installer writes a config
  the backend then refuses to boot. Change both together.

### Database Migrations

```bash
cd backend
make migrate-create NAME=add_foo   # creates next sequential migration files
make migrate-up                    # apply pending migrations
make migrate-down                  # rollback last migration
make migrate-lint                  # check for duplicate prefixes
```

`ls backend/internal/db/migrations | tail` is the current head — don't trust a
number written down here. `make migrate-create` picks the next prefix for you.

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

- **Routing:** TanStack Router, one route tree in `routeTree.tsx`. A page goes under `rootRoute`/`authRoute` (public) or `appRoute` (`beforeLoad: requireAuth`) — the choice decides whether it can be indexed, so read "Indexable surface" before adding one
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
- Document the new env var in this file, in `.env.example`, and in `docker-compose.yml`.
- Existing examples to copy: `PasswordResetURL` (used in `backend/internal/service/auth.go` `buildResetLink`), `EventInvitationURL` (used in `backend/internal/service/event_invitation.go`), `DefaultAvatarURL`.

### Placeholder credentials are refused

`config.Validate()` only runs its checks when `ENV=production`, so local
development is unaffected by all of this. In production it reports **every**
problem at once via `errors.Join` — an operator bringing up a new deployment
should get the whole list in one failure, not discover the next one on each
restart after fixing the last.

The check that matters most: **the values in `.env.example` are public.** sub12's
source is open, so a deployment that kept the example `JWT_SECRET` can have a
token minted for any user id with the admin role — no password, no login form, no
rate limiter in the way. That is a complete authentication bypass, and the only
thing standing between a careless `cp .env.example .env` and it is this guard. So:

- `isPlaceholderSecret()` matches the `placeholderSecrets` list as a
  case-insensitive **substring**, so `changeme123` is caught as well as
  `changeme`. Empty counts too. When a new placeholder appears in `.env.example`,
  `docker-compose.yml` or the dev seed, add it to that list rather than writing
  another check — and keep `is_placeholder()` in `scripts/install.sh` in step.
- `JWT_SECRET` must additionally be at least `minSecretLength` (32) characters.
  Length alone is not the test: the `.env.example` value is 47 characters.
- `ADMIN_PASSWORD` is only checked while `SEED_ADMIN` is on, since an empty one
  with seeding off is the normal steady state.
- `CORS_ORIGIN` must not be `*`, empty or localhost. A wildcard is worse than
  useless here — the API sets `Access-Control-Allow-Credentials` so the refresh
  cookie is delivered, browsers refuse `*` on a credentialed request, and every
  user's token refresh would fail with nothing in the logs to explain it.

**`DB_SSLMODE` is the one check with an opt-out, deliberately.**
`postgres:16-alpine` serves no certificate unless one is mounted, and in the
shipped compose topology the database is on a private bridge with no published
port — so requiring TLS there would make the documented deployment fail out of
the box, and every operator would learn to reach for the override, which is
exactly how you train people to ignore it on the deployment where it matters.
Instead, an unencrypted connection is allowed only when
`DB_ALLOW_INSECURE_LOCAL_NETWORK=true` states that the database is not reachable
off-host. `docker-compose.yml` sets it, scoped to the topology it defines;
anything pointing at a managed database has to make that claim knowingly, and it
is grep-able afterwards. The error message names the opt-out, or an operator
running the shipped stack would be stuck with no way forward — a test pins that.

`docker-compose.yml` deliberately has **no `sub12.io` fallback** for
`PASSWORD_RESET_URL` / `EVENT_INVITATION_URL`: a fallback would email a
self-hoster's members password-reset links pointing at sub12.io, an
account-recovery flow silently sending people to somebody else's site.
`SITE_URL` is required and everything else derives from it.

### General

- Don't add features, refactoring, or improvements beyond what is asked
- Don't add comments or docstrings to code you didn't change
- Don't create wrapper functions for one-time operations
- Prefer editing existing files over creating new ones

## API Structure

`backend/internal/api/router.go` is the authoritative map — read it rather than
trusting `docs/claude/api-routes.md`, which is a guide to the parts with rules attached.

Application routes live under `/api/v1/`. The root is not empty, though: it
serves `/healthz` and `/readyz`, the crawler surface (`/sitemap.xml`,
`/siteindex.xml`, the IndexNow `/{key}.txt`), the `ShareMeta` HTML routes
(`/share/…`, `/score-cards/{id}`, `/pellet-tests/{id}` and every
`handler.StaticPages` entry) and the generated preview cards at
`/og/{entity}/{id}.png`. Those root paths are what search engines and link
unfurlers hit, so a change there is governed by "Indexable surface" in `docs/claude/domain-rules.md`.

### Subsystem rules

The long rules live in `docs/claude/`, one file per area, so this file stays an index plus the rules that apply to every change. Read the file for the area you are working in before you change it.

| Section name | File | Read it when |
| --- | --- | --- |
| Share URLs and slugs; A card's context is never final; Naming a picked location; Seasons and rounds are maintained, not just created; Moderator roles; Notifications; Announcements; A deployment owns its own identity; Indexable surface (sitemap, robots.txt, canonicals) | `docs/claude/domain-rules.md` | changing leagues, clubs, events, score cards, notifications, setup or anything a crawler sees |
| Public (no auth); Protected; Admin | `docs/claude/api-routes.md` | adding or changing a route |
| Demo Recordings & Video Guides | `docs/claude/demo-recordings.md` | recording or registering a video |
| Simulation Realism | `docs/claude/simulation-realism.md` | touching the activity simulation |
| Environment Variables | `docs/claude/environment.md` | adding or changing configuration |
| CI Pipeline; Security scanning; CI workflows are a security surface | `docs/claude/ci-pipeline.md` | touching a workflow, `make security` or a vulnerability finding |
| Frontend Design System | `docs/claude/frontend-design-system.md` | styling, motion, overlays or loading states |

## Container Images

- `ghcr.io/eyupio/sub-12-backend:latest`
- `ghcr.io/eyupio/sub-12-frontend:latest`
- `release.yml` publishes to `ghcr.io/${{ github.repository_owner }}/sub-12-*`, so
  a fork's own builds land under its own owner. Set `IMAGE_REPO` in `.env` to run
  them instead of ours
- Tag with `IMAGE_TAG` env var in `docker-compose.yml` for pinned deploys
- Production frontend nginx proxies `/api/` to backend container (no host port exposed for backend)
