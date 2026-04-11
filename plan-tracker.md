# sub-12 — Development Tracker

> Last updated: 2026-04-11 (session 5)

---

## Open Decisions

| # | Question | Status |
|---|---|---|
| 1 | Final brand name and domain | **TBD** — working name: sub-12 |
| 2 | Cross-platform strategy | **Decided** — PWA (React + Vite) + Capacitor |
| 3 | Score verification workflow | **TBD** — trust-based vs image-based vs admin |
| 4 | Monetisation model | **TBD** |
| 5 | Integration with UKBR25 / club spreadsheets | **TBD** |

---

## Phase 1 — MVP

**Goal:** Core product usable by a single shooter to log cards and join a public league.

### Infrastructure & Scaffold
- [x] Monorepo structure (`backend/`, `frontend/`)
- [x] Go backend skeleton (Chi router, zerolog, envconfig)
- [x] PostgreSQL + Redis via Docker Compose
- [x] Database migrations (golang-migrate, 4 migration files)
- [x] `/healthz` and `/readyz` endpoints
- [x] React + Vite PWA scaffold (TanStack Router/Query, Tailwind, dark mode)
- [x] Capacitor configured for iOS/Android
- [x] GitHub Actions CI (lint + test + build, both backend + frontend Docker smoke tests)
- [x] GitHub Actions release (backend + frontend images → GHCR)
- [x] `docker-compose.yml` pulls images from GHCR (`IMAGE_TAG` variable for pinning)
- [x] Frontend `Dockerfile` (multi-stage: Node build → nginx with SPA routing)

### Authentication
- [x] Email/password registration and login
- [x] JWT access tokens + Redis-backed refresh tokens (30-day, rotated on use)
- [ ] Google OAuth 2.0
- [x] Auth middleware for protected routes (Bearer JWT validation)
- [x] Frontend: login/register pages, Zustand auth store (persisted), protected routes
- [x] API client auto-injects Bearer token; logout revokes refresh token

### Score Cards
- [x] `POST /api/v1/score-cards` — submit a 25-shot card
- [x] `GET /api/v1/score-cards` — list own cards (paginated)
- [x] `GET /api/v1/score-cards/:id` — card detail
- [x] Frontend: score entry screen (25-shot grid, running total, X count)
- [x] Frontend: score card detail page
- [x] Frontend: personal score history list (`/scores`)

### Personal Stats
- [x] `GET /api/v1/users/me/stats` — cards logged, best score, best X, avg score
- [x] Frontend: Dashboard stats cards (live data via TanStack Query) + recent cards list

### Rifles & Pellets
- [x] `POST/GET/PATCH/DELETE /api/v1/rifles`
- [x] `POST/GET/PATCH/DELETE /api/v1/pellets`
- [x] Frontend: `/gear` page (tabbed Rifles / Pellets, add + delete)
- [x] Gear nav item (replaces Leagues stub in bottom nav)
- [x] Rifle/pellet selectors in score entry (shown when gear exists)

### Leagues (public only)
- [ ] `POST /api/v1/leagues` — create a public league
- [ ] `GET /api/v1/leagues` — list public leagues
- [ ] `POST /api/v1/leagues/:id/join` — join a league
- [ ] `GET /api/v1/leagues/:id/standings` — live standings
- [ ] Frontend: league list, league detail + standings table

### User Profiles
- [x] `GET /api/v1/users/:id` — public profile
- [x] `PATCH /api/v1/users/me` — update own profile
- [x] Frontend: profile page (stats, recent cards, edit form for bio/location/club)

---

## Phase 2 — Community

- [ ] Private leagues (invite codes)
- [ ] Social follow / unfollow
- [ ] Activity feed (followed shooters + leagues)
- [ ] Score card comments
- [ ] Score card image upload (S3-compatible storage)
- [ ] Achievements / badges engine
- [ ] League admin tools (approve scores, manage members, rounds)
- [ ] Mobile app builds (Capacitor iOS + Android)

---

## Phase 3 — Analytics & Growth

- [ ] Pellet/rifle combo performance analytics
- [ ] Trend charts (score over time)
- [ ] Group size tracking (CTC mm)
- [ ] Club pages
- [ ] Season archives
- [ ] Third-party API (key-gated)
- [ ] Push notifications

---

## Phase 4 — Scale

- [ ] Real-time live scoring (WebSockets / SSE)
- [ ] Score verification / moderation workflow
- [ ] Multi-discipline support (rimfire, FAC)
- [ ] Internationalisation
- [ ] Premium / subscription tier (TBD)

---

## Non-Functional Checklist

| Requirement | Status |
|---|---|
| API response < 200ms | Not measured yet |
| Initial page load < 3s | Not measured yet |
| Backend test coverage > 80% | 0% (scaffold only) |
| E2E tests for critical flows | Not started |
| OWASP / security review | Not started |
| GDPR compliance | Not started |
| WCAG 2.1 AA | Not started |
| Offline score entry + sync | Not started |
| `/metrics` endpoint (Prometheus) | Not started |
| Structured logging with correlation IDs | Partial (zerolog in place, no correlation ID yet) |

---

## Tech Stack Reference

| Layer | Choice |
|---|---|
| Backend language | Go 1.23 |
| HTTP router | go-chi/chi v5 |
| DB driver | jackc/pgx v5 |
| Migrations | golang-migrate |
| Logging | rs/zerolog |
| Config | kelseyhightower/envconfig |
| Auth tokens | golang-jwt/jwt v5 |
| Database | PostgreSQL 16 |
| Cache / sessions | Redis 7 |
| Frontend | React 18 + TypeScript |
| Build tool | Vite 5 |
| Routing | TanStack Router |
| Data fetching | TanStack Query |
| State | Zustand |
| Styling | Tailwind CSS v3 |
| PWA | vite-plugin-pwa |
| Mobile | Capacitor 6 |
| CI/CD | GitHub Actions |
| Container registry | GHCR (`ghcr.io/jnnngs/sub-12-backend`, `ghcr.io/jnnngs/sub-12-frontend`) |
| Redis client | redis/go-redis v9 |
