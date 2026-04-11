# sub-12

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

## Quick Start

### Prerequisites

- [Go 1.22+](https://go.dev/dl/)
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
