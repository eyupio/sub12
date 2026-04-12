# sub-12 — Development Tracker

> Last updated: 2026-04-12 (session 8)

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
- [x] `POST /api/v1/leagues` — create a public league
- [x] `GET /api/v1/leagues` — list public leagues (public, no auth)
- [x] `POST /api/v1/leagues/:id/join` — join a league
- [x] `GET /api/v1/leagues/:id/standings` — live standings
- [x] Frontend: league list (`/leagues`) + create league modal
- [x] Frontend: league detail + standings table (`/leagues/:id`)
- [x] Leagues added to bottom nav (Trophy icon)

### User Profiles
- [x] `GET /api/v1/users/:id` — public profile
- [x] `PATCH /api/v1/users/me` — update own profile
- [x] Frontend: profile page (stats, recent cards, edit form for bio/location/club)

---

## Phase 2 — Community

### Phase 2A — League Access & Governance

**Goal:** Complete league participation controls, moderation, and league administration foundations.

- [x] League join policies (open / approval / invite), invite flows, and approval join path
- [x] Join request moderation UI/actions (`JoinRequestsList`)
- [x] League configuration/admin controls (scoring rule, verification flags)
- [x] Season management (`SeasonsSection`)
- [x] Round management (`RoundsSection`)
- [x] League image upload support

### Phase 2B — Score Verification & Media

**Goal:** Support evidence-backed scoring with verification actions and attached media.

- [x] Score verification actions in score card detail
- [x] Score verification audit trail surfaced in UI/API
- [x] Score card image upload path (client + API integration)

### Phase 2C — Social Layer

**Goal:** Add user-to-user and card-level social interactions around league and score activity.

- [ ] Social follow / unfollow graph
- [ ] Activity feed (followed shooters + leagues)
- [ ] Score card comments/threading

### Phase 2D — Recognition & Distribution

**Goal:** Add progression systems and complete mobile distribution pipeline.

- [ ] Achievements / badges engine
- [ ] Mobile app store packaging/release workflow

---

## Pellet Testing Feature

### Phase PT-1 — MVP (Stage 1)

**Goal:** Complete pellet testing system with session logging, group tracking, image uploads, leaderboard, and dashboard integration.

- [x] Database migration (pellet_test_sessions, pellet_test_groups, pellet_test_images tables)
- [x] Backend: model, repository, service, handler (full CRUD + leaderboard + stats)
- [x] 12 API endpoints wired into router + DI
- [x] Frontend: API module with typed interfaces
- [x] Frontend: Pellet Testing dashboard page (stats, recent tests, leaderboard preview)
- [x] Frontend: New Pellet Test form (rifle/pellet select, distance, conditions, groups, images)
- [x] Frontend: Pellet Test detail page (view/edit/delete, groups, images)
- [x] Frontend: Pellet Leaderboard page (per-rifle pellet rankings)
- [x] Navigation: "Testing" item added to sidebar/bottom nav
- [x] Dashboard: Pellet Testing summary widget
- [x] Manual group size entry (mm + auto MOA calculation)
- [x] Distance normalization (meters/yards → canonical meters)
- [x] Leaderboard ranking logic (best group → avg → test count + consistency score)
- [x] Inline "Add Pellet" in test creation form

### Phase PT-2 — Assisted Measurement

- [x] Image calibration tools (canvas-based draw/annotate) — `ImageMeasurement.tsx` with raw HTML5 Canvas
- [x] Draw bounding box around group area — bbox drawing mode with live mm/MOA readout
- [x] Calibration line / reference ring for pixel-to-mm conversion — NSRA target ring presets (6yd + 10m)
- [x] PelletImageMeasurement model + storage (calibration data) — migration 000009, full CRUD
- [x] Pellet comparison view (A vs B on same rifle) — `PelletComparison.tsx` at `/pellet-testing/compare`
- [x] Velocity / SD / spread fields on sessions — collapsible Chronograph Data section
- [x] Advanced conditions (bench setup, scope, pressure) — collapsible Advanced Conditions section
- [x] Group size by pellet timeline chart — `GroupSizeTimeline.tsx` with Recharts, mm/MOA toggle
- [x] Distance-normalized comparisons — `ballistics.ts` utility (normalizeGroupToDistance, mmToMOA)

### Phase PT-3 — Automation & Detection

- [ ] Automatic hole detection (contour/blob/circle detection)
- [ ] Confidence scoring for automated measurements
- [ ] Review and correction UI for detected holes
- [ ] Annotated image generation and storage
- [ ] Target template presets (known target sizes)
- [ ] Export / reporting
- [ ] "Confidence" badges (Single test / Emerging result / Well proven)
- [ ] Batch/lot performance tracking
- [ ] Site-wide pellet leaderboard (cross-user, opt-in)

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

## SEO

- [x] Primary meta tags (title, description, keywords, robots)
- [x] Open Graph tags (og:type, og:title, og:description, og:image, og:site_name)
- [x] Twitter/X Card tags
- [ ] Dynamic per-page OG tags (needs react-helmet-async or SSR)

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
