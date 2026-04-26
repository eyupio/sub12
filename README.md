# sub12

A target shooting companion app for the UK airgun benchrest community. Log 25-shot score cards, manage gear, run leagues and clubs, test pellets with image-based group measurement, and follow other shooters.

## Features

### Scoring & Gear
- **Score cards** — Log 25-shot cards with per-shot entry, target presets, and image attachments
- **Rifles** — Maintain a personal rifle inventory with images and metadata; built-in catalog of common models
- **Pellets** — Track pellet inventory with images; built-in catalog of common brands and weights
- **Stats** — Personal score trends, rifle-specific stats, and historical performance charts (Recharts)

### Pellet Testing
- **Image-based group measurement** — Upload target photos, auto-detect holes, and measure groups
- **Manual measurement fallback** — Override detection with manual hole placement when needed
- **Groups, detections, and confidence scoring** — Per-test breakdowns with confidence indicators
- **Compare, timeline, batch reports, combo analytics** — Multi-test analysis across pellets and rifles
- **Public leaderboard** — Share top results without requiring login
- **Ballistics utilities** — Frontend ballistics helpers for downrange calculations

### Leagues
- Create leagues, join via request flow, manage members and seasons
- Rounds, standings, configurable scoring rules
- **Score verification** — Confirm / amend / reject submissions with full audit trail

### Clubs
- Create clubs, manage members, upload club imagery
- Public club pages with standings

### Social
- **Follow / unfollow** other shooters
- **Activity feed** with privacy-aware filters
- **Comments** on score cards
- **Achievements** unlocked from milestones

### Admin
- User management (list, role updates, delete)
- League and club moderation
- SMTP settings + email template editor with live preview

### Auth & Accounts
- Email/password registration, JWT sessions, refresh tokens
- Forgot/reset password via email
- Profile editing, avatar upload, email change flow

### Platform
- **PWA** — Installable, offline-aware via `vite-plugin-pwa`
- **Capacitor** — iOS and Android native shells from the same codebase
- **Mobile keyboard handling** — Header/bottom-nav auto-hide while typing (see [policy](#mobile-keyboard--navigation-policy))
- **Dark mode** — Theme toggle persisted per user

## Stack

| Layer | Technology |
|---|---|
| Backend | Go 1.24, Chi v5, pgx v5, zerolog, golang-jwt, go-redis |
| Database | PostgreSQL 16 (golang-migrate, embedded SQL migrations) |
| Cache | Redis 7 |
| Frontend | React 18, TypeScript 5.5, Vite 5, TanStack Router + Query, Zustand 4 |
| Styling | Tailwind CSS v3, Lucide icons, Recharts |
| Mobile | Capacitor 6 (iOS / Android) |
| PWA | vite-plugin-pwa |
| Testing | Go test + testify, Vitest + Testing Library |
| CI/CD | GitHub Actions → GHCR container images |

## Repository Structure

```
sub-12/
├── backend/              Go REST API
│   ├── cmd/api/          Entrypoint
│   └── internal/
│       ├── api/          Handlers, middleware, router (Chi)
│       ├── config/       Env-based config (envconfig)
│       ├── db/           pgxpool, migrations, Redis, dev seed
│       ├── email/        Template renderer
│       ├── model/        Domain types
│       ├── repository/   pgx data access (one file per domain)
│       └── service/      Business logic
├── frontend/             React PWA
│   └── src/
│       ├── api/          Typed fetch wrappers per domain
│       ├── catalog/      Static pellet & rifle catalogs
│       ├── components/   Shared UI (Layout, ImageMeasurement, …)
│       ├── pages/        ~37 route pages
│       ├── store/        Zustand stores (auth, theme, toast)
│       └── utils/        Ballistics, hole detection, dates
├── brand/                SVG brand assets
├── landing/              Static landing page
└── .github/              CI/CD workflows
```

## Quick Start

### Prerequisites

- [Go 1.24+](https://go.dev/dl/)
- [Node 20+](https://nodejs.org/)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)

### Local development

```bash
cp .env.example .env                       # configure environment variables
make dev                                   # start Postgres + Redis
cd backend && make migrate-up              # run database migrations
cd backend && make run                     # start API on :8080
cd frontend && npm install && npm run dev  # start Vite on :5173
```

### Full stack via Docker

```bash
cp .env.example .env
make up        # builds and runs infra + backend + frontend
make logs      # tail container logs
make down      # stop everything
```

## Test Accounts

Seed with `cd backend && make seed` (Postgres must be running).

| Email | Password | Role |
|---|---|---|
| `dev@sub12.local` | `password123` | User |
| `admin@sub12.local` | `password123` | Admin |

## API

Routes are versioned under `/api/v1/`. Health probes live at the root.

- `GET /healthz` — liveness
- `GET /readyz` — readiness (DB check)

Public endpoints include auth, image fetch, league/club listings, public score-card comments, and the pellet-test public leaderboard. All other endpoints require `Authorization: Bearer <jwt>`. Admin routes are gated by `RequireAdmin`. See [CLAUDE.md](CLAUDE.md) for the full surface.

## Development

```bash
# Backend
cd backend && make test          # go test -race -count=1 ./...
cd backend && make lint          # go vet ./...
cd backend && make build         # compile to bin/api
cd backend && make tidy          # go mod tidy + verify

# Frontend
cd frontend && npm run check     # tsc --noEmit
cd frontend && npm run lint      # ESLint
cd frontend && npm test          # Vitest
cd frontend && npm run build     # production build
```

### Database migrations

```bash
cd backend
make migrate-create NAME=add_foo  # next sequential migration files
make migrate-up                   # apply pending migrations
make migrate-down                 # rollback last migration
make migrate-lint                 # detect duplicate prefixes
```

Migrations are embedded into the binary via `golang-migrate` and run on startup. All DDL must be idempotent (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`, `EXCEPTION WHEN duplicate_object`). Every `.up.sql` requires a matching `.down.sql`.

## Environment

Required:

| Variable | Description |
|---|---|
| `DB_PASSWORD` | PostgreSQL password |
| `JWT_SECRET` | JWT signing secret |

Common optional overrides: `PORT`, `ENV`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_SSLMODE` (use `require` in production), `REDIS_URL`, `JWT_EXPIRY_HOURS`, `PASSWORD_RESET_TTL_MINUTES`, `PASSWORD_RESET_URL`, `CORS_ORIGIN`, `SEED_ADMIN`, `ADMIN_PASSWORD`. See [CLAUDE.md](CLAUDE.md) for defaults.

## CI/CD

- **`ci.yml`** (push/PR to `main`) — migration lint, `go vet`, `go test -race` against a Postgres 16 service, `go build`, frontend type-check / lint / test / build, plus a Docker smoke build for both images.
- **`release.yml`** (push to `main`) — builds and pushes to GHCR with `sha-<commit>` and `latest` tags.

Container images:

- `ghcr.io/jnnngs/sub-12-backend:latest`
- `ghcr.io/jnnngs/sub-12-frontend:latest`

The production frontend nginx proxies `/api/` to the backend container; the backend port is not exposed to the host.

## Mobile keyboard + navigation policy

For mobile shell layout consistency, sub-12 uses this focused-input behavior:

- Keep the app content scrollable and resized above the on-screen keyboard.
- Temporarily hide the mobile header and bottom navigation while the keyboard is open.
- Restore header/nav immediately after the keyboard closes.

Implementation:

- [frontend/src/components/Layout.tsx](frontend/src/components/Layout.tsx) detects keyboard-open state on small screens via `window.visualViewport` height changes and toggles mobile chrome visibility.
- [frontend/capacitor.config.ts](frontend/capacitor.config.ts) sets the Keyboard plugin to `resize: "body"` (with `resizeOnFullScreen: true`) so content reflows instead of being obscured.

If you adjust shell navigation, spacing, or keyboard behavior, preserve this policy so focused inputs remain usable on iOS and Android.
