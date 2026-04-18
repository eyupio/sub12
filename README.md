# sub12

A modern platform for the UK airgun benchrest shooting community. Track scores, manage leagues, and log pellet/rifle combinations.

## Stack

| Layer | Technology |
|---|---|
| Backend | Go + Chi router |
| Database | PostgreSQL 16 |
| Cache | Redis 7 |
| Frontend | React 18 + TypeScript + Vite |
| Mobile | Capacitor (iOS / Android) |
| PWA | vite-plugin-pwa |

## Test Accounts

Seed these with `cd backend && make seed` (requires Postgres running).

| Email | Password | Display Name | Notes |
|---|---|---|---|
| `dev@sub12.local` | `password123` | Dev User | General dev account |
| `admin@sub12.local` | `password123` | Admin | Platform admin account |

## Quick Start

### Prerequisites

- [Go 1.24+](https://go.dev/dl/)
- [Node 20+](https://nodejs.org/)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)

### Setup

```bash
cp .env.example .env          # configure environment variables
make dev                       # start Postgres + Redis
cd backend && make migrate-up  # run database migrations
cd backend && make run         # start API server on :8080
cd frontend && npm install && npm run dev  # start Vite on :5173
```

### Full stack via Docker

```bash
cp .env.example .env
make up
```

## Project Structure

```
sub-12/
├── backend/    Go REST API
├── frontend/   React PWA
└── .github/    CI/CD workflows
```

## API

- `GET /healthz` — liveness probe
- `GET /readyz`  — readiness probe (checks DB)
- `GET /api/v1/` — versioned API root

Full API documentation generated via OpenAPI (coming soon).

## Development

```bash
# Backend tests
cd backend && make test

# Frontend type check + lint
cd frontend && npm run check

# Apply migrations
cd backend && make migrate-up

# Roll back last migration
cd backend && make migrate-down
```

## Mobile keyboard + navigation policy

For mobile shell layout consistency, SUB-12 uses this focused-input behavior:

- Keep the app content scrollable and resized above the on-screen keyboard.
- Temporarily hide the mobile header and bottom navigation while the keyboard is open.
- Restore header/nav immediately after the keyboard closes.

Implementation details:

- `frontend/src/components/Layout.tsx` detects keyboard-open state on small screens via `window.visualViewport` height changes and toggles mobile header/bottom nav visibility.
- `frontend/capacitor.config.ts` sets Capacitor Keyboard plugin `resize: "body"` (with `resizeOnFullScreen: true`) so content reflows instead of being obscured.

If you adjust shell navigation, spacing, or keyboard behavior, preserve this policy so focused inputs remain usable on iOS and Android.
