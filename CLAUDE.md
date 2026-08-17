# CLAUDE.md — sub-12 Project Instructions

## Project Overview

sub-12 is a target shooting companion app (PWA + Capacitor) for logging 25-shot score cards, managing gear (rifles & pellets), running leagues and events, pellet testing with image-based measurement, clubs, achievements, and social features (follows, activity feed, posts, comments). Monorepo with `backend/` (Go) and `frontend/` (React/TypeScript).

`AGENTS.md` is a pointer to this file — this is the single source of truth, so
document a change here and nowhere else.

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
      migrations/     Sequential SQL migrations (000001–000121)
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
vulnerability patterns found in this codebase. There used to be a second
`.Jules/` alongside it; they were merged, because a case-insensitive filesystem
(macOS and Windows by default) cannot check out both and leaves a contributor
with a permanently dirty working tree. Don't reintroduce a name that differs from
an existing one only by case.

The Go module is `github.com/jnnngs/sub-12/backend`, which no longer matches the
repository at `github.com/eyupio/sub12`. That is a known cosmetic inconsistency,
left alone deliberately: the module is an application rather than a library, so
nothing ever `go get`s that path, and renaming it rewrites the import line of
~157 files for no functional gain. If it is ever renamed, do it as its own commit
and nothing else.

## Tech Stack

- **Backend:** Go 1.25, Chi v5 router, pgx v5, zerolog, envconfig, golang-jwt v5, go-redis v9
- **Database:** PostgreSQL 16, Redis 7
- **Frontend:** React 18, TypeScript 5.5, Vite 5, TanStack Router + Query, Zustand 4, Tailwind CSS v3, Recharts 3, Lucide React icons
- **Mobile:** Capacitor 6 (PWA-first, via vite-plugin-pwa)
- **Also in the backend:** `fogleman/gg` + `golang.org/x/image` render the `/og/*.png` share cards, `pquerna/otp` backs two-factor auth, `minio-go` ships encrypted database backups to S3-compatible storage, `alicebob/miniredis` fakes Redis in tests
- **Testing:** Go test + testify (backend), Vitest + Testing Library (frontend), Playwright (e2e)
- **CI/CD:** GitHub Actions → GHCR container images (see CI Pipeline below)
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
exits 0 on any codebase, however broken. It type-checked nothing for as long as
it was the CI step. Only build mode follows the references.

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
`PASSWORD_RESET_URL` / `EVENT_INVITATION_URL`. It used to, which meant a
self-hoster who set `SITE_URL` to their own domain still emailed their members
password-reset links pointing at sub12.io — an account-recovery flow silently
sending people to somebody else's site. `SITE_URL` is required and everything
else derives from it.

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
  honestly. `@capacitor/cli` sat in `dependencies` and dragged a critical `tar`
  advisory into the runtime half, where it did not belong: the CLI is invoked by
  the `cap sync` / `cap run` scripts at build time and is never imported by the
  app. It is a `devDependency` now, which is also what Capacitor's own install
  instructions use. **A dev-only tool appearing in the runtime audit is a
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

### General

- Don't add features, refactoring, or improvements beyond what is asked
- Don't add comments or docstrings to code you didn't change
- Don't create wrapper functions for one-time operations
- Prefer editing existing files over creating new ones

## API Structure

`backend/internal/api/router.go` is the authoritative map — read it rather than
trusting the summary below, which is a guide to the parts with rules attached.

Application routes live under `/api/v1/`. The root is not empty, though: it
serves `/healthz` and `/readyz`, the crawler surface (`/sitemap.xml`,
`/siteindex.xml`, the IndexNow `/{key}.txt`), the `ShareMeta` HTML routes
(`/share/…`, `/score-cards/{id}`, `/pellet-tests/{id}` and every
`handler.StaticPages` entry) and the generated preview cards at
`/og/{entity}/{id}.png`. Those root paths are what search engines and link
unfurlers hit, so a change there is governed by "Indexable surface" below.

### Share URLs and slugs

Users, leagues and clubs carry a `slug` derived from their name, used in public
share URLs (`/share/users/paul-jennings`). Score cards and pellet tests have no
stable name and keep their UUID.

- `share_slug_aliases` maps every slug ever issued to its entity. Its primary
  key is the single uniqueness constraint, so a renamed entity's old slug keeps
  resolving and is never handed to something else.
- Repository `GetByID` / `GetPublicProfile` accept either spelling via
  `resolveEntityRef`, so pre-existing UUID links keep working everywhere.
- Slugs are claimed in `repository/share_slug.go` on create and re-derived on
  rename. `ShareMeta` points `og:url` and `rel=canonical` at the slug form even
  when the visitor arrived on the UUID one.
- In-app routes still expect UUIDs — `SharedView` resolves a slug before
  redirecting a signed-in user, since the detail pages pass the route param
  straight to endpoints that don't resolve slugs.

### A card's context is never final

A score card is a personal card, a league entry or a club card, and the answer
given at quick capture must stay changeable — a card captured against the wrong
league, or one whose round filled up, is moved rather than re-shot. The same
`CardContextPicker` therefore appears in quick capture, the refine form
(`ScoreEntry`) and the card's own edit mode (`ScoreCardDetail`).

- **Leaving** a league is a `PATCH` with `league_round_id: ""`; leaving a club
  is `club_id: ""`. Both follow the "omit to keep, empty string to clear"
  convention.
- **Joining or moving** is always `POST /score-cards/{id}/submit-to-league`,
  which is where league membership, the per-round submission cap and the
  league's image rule are enforced. `PATCH` refuses a round the card is not
  already in so those checks can't be bypassed. Submitting to the round the
  card already sits in is a no-op, not an error.
- A **draft** can be pointed at a round: that is how the refine flow moves a
  quick-capture card into a league. The cap and image rules are graduation's
  job, so a full round never refuses a draft — it just can't graduate there.
- A card that **moves between rounds** arrives with no history: the previous
  league's confirmations, community-review request and `score_card_actions`
  audit trail are cleared in the same transaction, and verification restarts.
- **Events** follow the same pattern: `POST /score-cards/{id}/submit-to-event`
  (body `event_slug`) attaches a personal card to the caller's own entry in a
  live card-submission event — enforcing the one-finalised-card-per-entry rule
  and the event's image rule — and `PATCH` with `event_participant_id: ""`
  withdraws it again. A league card must be detached before an event can claim
  it, and vice versa; a card never sits in both.
- **Locked** cards (verified or rejected under `lock_edits_after_verification`)
  refuse both the detach and the move, the same as any other edit.
- `frontend/src/utils/cardContext.ts` (`contextChangePlan`) is the single place
  that decides what to send; both call sites just render its plan.

### Naming a picked location

A location the user picks must read as a place, not a grid reference. The rule
lives in `frontend/src/api/geo.ts` (`nameForPick`) and applies everywhere a
point is captured — quick capture, score entry, the pellet-test wizard, the map
picker, the "save this as a new place" dialog, and the recent-location chips:

1. a saved place within `NEARBY_PLACE_THRESHOLD_M` (150m) wins, by name;
2. then whatever the user typed;
3. then the reverse geocoder's name for the spot;
4. and only then `53.862, -1.958`.

A row labelled `53.862, -1.958` but stored with no `location_lat`/`location_lng`
still knows where it was: `coordsForLabel` reads the point back out of the label
(three decimals, ~110m — inside the radius at which we'd call two points the
same place). Without that, such a row matches no saved place and is never sent
to the geocoder, so its recent-location chip stays a grid reference forever and
seeds the next card with no coordinates either.

`GET /api/v1/geo/reverse?lat=&lng=` fronts a Nominatim-compatible endpoint
(`GEOCODE_URL`; empty disables the lookup). It caches hits *and* misses in Redis
under coordinates rounded to three decimals (~110m), paces upstream calls to the
one per second Nominatim's usage policy allows, and reports every failure as
"nowhere named here" (204) — a flaky third party must never block saving a card,
it just means the coordinates stand.

### Seasons and rounds are maintained, not just created

A league's calendar is edited far more often than it is written: a round runs
long, a season is named wrong, an admin adds one twice. Everything under
`manage_seasons` is therefore full CRUD — `POST`, `PATCH` and `DELETE` on
`/leagues/{id}/seasons/{seasonId}` and `.../rounds/{roundId}` — and the same
capability gates all of it, so a moderator who can open a round can also fix
one. The lazily created "General" season and its "Submissions" round are
ordinary rows and are editable like any other.

- **Patches follow the "omit to keep, empty string to clear" convention.**
  Clearing a round's `opens_at`/`closes_at` returns it to permanently open;
  clearing a season's `ends_on` makes it open-ended. `name` and `starts_on` are
  `NOT NULL`, so an empty string there is refused rather than treated as a
  clear. The settings form sends only the fields the admin actually changed —
  a stored timestamp it failed to render must never come back as a clear.
- **Archiving is what retires a season that has been shot.** `is_active` is a
  switch on the season, and `GetOrCreateDefaultRound` skips archived seasons
  entirely rather than merely ranking them last: a retired season that kept
  collecting cards would make the switch meaningless. A league whose every
  season is archived is bootstrapped afresh, exactly as a brand-new one is.
- **Deleting is refused once anybody has shot it.** `score_cards
  .league_round_id` is `ON DELETE SET NULL`, so a delete that went through
  would leave the cards and silently strip them out of the standings. A season
  or round with cards in it returns 409 and points the admin at archiving (or
  closing the round), which takes it out of use without detaching anything.
- **A season or round of another league is reported as missing**, not
  forbidden: the caller is a moderator here, and a stranger's calendar is not
  theirs to know about. `RoundBelongsToLeague` is the round-side mirror of
  `SeasonBelongsToLeague` and exists for that reason.

### Moderator roles

Members a league or club **owner** promotes to help run it are **moderators**,
never "admins" — `admin` is the platform-wide `users.role`, and a moderator's
reach stops at the one league or club they were promoted in.

- **Owner** is `leagues.created_by` / `clubs.created_by`. They hold every
  capability implicitly, are never gated by the grant column, and their own role
  cannot be edited or demoted. Deleting a club is owner-only and never
  delegated.
- **Capabilities** live in `model/moderator.go`
  (`LeagueModeratorPermissions` / `ClubModeratorPermissions`) and are stored per
  membership row in `league_members.moderator_permissions` /
  `club_members.moderator_permissions`. Adding one means adding a catalogue
  entry and gating the call site — the settings UI renders whatever the backend
  serves, so no frontend change is needed.
- **Resolution** goes through `GetMemberRole` on the league/club repository,
  which returns `model.MemberRole` (`is_member`, `is_moderator`, `is_owner`,
  effective `permissions`). Services gate with `require(ctx, id, userID, perm)`;
  `requireForScoreCard` does the same for actions addressed by card. A stranger
  or missing entity resolves to the zero role rather than an error.
- **A club's authority reaches its leagues.** `manage_leagues` is creating *and
  running* the club's leagues, so `LeagueRepository.GetMemberRole` folds the
  hosting club's standing in: the club's owner, and a club moderator granted
  `manage_leagues`, resolve as league moderators holding the whole league
  catalogue, with no `league_members` row of their own. Without it a club owner
  could not open the next round of a league one of their moderators created.
  `is_member` stays false for them — running a league is not entering it — so
  anything gated on the *members list* rather than on the role (the settings
  page, the settings gear on the league page) must read `GetMemberRole`.
- **Errors** distinguish the two refusals: `ErrNotAdmin` / `ErrClubNotAdmin`
  ("you don't run this") from `ErrNotPermitted` / `ErrClubNotPermitted` ("the
  owner didn't delegate this"). The latter wrap the former, so every handler
  branch that already returned 403 keeps doing so.
- **Promotion** grants the catalogue's `Default` set — the day-to-day duties,
  never `manage_moderators` or `manage_settings`. For a league that includes
  `manage_seasons`: opening the next round is the week-to-week work of running
  one, and a moderator who cannot do it has to fetch the owner every week.
  Demotion clears the grant, so a re-promotion never resurrects an old one. A
  moderator holding `manage_moderators` can only delegate capabilities they
  hold themselves.
- **Wire compatibility:** `is_admin` is still emitted and still accepted
  alongside `is_moderator`, so a Capacitor app running an older bundle keeps
  working. Member listings redact `permissions` for viewers who don't help run
  the group.
- **A control the viewer's grant doesn't cover is drawn read-only, with the
  reason.** Reaching the settings page means being a moderator; it does not
  mean holding every capability on it, and each section saves through a
  different one — `manage_settings` for the league record (name, description,
  privacy, image, join code, scoring config, regional defaults),
  `manage_seasons` for the calendar, `manage_members` for the roster and the
  join-request queue, `manage_moderators` for roles. Gating the page as a
  whole and rendering every section live is what produced the original
  complaint: the forms accepted input and each save came back "Failed to save
  league" with nothing to explain it. `LeagueSettings.tsx` passes each section
  the capability its own endpoint checks; the fields stay visible (a moderator
  may need to read them), the submit disappears, and `CapabilityNote` says
  which permission is missing and who grants it.

### Notifications

Every notification is one row per recipient, written by
`NotificationService.Fanout` and delivered in-app, by push, and by email —
each gated by the recipient's own preference. Fan-out is best-effort: it never
returns an error and must never be able to fail the action that caused it.

Adding a type means touching all of these, and the two per-type tests in
`model/notification_test.go` will fail until you do:

1. a `NotificationTypeX` constant, the two preference fields (`X` and
   `XEmail`), the defaults, both `…ForType` switches and the PATCH input, in
   `model/notification.go`;
2. two `BOOLEAN NOT NULL DEFAULT` columns in a new migration, whose defaults
   match `DefaultNotificationPreferences`;
3. the SELECT/Scan, the patch application and the upsert's column, `$n`, arg
   and `DO UPDATE SET` lists in `repository/notification.go` — all four are
   positional, so append to each in the same order;
4. subject and body in `notificationEmailContent`, which serves the email *and*
   the push title/body;
5. the union, the two preference interfaces in `api/notifications.ts`, the
   sentence and link in `utils/notificationRouting.ts`, the icon in
   `pages/Notifications.tsx` and the row in
   `components/NotificationPreferencesPanel.tsx` — the one place preferences are
   drawn, rendered by both the profile's Notifications tab and
   `pages/NotificationSettings.tsx`. A row goes in `NOTIFICATION_PREF_GROUPS`
   and its switch carries `data-pref="<key>"`; its test *renders* the panel and
   asserts every preference the API serves is drawn, and that nothing else calls
   the preferences endpoints. Both halves matter because a missing row fails
   silently — the toggle is simply absent — and a catalogue entry that is never
   mapped over satisfies a source scan while leaving the user no switch at all.

Conventions worth keeping:

- **Email defaults track reach.** A type addressed to one person defaults to
  email on; one broadcast to every member, participant or follower defaults to
  email off (`score_validation_requested`, `league_round_opened`,
  `event_participant_joined`, `event_went_live`, `event_results_posted`).
  In-app always defaults on.
- **A type with its own email template is listed in
  `hasDedicatedEmailTemplate`**, or the recipient gets two emails. The support
  ticket types and `event_invitation` are there; the invitation's own send
  applies the same preference, so the toggle still means something.
- **Name the group in `Metadata`** (`league_name`, `club_name`, `event_name`,
  and `event_slug` for the link) rather than making the reader open the
  notification to find out which league it was about. Both the server copy and
  `notificationRouting.ts` fall back to a generic phrase when it's missing.
- **Moderator fan-out includes the owner.** `ListAdminIDs` returns
  `is_admin` rows only; the owner holds every capability implicitly and has to
  be added from `created_by`. Always drop the actor from the recipient set.
- **Validation requests go to whoever can act.** A league card notifies the
  league's moderators and owner, an event card its owner and delegated
  scorers, and a personal community review the shooter's followers (capped at
  `reviewRequestFanoutLimit`). The recipient rules live in
  `ScoreCardService.validationRequestPlan`, split from the fan-out so they're
  testable without a database.
- **Volunteers widen that audience, never replace it.** The three
  `review_requests_*` preferences are how somebody asks to be sent other
  shooters' cards: `public` adds them to any *public* personal card's request,
  `leagues` to cards in leagues they're in, and `club_leagues` to cards in
  leagues run under a club they're in, whether or not they're in the league.
  All three default off and each pool is separately capped at
  `reviewVolunteerLimit` and randomised — being asked is a favour, and asking
  the same first N every time burns them out. A *followers-only* card stays
  with the followers: a validation request must never be the thing that widens
  who can see a card.

### Announcements

An announcement is a human-authored message broadcast to a group's whole
audience. The delivered copies are ordinary `announcement` notification rows;
the `announcements` table is the one stored original they point at.

- **Who may send** is the scope: platform → `middleware.RequireAdmin`; league
  and club → the owner or a moderator granted `PermSendAnnouncements`, which
  is deliberately *not* in the default promotion grant; event → its owner, since
  an event has no capability catalogue and a delegated scorer is trusted with
  cards, not the megaphone. A platform admin does not thereby become a league's
  moderator — the scopes don't nest.
- **Who receives** it: every live non-simulated account, the league's members,
  the club's members, or everyone entered in the event. The sender is always
  excluded, and `recipient_count` is recorded at send time — it is the reach of
  the message, not a live membership count.
- **Delivery is bulk.** `NotificationService.FanoutAnnouncement` returns
  immediately and works on a background context: the in-app preference is
  applied inside a single `INSERT … SELECT FROM unnest(…)`, push tokens are
  fetched for the whole delivered set at once, and only the SMTP sends are per
  person. Blocks and mutes don't apply — an announcement comes from a group you
  joined, not a person you chose to hear from.
- **Email is opted into twice**: by the sender per announcement (`send_email`,
  default off) and by the recipient (`announcement_email`, default on). The
  in-app copy always goes.
- **Reading one** is gated on having been sent it — `HasNotificationForTarget`
  — so somebody who left the club can still open the message they were given,
  and somebody who joined later can't read backwards through the archive. The
  per-scope *log* is gated on membership instead, since it's the sender's view.

### A deployment owns its own identity

`site_settings` is a singleton row (id = 1, the same shape as `smtp_settings`)
holding what *this installation* is: its name, tagline, logo, accent colours,
boot theme, welcome copy, whether registration is open, and whether it presents
as a community or as one club's own site. The first-run wizard at `/setup`
writes it; `pages/AdminBranding.tsx` edits it afterwards.

- **The wizard is once-only, and the backend is what enforces that.**
  `POST /api/v1/setup` is unauthenticated by necessity — a fresh install has
  nobody to authenticate as — so the guard has to hold against a caller who
  never loads the page. `SiteSettingsService.CompleteSetup` checks
  `UserRepository.AdminExists`, then *claims* the deployment with a conditional
  `UPDATE … WHERE setup_completed_at IS NULL` that exactly one concurrent
  caller can win, and only the winner creates an account. A claim that then
  fails (a duplicate email, most likely) is released, or a mistyped address
  would brick the wizard with no account to log in with. The endpoint is
  rate-limited under the `auth` bucket alongside the other credential paths.
- **Setup returns no tokens.** The wizard signs in through the ordinary
  `POST /auth/login` with the credentials it just set, so the refresh cookie,
  the rate limiter and the 2FA path are the ones every later session uses.
- **Migration 000123 stamps an existing deployment as complete** if the `users`
  table has anything in it. Without that, upgrading drops a running site onto a
  setup screen. `scripts/install.sh` now defaults to *not* seeding an admin from
  `.env`, because seeding one is precisely what closes the wizard.
- **`ENV`-level config is unaffected.** Branding is per-deployment data, not
  configuration: there is no env var for it, and nothing in `config.Validate()`
  reads it.
- **An accent is a hex colour or nothing.** `model.NormaliseAccent` is a strict
  `#rgb`/`#rrggbb` parser because the value is interpolated into a CSS custom
  property — arbitrary text there is a declaration injected into every page.
  `utils/branding.ts` derives the whole gold family from it (`--gold-2`,
  `--gold-tint`, `--ring`, `--brass-dim`, `--shadow-gold`, `--grid`), because
  those tokens are rgba() literals of the original hue in `index.css` and a bare
  `--gold` override leaves them behind as stripes of brass.
- **Single-club mode needs a club.** Both the wizard and the admin patch refuse
  the mode without one, since the nav entry and the directory redirect both
  point at it. The club is an ordinary club owned by the administrator the
  wizard created — nothing about it is special except that `site_settings`
  points at it.
- **`public_registration` is enforced in the router**, not just in the UI.
  `SiteSettingsHandler.RegistrationGate` wraps `POST /auth/register`, because
  an invite-only club's setting has to hold against a direct POST — hiding the
  link is presentation. A settings read that fails allows the sign-up: a
  transient database fault must not lock out registration site-wide, and the
  path immediately behind the gate needs the same database anyway.
- **The attribution is not a setting.** `PublicSiteSettings.Upstream` is stamped
  by `SiteSettings.ToPublic` from constants in `model/site_setting.go`, so no
  stored value can remove it, and `components/PoweredBy.tsx` is the single place
  it is rendered — bundled with the AGPL section 13 **Source** link, because
  three obligations kept in three places is how one of them goes missing.
  Tests on both sides pin it. A self-hoster brands the door; the plaque stays.

### Indexable surface (sitemap, robots.txt, canonicals)

Only two kinds of URL are fit to submit to a search engine: a page an
anonymous visitor can load, and one robots.txt allows. Getting this wrong is
silent — nothing fails, the pages just never appear in search — so treat these
as invariants and lean on the tests that pin them.

- **What may go in the sitemap.** `service/sitemap.go` lists fixed pages that
  are children of `rootRoute`/`authRoute` in `frontend/src/routeTree.tsx`, plus
  entity URLs at their public `/share/…` form. Never list an `appRoute` child:
  `beforeLoad: requireAuth` redirects a crawler to `/login`, which Search
  Console reports as a soft 404. That rules out `/leagues`, `/clubs`,
  `/events`, `/help`, `/support` and `/feature-requests`, and the in-app
  `/users/{id}`, `/leagues/{id}`, `/clubs/{id}` routes — the last of which is
  also disallowed in robots.txt and produced a "Blocked by robots.txt" report.
- **Keep the two files in step.** `frontend/public/robots.txt` and the sitemap
  are edited independently, so `service/sitemap_test.go` parses the shipped
  robots.txt and asserts every generated URL is crawlable — and that the
  authed routes stay blocked. `landing/robots.txt` is a byte-identical copy.
- **Canonicals.** The SPA shell hard-codes one `<title>`, description and
  `rel=canonical` pointing at the site root, so any page served straight from
  nginx declares itself a duplicate of the homepage. Fixed public pages are
  therefore routed through `ShareMeta.StaticPage` (`handler.StaticPages`) to
  get their own metadata. Adding one means adding it to *both* that table and
  the matching `location ~ ^/(…)$` block in `frontend/nginx.conf` — a test
  cross-checks the two, because missing the nginx half fails silently. `/` is
  deliberately excluded: nginx serves it from the bundle, whose baked-in tags
  are already the homepage's own.
- **Who is eligible.** Simulated personas (`is_simulated`) and private
  profiles are excluded. The `Count*` queries must mirror the `List*` ones or
  the admin Sitemap & SEO page reports a sitemap that was never served.
- `lastmod` tracks `updated_at`, not `created_at` — reporting a creation date
  on a league whose standings move weekly tells crawlers to stop coming back.
- **A page the backend can't build must still open.** `ShareMeta` composes its
  response by fetching the frontend container's `index.html` over the internal
  network (`FRONTEND_ORIGIN`); with no bundle it has nothing to serve, and the
  embedded `share_meta_fallback.html` holding page cannot boot the app. So the
  fallback goes out as **503**, and every location in `frontend/nginx.conf`
  that proxies HTML to the backend carries `proxy_intercept_errors on` plus
  `error_page 502 503 504 = @spa_shell`, which serves the bundled
  `index.html` from disk at 200. The visitor gets the working app; only the
  per-entity preview metadata is lost, and no human ever sees that. Both
  halves are pinned by tests — a 200 on the fallback, or a proxied location
  without the `error_page`, puts people back on a dead page that reloading
  cannot leave. The same rule keeps the holding page **script-free**: it is
  served under `script-src 'self'`, which blocks inline scripts and `onclick`
  handlers alike, so anything it promises to do by itself will silently not
  happen.

### Public (no auth)

- `POST /auth/register`, `POST /auth/login`, `POST /auth/login/2fa`, `POST /auth/refresh`, `POST /auth/logout`
- `POST /auth/forgot-password`, `POST /auth/reset-password`
  - Every password-bearing endpoint above is rate-limited per IP (`rl.Limit("auth")`). `refresh` and `logout` are deliberately unbounded, so ordinary token refresh from a shared IP is never throttled by somebody else's login attempts.
- `GET /site/settings` — this deployment's branding, fetched by every visitor before the shell paints. `GET /setup/status` and `POST /setup` are the once-only first-run wizard (`setup` is rate-limited under the `auth` bucket) — see "A deployment owns its own identity"
- `GET /images/{id}`
- `GET /faqs`, `GET /faqs/{slug}`
- `GET /leagues`, `GET /leagues/{id}`
- `GET /clubs`, `GET /clubs/{id}`, `GET /clubs/{id}/standings`, `GET /clubs/{id}/opening-hours`, `GET /clubs/disciplines`
  - The club directory accepts `?q=` (name, town, region or postcode), `?discipline=`, and `?lat=&lng=[&radius_km=]` to return `distance_km` and sort nearest-first. `?code=` still resolves a single club by join code and ignores the other filters.
- `GET /score-cards/{id}/comments`
- `GET /pellet-tests/public-leaderboard`

### Protected (requires `Authorization: Bearer <jwt>`)

- **Score cards:** CRUD + image upload + comments (write) + community review (`/score-cards/{id}/review-request` + `/confirm`): the owner of a public/followers personal card opens a peer-review request (drafts, private and league cards are refused); any non-owner can confirm, and at the request's `required_confirmations` the request flips to verified (guarded so racing confirms emit one event), notifying the owner. Feed activities inherit the card's visibility, and each one links to `/scores/{id}/review` — a page carrying the review progress, the reviewers who confirmed, the confirm/cancel action and the card's comments (`components/ScoreCardComments.tsx`, shared with the card detail page). Cancelling discards gathered confirmations and removes the feed post; submitting the card to a league clears both. `PATCH /score-cards/{id}` takes `league_round_id` on the "omit to keep, empty string to clear" convention: clearing it detaches the card from its round and keeps it as a personal one, which is how a shooter rescues a card whose round is full. A non-empty value must name the round the card already sits in, and `club_id` follows the same convention — joining or moving between rounds stays with `submit-to-league`, which runs the membership and cap checks (see "A card's context is never final"). The refine flow can also save a draft without graduating it, so a card with nowhere to go yet stays editable in Drafts.
- **Gallery:** `GET /users/me/gallery` lists every uploaded photo the caller
  owns — score cards (with league/club/event submission context resolved to
  names), rifles, pellets and pellet-test images — newest first. The
  `/gallery` page renders it with a top-shots showcase, kind/submission
  filters, and submit-to-league / submit-to-event / withdraw actions.
- **Rifles:** CRUD + image upload + showcase (`GET /rifles/{id}/showcase`)
- **Pellets:** CRUD + image upload + showcase (`GET /pellets/{id}/showcase`)
- **Gear comparison:** `PATCH /users/me/gear-comparison` opts every owned rifle and pellet in or out at once. Per-item control is the `comparison_opt_in` field on the rifle/pellet PATCH. A showcase bundles the owner's own stats, trends, distributions and pairings with an anonymised cross-user comparison for the same make/model — built only from opted-in items owned by non-private profiles, and suppressed entirely below `model.GearMinComparisonOwners` (3) contributing owners.
- **Pellet tests:** CRUD + groups + images + measurements + detections + export + leaderboard + stats + compare + timeline + confidence + batch-report + combo-analytics
- **Leagues:** Create, join, standings, scores, score counts, config, members (incl. promote/demote moderators and re-grant their capabilities), seasons and rounds (create, rename, re-date, archive/restore and delete — see "Seasons and rounds are maintained, not just created" above), join requests, score verification (member confirm + moderator verify/amend/reject/reopen + audit trail). Leagues with `require_score_verification` off auto-verify submissions (create/graduate/submit and on config change), so cards never strand outside the standings; a threshold of 0 with verification on counts as 1. Rejected cards must be reopened before amending; an owner editing a rejected card is audited as a reopen. Non-members only see verified cards and counts. Verification outcomes notify the shooter (`score_verified`/`score_rejected`/`score_amended`).
- **Clubs:** Create, update, delete (the club owner, not just platform admins), join, members, image upload, opening hours (`PUT /clubs/{id}/opening-hours` replaces the published week). The club profile carries a real-world identity — postal address, map pin, website/email/phone, disciplines, distances, facilities, membership and visitor info, founding year — surfaced as the About panel on the club page and editable from club settings. Text profile fields follow an "omit to keep, empty string to clear" convention; arrays clear with `[]`; coordinates clear only via `clear_coordinates`. Disciplines are validated against `model.ClubDisciplines`.
- **Moderators and delegated capabilities:** see "Moderator roles" above. `send_announcements` is in both catalogues and is never granted by default. `GET /leagues/{id}/moderator-permissions` and `GET /clubs/{id}/moderator-permissions` return the delegable catalogue plus the caller's own role; `PATCH .../members/{userId}` promotes, demotes and re-grants.
- **Feature board:** `GET /feature-requests` (recent) and `/feature-requests/ranking` (most-voted) list the ideas visible to the viewer — platform ideas for everyone, league/club ideas for members of that league or club. `POST /feature-requests/{id}/vote` toggles the viewer's upvote, `/comments` carries the discussion, and `GET /feature-requests/{id}/events` returns the request's history (created, status, priority and owner changes). Rows come back enriched with requester, owner, scope *name* and vote/comment counts so the board never renders a raw ID. New ideas are not created here: the board's composer opens a `feature`-category support ticket, which an admin refines onto the board via `POST /admin/tickets/{id}/feature-request`. Admins set `status` and `priority` with `PATCH /admin/feature-requests/{id}`; both changes are recorded in the history. The UI collapses the eight statuses into five stages (under review, planned, in progress, shipped, not planned) defined once in `frontend/src/utils/featureBoard.ts`.
- **Events:** A shoot other people enter, addressed by `slug` rather than UUID. `POST`/`GET /events`, `/events/{slug}` and its participants, guests, scorers (delegated card-verification duty), invitations (`/events/invitations/{token}` + `/accept`, `/decline`), scores, scoreboard, `results.csv`, `promote` and per-card `confirm`/`amend`/`reject`. Cards reach an event through `submit-to-event` — see "A card's context is never final".
- **Posts:** The social feed's own content — `POST`/`GET /posts`, `/posts/share` (share an entity into the feed), `/posts/{id}/comments`, `/like`, and `/flag`/`/unflag`. Writes are rate-limited (`RATELIMIT_POST_PER_MIN`, `_COMMENT_`, `_LIKE_`).
- **Moderation:** `POST /reports` raises a report on a post, comment or user; an admin decides it at `/admin/reports/{id}/decide`. A flagged row is hidden by the background sweeper only after `MODERATION_FLAG_GRACE`, so the author gets a chance to amend first.
- **Privacy:** `/users/me/blocks` and `/users/me/mutes`. Both are applied in the feed query itself (`repository/activity.go`), and a block is symmetric — neither side sees the other. Announcements are exempt: they come from a group the user joined, not a person they chose to hear from.
- **Support & FAQ:** Support tickets carry the help desk and are the only way a feature request is born (see "Feature board"). Admins work the queue at `/admin/tickets` (`status`, `assign`, `feature-request`). `GET /faqs` and `/faqs/{slug}` are public; admins edit and reorder them under `/admin/faqs`.
- **Two-factor:** `/users/me/2fa/status`, `/enroll/begin`, `/enroll/confirm`, `/disable`, `/backup-codes/regenerate` (TOTP via `pquerna/otp`). Login with 2FA on completes at `POST /auth/login/2fa`.
- **Locations & categories:** `/locations` are the user's saved places — the first rule in "Naming a picked location". `/categories` are the shared taxonomy admins maintain at `/admin/categories`.
- **Users:** Update profile, avatar upload, email change, view profiles
- **Social:** Follow/unfollow users
- **Devices:** Register/unregister push-notification tokens (`POST`/`DELETE /devices`)
- **Notifications:** `GET /notifications` (cursor-paged), `/unread-count`, `POST /notifications/read` (ids, or empty for all), and `GET`/`PATCH /notifications/preferences` — one in-app and one email flag per type, plus the three `review_requests_*` opt-ins that widen who is asked to validate a card. See "Notifications" above for the types and what fans them out.
- **Announcements:** `POST`/`GET /leagues/{id}/announcements`, `/clubs/{id}/announcements` and `/events/{slug}/announcements` send to and list a group's broadcasts; `GET /announcements/platform` lists the site-wide ones and `GET /announcements/{id}` reads one, gated on having been sent it. Sending platform-wide is `POST /admin/announcements`. See "Announcements" above.
- **Activity:** `GET /feed`
- **Achievements:** List own + list for user
- **Stats:** User stats, rifle stats, score trends
- **Images:** Upload
- **Geo:** `GET /geo/reverse?lat=&lng=` names a coordinate — see "Naming a picked location"

### Admin (requires `middleware.RequireAdmin`)

- **Email:** SMTP settings (get/patch/test), email templates (list/get/patch/preview)
- **Users:** List, get, update role, delete
- **Gear analytics:** Site-wide gear stats (`/admin/gear/stats`), a paginated/sortable gear-model leaderboard (`/admin/gear/models?kind=rifle|pellet`), and a per-model drill-down with owners and trend (`/admin/gear/model?kind=&make=&model=`). Admin views cover the whole estate — unlike the user-facing showcase they ignore `comparison_opt_in`, and report opt-in rates instead.
- **Leagues:** List, get, update, delete, members management
- **Clubs:** List (private clubs included), get, update, delete, members management
- **Events:** List, get, update, delete (`/admin/events`)
- **Reports:** Queue and `POST /admin/reports/{id}/decide`; `/admin/activities/{id}` hides and `/unhide` restores a feed row
- **FAQ:** CRUD plus `reorder-sections` / `reorder-items`
- **Categories:** CRUD for the shared taxonomy
- **Feature board:** `PATCH /admin/feature-requests/{id}` and `POST /admin/tickets/{id}/feature-request` — see "Feature board"
- **Announcements:** `POST /admin/announcements` sends platform-wide — see "Announcements"
- **Branding:** `GET`/`PATCH /admin/site-settings` and `POST`/`DELETE /admin/site-settings/logo` edit everything the setup wizard asked. The logo lives here rather than in the wizard because uploading one needs an account and setup runs before there is one
- **Sitemap & SEO:** `/admin/sitemap/stats` reports what is eligible and served, `/ping` submits to IndexNow, `/submissions` is the log, `/indexnow-key` shows the key — see "Indexable surface"
- **Backup:** `/admin/backup/settings` (+ `test-s3`), `run`, `runs`, download and restore. Dumps are gzipped and AES-encrypted with a passphrase-derived key before upload, so a run without a configured passphrase fails rather than shipping plaintext.
- **Activity simulation:** Settings (get/patch), status, run-now (configurable batch size with per-action breakdown), personas (list/edit/delete/purge), cleanup (trim to target), audit log. Provisions flagged (`is_simulated`) accounts that post/like/comment/follow/unfollow/share via the normal service paths; paced by a background runner with hourly time-of-day shaping, disabled by default. Per-action counters, last-error, and tick-health surfaced in status; admin operations recorded in `simulation_audit`. Simulated users are flagged in the admin user list (badge + hide filter) and on public profiles. An `include_in_public_stats` toggle excludes simulated content from the public feed and pellet leaderboard.

  Personas are built to read as people rather than as a bot roster (see "Simulation realism" below for how, and which parts are admin-tunable).

## Demo Recordings & Video Guides

Short screen recordings of the real app with the narration baked into the
frames as overlay text (title card, lower-third captions, cursor dot), in two
kinds: **showcase** (the pitch — what the app does) and **how-to** (the
instruction — how you do it). Both play on the landing page and on `/help`.
Nothing is edited by hand — every video is reproducible with one command
whenever the UI it shows changes.

- `docs/demo-recordings.md` is the catalog: production standard, storyboards
  and exact caption lines. New video = storyboard there first.
- `e2e/demos/` is the recorder — a Playwright project separate from the e2e
  suite (own config, one worker, video always on, human-pace slowMo). Specs
  seed their own data through the API under `demo@sub12.local` and film
  against the same local stack as `scripts/e2e.sh`. Posters are screenshots
  the spec takes at its best moment (`demo.saveMoment()`); Playwright's
  bundled ffmpeg only encodes VP8, so frames can't be extracted afterwards.
- **The film is cut back to its title card.** Playwright films the whole life
  of the page, so the seeding, the sign-in and the app's first load all land
  on the front of the recording — ~26 seconds of blank white and then of a
  motionless page, against a dev stack. Pressing play on the landing page and
  getting a white rectangle followed by a still screenshot is exactly what a
  broken player looks like, and it is what shipped. `Overlay` now records
  `filmStartMs` (when the first title card or caption went up) and the fixture
  hands it to `trimRecording()` in `e2e/demos/trimVideo.ts`, which rewrites the
  webm to start there. The cut never re-encodes — it opens the film on the last
  keyframe before the mark and drops the still frames after it — so a marketing
  asset never picks up generation loss, at the price of the ≤5s of lead-in that
  keyframe spacing leaves behind.
- `./scripts/record-demos.sh [slug]` boots the stack if needed, records, and
  publishes webm + poster jpeg into `frontend/public/demos/` (served at
  `/demos/…`, committed to the repo, deliberately not in the PWA precache and
  not in nginx's immutable-cache block so re-recordings propagate).
- `frontend/src/catalog/videoGuides.ts` is the one place a recording is
  registered. `available: true` promises the files are shipped — a test fails
  if the webm or poster is missing — and only available entries render, so a
  planned video can sit in the catalog without dangling a broken player.
- Surfaces, all four fed from that one catalog:
  - `components/VideoGuides.tsx` — the rail + modal player on `/help`.
  - `pages/LandingPage.tsx` — the `#demos` "See it in action" section. This is
    the page actually served at `https://sub12.io/`, so it is the only one of
    these a visitor sees **before signing in**; `/help` is an `appRoute` child
    and every other surface is behind auth. A recording that isn't here is a
    recording no prospective user will ever watch. Its players are
    `preload="none"` — the files run to several MB each and the posters carry
    the section until somebody presses play.
  - `landing/index.html` — the standalone static landing page, which is
    deployed separately (nothing in `docker-compose.yml` or CI builds it) and
    so must reference the videos by absolute `https://sub12.io/demos/…` URL.
    Editing it is not editing what sub12.io serves.
  - `README.md` — `<video>` players sourced from this repository's own raw
    URLs, so the recordings play on GitHub without a site visit or a login.
- **`/demos/` is on the service worker's `navigateFallbackDenylist`**
  (`frontend/vite.config.ts`). A `/demos/x.webm` URL is a file, not a router
  path, and opening one directly — from the README, or from a shared link — is
  a *navigation*. Left off the denylist the worker answers it with
  `index.html`, and the router, which has no `/demos` route, renders "Target
  not found". nginx serves the file correctly throughout, so the 404 appears
  only for visitors who had already loaded the site once, and never in a
  server log.

## Simulation Realism

Everything that makes the simulated community look inhabited lives in
`service/simulation.go`. The guiding rule: **anything a visitor could use to
tell one persona from another must be stable and self-consistent**. Traits are
derived from an FNV hash of the persona's id (`personaTraitsFor`), so the same
account shoots to the same standard, writes in the same voice, and shoots the
same ground forever — across restarts, with nothing extra stored.

- **Character** — `personaTraits` fixes skill, consistency, talkativeness,
  sociability, competitiveness, activity level, writing voice, home ground,
  discipline, usual distance, indoor/outdoor, and rifle/pellet choice. The bio
  written at provisioning is composed from those same values, so the profile,
  the gear list and the cards all agree.
- **Uneven activity** — actor selection is weighted by a *cubed* activity trait,
  so a keen minority generates most of the traffic and there is a quiet tail.
  A persona also holds the floor for a short run of consecutive actions (a
  browse session) rather than the engine drawing a fresh actor every time.
- **Time** — cards are back-dated with a decaying offset, pulled toward the
  weekend just gone, and never dated before the persona joined. New personas'
  join dates are staggered back through `persona_history_days`, so a roster
  looks grown rather than provisioned in one afternoon.
- **Sessions** — every card shot on the same day shares one form value
  (`sessionForm`) and one set of weather conditions (`dayConditions`, keyed on
  ground + date, with a UK seasonal temperature curve). Two personas who shot
  the same county on the same Sunday report the same wind. Scores respond to
  form, wind and accumulated experience; notes are chosen to match the
  conditions and the result, so a calm day never reports a gale.
- **Conversation** — comments react to the tier of the card they are on (a 190
  gets encouragement, a 245 gets praise and sometimes the score quoted), in the
  persona's own voice, avoiding the lines that persona used most recently.
  Comments also reply into existing threads, addressed to the author by name.
- **Engagement** — target selection prefers recently posted content
  (`simRecentWindow`) and spreads likes across cards, posts, comments and
  activities. Follows prefer whoever just followed the persona, then
  friends-of-friends, then a stranger; unfollows prefer the follows nobody
  reciprocated. That produces a clustered, reciprocal graph rather than a
  uniform mesh.

Six of these are admin-tunable from the simulation page (`backdate_days`,
`weekend_bias`, `away_day_chance`, `reply_chance`, `session_actions`,
`persona_history_days`); each accepts 0 to switch that behaviour off. The rest
are intentionally not settings — they are what "human" means here, not knobs.

When adding a new behaviour, prefer deriving it from the persona's traits over
adding another random roll: randomness per action is exactly what makes a feed
read as generated.

### An action that changes nothing is not an action

The engine's counters are the only evidence anyone has that it is working, so
the one thing it must never do is report work it did not do. Two paths made it
lie, and both are the shape to watch for when adding an action:

- **A no-op that returns no error still counts.** `LikeService.Like` is
  idempotent — re-liking returns `created=false`, not an error — and the engine
  discarded that flag, so a persona re-liking the same card scored a performed
  action while the site did not change. The like-target queries now take
  `unlikedOnly` and exclude what the actor already liked (`notAlreadyLiked`),
  and `like` returns `created`. Any new action needs the same two halves: pick
  a target the action can actually affect, and report only what landed.
- **`max_cards_per_persona` is a lifetime ceiling, not a rate limit.**
  `persona_count × max_cards_per_persona` (12 × 30 at defaults) is every score
  card the simulation will ever post; at ~20 actions/hour a roster reaches it in
  days and then never posts another. Likes and comments carry on churning over
  the cards that already exist, so `total_actions` keeps climbing and nothing
  new appears — which is exactly what "enabled but stopped working" looks like.
  A capped persona is no longer offered `post` (`pickAction` zeroes the weight;
  `""` means the persona has nothing it can do), a failed attempt ends the
  browse session so the retry draws somebody else, and a fully capped roster
  writes an actionable message to `last_error`. Raising the cap, adding
  personas, or setting it to 0 is the fix — the engine cannot invent headroom.

`last_error` therefore persists until another error supersedes it or the admin
saves the settings. It used to be blanked by the next clean batch, which meant
the reason the engine had gone quiet was written to the dashboard and erased
seconds later; `last_error_at` is rendered beside it and is what says how stale
the message is.

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
| `DB_SSLMODE` | `disable` | libpq TLS mode. Production refuses anything unencrypted unless `DB_ALLOW_INSECURE_LOCAL_NETWORK=true` — see "Placeholder credentials are refused" |
| `DB_ALLOW_INSECURE_LOCAL_NETWORK` | `false` | The operator asserting Postgres is not reachable off-host, which is the only way past the production TLS check. Set by `docker-compose.yml` for the topology it defines. Never set it for a managed database |
| `WEB_PORT` | `3000` | Host port the frontend container publishes. Point a reverse proxy here |
| `IMAGE_REPO` | `ghcr.io/eyupio` | Registry prefix for the two images, so a fork runs its own without editing `docker-compose.yml` |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection URL |
| `JWT_EXPIRY_HOURS` | `24` | JWT token expiry in hours |
| `PASSWORD_RESET_TTL_MINUTES` | `60` | Password reset token TTL |
| `SITE_URL` | `https://sub12.io` | Canonical public host. `PASSWORD_RESET_URL` and `EVENT_INVITATION_URL` are derived from this when unset. Override to `http://localhost:5173` in dev so emailed links open the local Vite server. |
| `PASSWORD_RESET_URL` | *(derived from `SITE_URL`)* | Frontend password reset page URL. Production must not contain `localhost` — the backend refuses to start if it does. |
| `EVENT_INVITATION_URL` | *(derived from `SITE_URL`)* | Base URL for event invitation accept pages; token is appended as `/{token}`. Production must not contain `localhost`. |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed CORS origin |
| `SEED_ADMIN` | `false` | Auto-seed admin user on startup |
| `ADMIN_PASSWORD` | *(empty)* | Password for seeded admin user |
| `GEOCODE_URL` | `https://nominatim.openstreetmap.org` | Nominatim-compatible endpoint used to name picked coordinates. Empty disables reverse geocoding; the UI then shows coordinates. |
| `GEOCODE_USER_AGENT` | *(derived from `SITE_URL`)* | Identifies us to that endpoint, as Nominatim's usage policy requires. |
| `FCM_CREDENTIALS_JSON` | *(empty)* | Firebase service-account JSON for push delivery (FCM HTTP v1). When empty, device tokens are still stored but no push is sent (no-op sender). |
| `FRONTEND_ORIGIN` | `http://frontend:8080` | Internal URL the backend fetches the SPA `index.html` from so it can inject per-page Open Graph tags. Point it at the frontend container; every share link and every page in `StaticPages` degrades to a holding page if it can't be reached. |
| `DEFAULT_AVATAR_URL` | *(empty)* | Absolute URL used as the avatar in emails and share cards when a user has none. Covered by the `Validate()` localhost guard. |
| `INDEXNOW_KEY` | *(empty)* | IndexNow submission key. Empty disables pinging search engines on publish. |
| `INDEXNOW_KEY_LOCATION` | *(derived)* | URL of the key file; the backend serves it at `/{key}.txt`. |
| `RATELIMIT_ENABLED` | `true` | Master switch for `middleware/ratelimit.go` (Redis-backed, per-user, per-minute). |
| `RATELIMIT_AUTH_PER_MIN` | `10` | Login/register/reset attempts. Keyed on IP, not user. |
| `RATELIMIT_FOLLOW_PER_MIN` | `10` | Follow/unfollow. |
| `RATELIMIT_COMMENT_PER_MIN` | `20` | Comment writes. |
| `RATELIMIT_POST_PER_MIN` | `10` | Post creation. |
| `RATELIMIT_REPORT_PER_MIN` | `5` | Content reports. |
| `RATELIMIT_LIKE_PER_MIN` | `60` | Likes. |
| `RATELIMIT_SOCIAL_TOGGLE_PER_MIN` | `30` | Other social toggles. |
| `RATELIMIT_GEOCODE_PER_MIN` | `30` | Reverse-geocode lookups per user, on top of the global one-per-second pacing. |
| `MODERATION_FLAG_GRACE` | `48h` | How long an author has to amend a flagged comment or post before the sweeper hides it. |
| `MODERATION_SWEEP_INTERVAL` | `15m` | How often that sweeper runs. |

`Validate()` only refuses a localhost value when `ENV=production`, and only for
the four URL fields listed in it — see "Outgoing public URLs".

## CI Pipeline

Seven GitHub Actions workflows. `ci.yml` is the one that gates a PR; treat the
rest as build/publish plumbing.

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
  `.animate-slide-in` (drawers), `.animate-pop` (value changes), `.u-stagger`
  (sequenced list children).
- **Interaction utilities** — `.u-lift` (cards that link somewhere), `.u-press`
  (buttons and icon controls), `.u-nudge` (nav and list rows), `.u-sheen`
  (primary CTAs), `.u-hairline`, `.u-tnum`, `.u-text-gold-gradient`.
- **Touch targets** — on `pointer: coarse` every button gets `min-height: 40px`.
  A control whose drawn size *is* the design (a pill switch, a round icon badge
  over an image) must carry `.tap-target`, or that floor stretches the circle
  into an ellipse; the class keeps the box and moves the 40px touch area onto a
  centred pseudo-element. `.no-min-target` opts out with no replacement area.
- **Component classes** — `.btn` + `.btn-primary/secondary/ghost/danger/brass` +
  `.btn-sm/lg`, `.field`, `.surface-card`, `.skeleton`, `.spinner`,
  `.skip-link`, `.app-tab` (mobile bottom-nav dot/pill markers).
- **Loading states** — use `src/components/Skeleton.tsx` (`Skeleton`,
  `SkeletonText`, `SkeletonCard`, `SkeletonList`, `SkeletonTable`,
  `SkeletonStats`, `SkeletonPage`, `Spinner`) or `LoadingRows` from
  `src/components/leagues` inside a `<Section>`. Don't ship a bare "Loading…"
  string — it collapses the layout and reflows when data lands.
- **Layer stack** — nav chrome `z-40`–`z-[60]`, dialogs and overlays `z-[110]`,
  image viewers/editors `z-[120]`, toasts `z-[150]`, `.skip-link` `200`. Toasts
  have to outrank every overlay: most of what they report is the outcome of an
  action *started from inside a dialog*, and a toast under the backdrop is
  blurred out — the user reads a failed submit as a dead button. New overlays
  go at `z-[110]`/`z-[120]`; `Toast.test.tsx` scans the source and fails on
  anything at or above the toast layer.
- **Native-only rules** — `.native-app` selectors in the base layer disable
  long-press callouts, chrome text selection, and overscroll bounce inside the
  Capacitor WebView. Add `.selectable` to opt real content back in.
- **Refreshing** — `Layout` owns the app's only reload affordances: pull down on
  the page scroller (`usePullToRefresh`, touch only) or tap the SUB12 lockup.
  Both refetch active TanStack queries rather than reloading the WebView, which
  would reset the router. Android targets SDK 35, so `frontend/android/app/src/main/
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

- `ghcr.io/eyupio/sub-12-backend:latest`
- `ghcr.io/eyupio/sub-12-frontend:latest`
- `release.yml` publishes to `ghcr.io/${{ github.repository_owner }}/sub-12-*`, so
  a fork's own builds land under its own owner. Set `IMAGE_REPO` in `.env` to run
  them instead of ours
- Tag with `IMAGE_TAG` env var in `docker-compose.yml` for pinned deploys
- Production frontend nginx proxies `/api/` to backend container (no host port exposed for backend)
