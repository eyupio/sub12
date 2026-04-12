# GitHub Copilot Instructions — sub-12

## Project Context

sub-12 is a target shooting companion app. Monorepo: `backend/` (Go API), `frontend/` (React/TypeScript SPA). PostgreSQL 16 + Redis 7 for data/sessions.

## Architecture

- **Backend layers:** Handler (HTTP) → Service (business logic) → Repository (pgx SQL)
- **Frontend patterns:** TanStack Router pages, TanStack Query for data, Zustand for client state, Tailwind CSS for styling
- **Auth:** JWT access tokens + Redis-backed refresh tokens. Middleware injects user ID/role into context.

## Code Style

### Go (backend/)

- Use `chi` router for HTTP, `zerolog` for logging, `envconfig` for config
- Parameterized SQL only (`$1`, `$2`) — never concatenate user input into queries
- Return errors up the stack; handlers map errors to HTTP status codes
- Test with `testify`. Test files live next to source (`service/foo_test.go`)
- Use `context.Context` for cancellation and timeouts on DB/Redis calls

### TypeScript/React (frontend/)

- Strict TypeScript — no `any` types unless unavoidable
- API calls go in `src/api/` modules using the shared client from `src/api/client.ts`
- Pages in `src/pages/`, shared components in `src/components/`
- Use Tailwind utility classes; respect dark mode via the theme store
- Prefer TanStack Query hooks over manual `useEffect` + `useState` for server data

## Database Migration Rules

**Critical — these prevent production outages:**

1. Use `make migrate-create NAME=description` to generate files (auto-numbers)
2. All DDL must be idempotent:
   - `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`
   - `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
   - Wrap `CREATE TYPE` in `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;`
   - Wrap `ADD CONSTRAINT` the same way
   - Use `ON CONFLICT ... DO NOTHING` for seed data
3. Never reuse a migration sequence number
4. Every `.up.sql` needs a matching `.down.sql`
5. One concern per migration file

## Build Commands

```bash
# Backend
cd backend && make run       # API on :8080
cd backend && make test      # go test -race ./...
cd backend && make build     # compiles to bin/api

# Frontend
cd frontend && npm run dev   # Vite on :5173
cd frontend && npm test      # Vitest
cd frontend && npm run build # production build

# Infra (dev)
docker compose -f docker-compose.dev.yml up -d
```

## API Patterns

- Routes: `/api/v1/...` (versioned), `/healthz` + `/readyz` (unversioned)
- Protected routes use `middleware.Authenticate(auth)` group
- Read user from context: `middleware.UserIDFromContext(r.Context())`
- JSON responses via `writeJSON(w, status, payload)` helper in handlers
- Request body decoding via `decodeJSON(r, &target)` with 1 MiB limit

## Don'ts

- Don't add features or refactoring beyond what's requested
- Don't add comments/docstrings to unchanged code
- Don't create abstractions for one-time operations
- Don't use `fmt.Println` or `log.Println` — use `zerolog`
- Don't use raw SQL string concatenation — always parameterize
- Don't manually number migration files — use the Makefile target
