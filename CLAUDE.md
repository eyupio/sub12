# CLAUDE.md — sub-12 Project Instructions

## Project Overview

sub-12 is a target shooting companion app (PWA + Capacitor) for logging 25-shot score cards, managing gear, running leagues, and pellet testing with image-based measurement. Monorepo with `backend/` (Go) and `frontend/` (React/TypeScript).

## Repository Structure

```
backend/          Go API server
  cmd/api/        Entrypoint (main.go)
  internal/
    api/          Router, handlers, middleware
    config/       Env-based config (envconfig)
    db/           Database connection, migrations, seeds
    email/        Email rendering
    model/        Domain types
    repository/   Data access (pgx queries)
    service/      Business logic
frontend/         React SPA
  src/
    api/          API client modules (typed fetch wrappers)
    components/   Shared UI components
    pages/        Route pages
    store/        Zustand stores (auth, theme)
    utils/        Utilities (ballistics, hole detection)
brand/            SVG brand assets
landing/          Static landing page
```

## Tech Stack

- **Backend:** Go 1.24, Chi v5 router, pgx v5, zerolog, envconfig, golang-jwt v5
- **Database:** PostgreSQL 16, Redis 7
- **Frontend:** React 18, TypeScript, Vite 5, TanStack Router + Query, Zustand, Tailwind CSS v3
- **Mobile:** Capacitor 6 (PWA-first)
- **CI/CD:** GitHub Actions → GHCR container images
- **Migrations:** golang-migrate with embedded SQL files

## Build & Run Commands

### Development

```bash
# Start infra (postgres + redis)
docker compose -f docker-compose.dev.yml up -d

# Backend
cd backend && make run          # starts API on :8080
cd backend && make test         # go test -race ./...
cd backend && make lint         # go vet ./...
cd backend && make build        # compiles to bin/api

# Frontend
cd frontend && npm run dev      # Vite dev server on :5173
cd frontend && npm run check    # TypeScript type check
cd frontend && npm run lint     # ESLint
cd frontend && npm test         # Vitest
cd frontend && npm run build    # Production build
```

### Production

```bash
docker compose up -d            # pulls GHCR images, runs all 4 services
docker compose logs backend     # check for migration/startup errors
```

### Database Migrations

```bash
cd backend
make migrate-create NAME=add_foo   # creates next sequential migration files
make migrate-up                    # apply pending migrations
make migrate-down                  # rollback last migration
make migrate-lint                  # check for duplicate prefixes
```

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
- **Auth middleware:** `middleware.Authenticate(auth)` extracts user ID/role into context; use `middleware.UserIDFromContext(ctx)` to read it
- **Tests:** Use `testify` assertions. Test files go next to the code they test (e.g. `service/score_card_test.go`)

### Frontend (TypeScript/React)

- **Routing:** TanStack Router with file-based route tree (`routeTree.ts`)
- **Data fetching:** TanStack Query — define queries/mutations in `src/api/` modules
- **State:** Zustand stores in `src/store/` (auth is persisted to localStorage)
- **Styling:** Tailwind CSS utility classes; dark mode via `ThemeToggle` and `theme` store
- **API client:** `src/api/client.ts` auto-injects Bearer token from auth store
- **Components:** Shared components in `src/components/`, page components in `src/pages/`

### General

- Don't add features, refactoring, or improvements beyond what is asked
- Don't add comments or docstrings to code you didn't change
- Don't create wrapper functions for one-time operations
- Prefer editing existing files over creating new ones

## API Structure

All API routes under `/api/v1/`. Health probes at root (`/healthz`, `/readyz`).

- **Public:** `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /leagues`, `GET /images/{id}`
- **Protected:** Everything else requires `Authorization: Bearer <jwt>`
- **Admin:** Role-based via `middleware.RequireAdmin` (SMTP settings, email templates, admin email)

## Environment Variables

Required: `DB_PASSWORD`, `JWT_SECRET`
Optional with defaults: `PORT` (8080), `ENV` (development), `DB_HOST` (localhost), `DB_PORT` (5432), `DB_NAME` (sub12), `DB_USER` (sub12), `REDIS_URL` (redis://localhost:6379), `CORS_ORIGIN` (http://localhost:5173)

## CI Pipeline

GitHub Actions runs on push/PR to `main`:
1. **Backend:** Migration lint (duplicate check) → `go vet` → `go test -race` → `go build`
2. **Frontend:** `npm ci` → type check → lint → test → build
3. **Docker:** Smoke-test image builds for both services

## Container Images

- `ghcr.io/jnnngs/sub-12-backend:latest`
- `ghcr.io/jnnngs/sub-12-frontend:latest`
- Tag with `IMAGE_TAG` env var in `docker-compose.yml` for pinned deploys
