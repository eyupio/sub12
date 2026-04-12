# sub-12 — Development Tracker

> Last updated: 2026-04-12 (session 10)

---

## Product Snapshot

**Current maturity:** MVP complete for core scoring, leagues, gear, profiles, and pellet testing (including assisted measurement + automated detection).

**Current focus:** Community foundation + quality hardening.

---

## Open Decisions

| # | Decision | Status | Next action |
|---|---|---|---|
| 1 | Final brand name and domain | In progress (working name: **sub-12**) | Shortlist 3 names + domain checks, then select one |
| 2 | Cross-platform strategy | **Decided** (PWA + Capacitor) | Continue with current approach |
| 3 | Score verification workflow | In progress | Pilot trust-based first, then add optional image verification |
| 4 | Monetisation model | Not started | Define free vs paid feature boundary |
| 5 | UKBR25 / club spreadsheet integration | Not started | Collect sample spreadsheets and map required fields |

---

## Phase 1 — MVP (Completed)

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
- [ ] Google OAuth 2.0 (remaining)
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

### Leagues (Public)
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

## Pellet Testing (Completed)

### PT-1 — MVP
- [x] Database migration (`pellet_test_sessions`, `pellet_test_groups`, `pellet_test_images`)
- [x] Backend: model, repository, service, handler (full CRUD + leaderboard + stats)
- [x] 12 API endpoints wired into router + DI
- [x] Frontend: API module with typed interfaces
- [x] Frontend: dashboard page (stats, recent tests, leaderboard preview)
- [x] Frontend: new test form (rifle/pellet select, distance, conditions, groups, images)
- [x] Frontend: detail page (view/edit/delete, groups, images)
- [x] Frontend: leaderboard page (per-rifle pellet rankings)
- [x] Navigation: "Testing" item added to sidebar/bottom nav
- [x] Dashboard: pellet testing summary widget
- [x] Manual group size entry (mm + auto MOA calculation)
- [x] Distance normalization (meters/yards → canonical meters)
- [x] Leaderboard ranking logic (best group → avg → test count + consistency score)
- [x] Inline "Add Pellet" in test creation form

### PT-2 — Assisted Measurement
- [x] Image calibration tools — `ImageMeasurement.tsx` (HTML5 Canvas)
- [x] Bounding box drawing with live mm/MOA readout
- [x] Calibration line / reference ring presets (NSRA 6yd + 10m)
- [x] `PelletImageMeasurement` model + migration `000009` + CRUD
- [x] Pellet comparison view — `PelletComparison.tsx` at `/pellet-testing/compare`
- [x] Velocity / SD / spread fields on sessions
- [x] Advanced conditions fields (bench setup, scope, pressure)
- [x] Group size timeline chart — `GroupSizeTimeline.tsx` with mm/MOA toggle
- [x] Distance-normalized comparisons — `ballistics.ts` utilities

### PT-3 — Detection & Automation
- [x] Automatic hole detection (`holeDetection.ts`) with adaptive thresholding
- [x] Per-hole confidence scoring
- [x] Review/correction UI (confirm/reject flows + auto recalculation)
- [x] Annotated image generation/storage (`pellet_test_detections`, `annotated_image_id`)
- [x] Target template presets (NSRA 6yd + 10m)
- [x] Session export/reporting (JSON download)
- [x] Confidence badges (`ConfidenceBadge.tsx` + backend logic)
- [x] Batch/lot performance tracking (`/pellet-testing/batch-report`)
- [x] Site-wide pellet leaderboard (`/pellet-leaderboard`, opt-in visibility)

---

## Phase 2 — Community (Next Delivery Track)

### 2.1 Foundation APIs (highest priority)
- [ ] Social graph model + APIs (follow/following + privacy settings)
- [ ] Comments schema + APIs (threading, author metadata, moderation states)
- [ ] Activity event model + ingestion APIs (normalized actor/action/subject)
- [ ] Private leagues (invite codes, membership model, invite validation)
- [ ] Score card image upload (S3-compatible storage + metadata + access policy)

### 2.2 User CRUD & Interaction
- [ ] Follow / unfollow actions (backend + frontend)
- [ ] Score card comments (create/edit/delete + moderation hooks)

### 2.3 Feed & Ranking
- [ ] Activity feed from followed shooters + leagues
- [ ] Feed ranking and pagination strategy

### 2.4 Recognition
- [ ] Achievements/badges engine (rules, processing, display)

### 2.5 Operations & Distribution
- [ ] League admin tools (approve scores, member management, audit logs)
- [ ] Mobile app store builds (iOS + Android signing and release tracks)

---

## Phase 3 — Analytics & Growth (After Phase 2)

- [ ] Score trend analytics (time-series for scores and consistency)
- [ ] Pellet/rifle combo analytics (cross-session performance insights)
- [ ] Club pages and club-level dashboards
- [ ] Season archives and historical comparisons
- [ ] Third-party API (key-gated)
- [ ] Push notifications

---

## Non-Functional Checklist

| Requirement | Status | Next action |
|---|---|---|
| API response < 200ms | Not measured | Add latency instrumentation and baseline report |
| Initial page load < 3s | Not measured | Capture Lighthouse baseline and optimize largest bundles |
| Backend test coverage > 80% | Low / below target | Add service + handler tests and enforce threshold in CI |
| E2E tests for critical flows | Not started | Add Playwright smoke paths for auth, scoring, leagues |
| OWASP / security review | Not started | Run dependency + auth/session threat review |
| GDPR compliance | Not started | Define data retention/export/deletion policies |
| WCAG 2.1 AA | Not started | Perform accessibility audit and fix contrast/keyboard gaps |
| Offline score entry + sync | Not started | Define conflict resolution and queued sync protocol |
| `/metrics` endpoint (Prometheus) | Not started | Add metrics middleware and scrape endpoint |
| Correlation IDs in logs | Partial | Inject request IDs through middleware + structured fields |

---

## SEO

- [x] Primary meta tags (title, description, keywords, robots)
- [x] Open Graph tags (`og:type`, `og:title`, `og:description`, `og:image`, `og:site_name`)
- [x] Twitter/X card tags
- [ ] Dynamic per-page OG tags (needs `react-helmet-async` or SSR)

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
