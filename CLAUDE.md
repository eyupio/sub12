# CLAUDE.md — sub-12 Project Instructions

## Project Overview

sub-12 is a target shooting companion app (PWA + Capacitor) for logging 25-shot score cards, managing gear (rifles & pellets), running leagues, pellet testing with image-based measurement, clubs, achievements, and social features (follows, activity feed, comments). Monorepo with `backend/` (Go) and `frontend/` (React/TypeScript).

## Repository Structure

```
backend/              Go API server
  cmd/api/            Entrypoint (main.go)
  internal/
    api/
      handler/        HTTP handlers (one file per domain)
      middleware/      Auth (JWT extraction) and request logger
      router.go       Chi route definitions
    config/           Env-based config (envconfig struct tags)
    db/
      db.go           pgxpool connection
      migrate.go      Embedded golang-migrate runner
      migrations/     Sequential SQL migrations (000001–000019)
      redis.go        Redis client setup
      seed/           Dev seed data (seed.sql + seed.go)
    email/            Email template renderer (renderer.go)
    model/            Domain types (15 files: user, score_card, league, club, pellet, rifle, achievement, activity, image, stats, social, smtp, email_template, pellet_testing, admin)
    repository/       Data access layer (pgx queries, one file per domain)
    service/          Business logic layer (one file per domain + auth, email_sender)
frontend/             React SPA
  src/
    api/              API client modules (typed fetch wrappers per domain)
      client.ts       Base fetch client with Bearer token injection
      __tests__/      API module tests
    catalog/          Static data catalogs (pelletCatalog.ts, rifleCatalog.ts)
    components/       Shared UI components (Layout, AuthLayout, ThemeToggle, Toast, ConfirmDialog, ImageMeasurement, etc.)
    config/           App configuration (targetPresets.ts)
    pages/            Route page components (~37 pages)
      __tests__/      Page-level tests
    store/            Zustand stores (auth, theme, toast)
    utils/            Utilities (ballistics, holeDetection, date)
    routeTree.ts      TanStack Router file-based route tree
brand/                SVG brand assets
landing/              Static landing page (index.html + favicon.svg)
```

## Tech Stack

- **Backend:** Go 1.24, Chi v5 router, pgx v5, zerolog, envconfig, golang-jwt v5, go-redis v9
- **Database:** PostgreSQL 16, Redis 7
- **Frontend:** React 18, TypeScript 5.5, Vite 5, TanStack Router + Query, Zustand 4, Tailwind CSS v3, Recharts, Lucide React icons
- **Mobile:** Capacitor 6 (PWA-first, via vite-plugin-pwa)
- **Testing:** Go test + testify (backend), Vitest + Testing Library (frontend)
- **CI/CD:** GitHub Actions (ci.yml + release.yml) → GHCR container images; android.yml + ios.yml build the Capacitor apps
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
cd frontend && npm run check    # TypeScript type check (tsc --noEmit)
cd frontend && npm run lint     # ESLint
cd frontend && npm test         # Vitest (vitest run)
cd frontend && npm run build    # Production build (tsc -b && vite build)

# Mobile (Capacitor) — wraps the dist/ bundle as native Android/iOS apps.
# Native apps target https://sub12.io/api/v1 (relative /api won't resolve in a
# WebView); see frontend/README.md for prerequisites and the full workflow.
cd frontend && npm run build:mobile   # tsc -b && vite build && cap sync
cd frontend && npm run run:android    # build + launch on emulator/device
cd frontend && npm run run:ios         # macOS + Xcode only
```

Both the `android/` and `ios/` projects are committed (`ios/` was generated with
`npx cap add ios` on a Mac — it can't be created on Linux). The web assets
`cap sync` copies into the native projects are git-ignored (regenerated from
`dist/`). CI builds both: `android.yml` on a Linux runner, `ios.yml` on a
Blacksmith macOS runner.

### Production

```bash
docker compose up -d            # pulls GHCR images, runs all 4 services
docker compose logs backend     # check for migration/startup errors
```

### Top-Level Makefile

```bash
make dev    # start infra (postgres + redis) for local dev
make up     # start full stack (infra + backend + frontend containers)
make down   # stop all containers
make logs   # tail all container logs
make build  # build backend binary + frontend bundle
```

### Database Migrations

```bash
cd backend
make migrate-create NAME=add_foo   # creates next sequential migration files
make migrate-up                    # apply pending migrations
make migrate-down                  # rollback last migration
make migrate-lint                  # check for duplicate prefixes
```

Current migration count: **121** (000001–000121). Latest: `000121_league_moderators_manage_seasons`.

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

- **Routing:** TanStack Router with file-based route tree (`routeTree.ts`)
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
- Document the new env var in this file (and `AGENTS.md`), in `.env.example`, and in `docker-compose.yml`.
- Existing examples to copy: `PasswordResetURL` (used in `backend/internal/service/auth.go` `buildResetLink`), `EventInvitationURL` (used in `backend/internal/service/event_invitation.go`).

### General

- Don't add features, refactoring, or improvements beyond what is asked
- Don't add comments or docstrings to code you didn't change
- Don't create wrapper functions for one-time operations
- Prefer editing existing files over creating new ones

## API Structure

All API routes under `/api/v1/`. Health probes at root (`/healthz`, `/readyz`).

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

### Public (no auth)

- `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`
- `POST /auth/forgot-password`, `POST /auth/reset-password`
- `GET /images/{id}`
- `GET /leagues`, `GET /leagues/{id}`
- `GET /clubs`, `GET /clubs/{id}`, `GET /clubs/{id}/standings`, `GET /clubs/{id}/opening-hours`, `GET /clubs/disciplines`
  - The club directory accepts `?q=` (name, town, region or postcode), `?discipline=`, and `?lat=&lng=[&radius_km=]` to return `distance_km` and sort nearest-first. `?code=` still resolves a single club by join code and ignores the other filters.
- `GET /score-cards/{id}/comments`
- `GET /pellet-tests/public-leaderboard`

### Protected (requires `Authorization: Bearer <jwt>`)

- **Score cards:** CRUD + image upload + comments (write) + community review (`/score-cards/{id}/review-request` + `/confirm`): the owner of a public/followers personal card opens a peer-review request (drafts, private and league cards are refused); any non-owner can confirm, and at the request's `required_confirmations` the request flips to verified (guarded so racing confirms emit one event), notifying the owner. Feed activities inherit the card's visibility, and each one links to `/scores/{id}/review` — a page carrying the review progress, the reviewers who confirmed, the confirm/cancel action and the card's comments (`components/ScoreCardComments.tsx`, shared with the card detail page). Cancelling discards gathered confirmations and removes the feed post; submitting the card to a league clears both. `PATCH /score-cards/{id}` takes `league_round_id` on the "omit to keep, empty string to clear" convention: clearing it detaches the card from its round and keeps it as a personal one, which is how a shooter rescues a card whose round is full. A non-empty value must name the round the card already sits in, and `club_id` follows the same convention — joining or moving between rounds stays with `submit-to-league`, which runs the membership and cap checks (see "A card's context is never final"). The refine flow can also save a draft without graduating it, so a card with nowhere to go yet stays editable in Drafts.
- **Rifles:** CRUD + image upload + showcase (`GET /rifles/{id}/showcase`)
- **Pellets:** CRUD + image upload + showcase (`GET /pellets/{id}/showcase`)
- **Gear comparison:** `PATCH /users/me/gear-comparison` opts every owned rifle and pellet in or out at once. Per-item control is the `comparison_opt_in` field on the rifle/pellet PATCH. A showcase bundles the owner's own stats, trends, distributions and pairings with an anonymised cross-user comparison for the same make/model — built only from opted-in items owned by non-private profiles, and suppressed entirely below `model.GearMinComparisonOwners` (3) contributing owners.
- **Pellet tests:** CRUD + groups + images + measurements + detections + export + leaderboard + stats + compare + timeline + confidence + batch-report + combo-analytics
- **Leagues:** Create, join, standings, scores, score counts, config, members (incl. promote/demote moderators and re-grant their capabilities), seasons and rounds (create, rename, re-date, archive/restore and delete — see "Seasons and rounds are maintained, not just created" above), join requests, score verification (member confirm + moderator verify/amend/reject/reopen + audit trail). Leagues with `require_score_verification` off auto-verify submissions (create/graduate/submit and on config change), so cards never strand outside the standings; a threshold of 0 with verification on counts as 1. Rejected cards must be reopened before amending; an owner editing a rejected card is audited as a reopen. Non-members only see verified cards and counts. Verification outcomes notify the shooter (`score_verified`/`score_rejected`/`score_amended`).
- **Clubs:** Create, update, delete (the club owner, not just platform admins), join, members, image upload, opening hours (`PUT /clubs/{id}/opening-hours` replaces the published week). The club profile carries a real-world identity — postal address, map pin, website/email/phone, disciplines, distances, facilities, membership and visitor info, founding year — surfaced as the About panel on the club page and editable from club settings. Text profile fields follow an "omit to keep, empty string to clear" convention; arrays clear with `[]`; coordinates clear only via `clear_coordinates`. Disciplines are validated against `model.ClubDisciplines`.
- **Moderators and delegated capabilities:** see "Moderator roles" above. `send_announcements` is in both catalogues and is never granted by default. `GET /leagues/{id}/moderator-permissions` and `GET /clubs/{id}/moderator-permissions` return the delegable catalogue plus the caller's own role; `PATCH .../members/{userId}` promotes, demotes and re-grants.
- **Feature board:** `GET /feature-requests` (recent) and `/feature-requests/ranking` (most-voted) list the ideas visible to the viewer — platform ideas for everyone, league/club ideas for members of that league or club. `POST /feature-requests/{id}/vote` toggles the viewer's upvote, `/comments` carries the discussion, and `GET /feature-requests/{id}/events` returns the request's history (created, status, priority and owner changes). Rows come back enriched with requester, owner, scope *name* and vote/comment counts so the board never renders a raw ID. New ideas are not created here: the board's composer opens a `feature`-category support ticket, which an admin refines onto the board via `POST /admin/tickets/{id}/feature-request`. Admins set `status` and `priority` with `PATCH /admin/feature-requests/{id}`; both changes are recorded in the history. The UI collapses the eight statuses into five stages (under review, planned, in progress, shipped, not planned) defined once in `frontend/src/utils/featureBoard.ts`.
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
- **Activity simulation:** Settings (get/patch), status, run-now (configurable batch size with per-action breakdown), personas (list/edit/delete/purge), cleanup (trim to target), audit log. Provisions flagged (`is_simulated`) accounts that post/like/comment/follow/unfollow/share via the normal service paths; paced by a background runner with hourly time-of-day shaping, disabled by default. Per-action counters, last-error, and tick-health surfaced in status; admin operations recorded in `simulation_audit`. Simulated users are flagged in the admin user list (badge + hide filter) and on public profiles. An `include_in_public_stats` toggle excludes simulated content from the public feed and pellet leaderboard.

  Personas are built to read as people rather than as a bot roster (see "Simulation realism" below for how, and which parts are admin-tunable).

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
| `DB_SSLMODE` | `disable` | libpq TLS mode; set to `require` (or `verify-full`) in production |
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

## CI Pipeline

Four GitHub Actions workflows:

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
  `ANDROID_VERSION_NAME`, read in `android/app/build.gradle`

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
- `ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme` is committed —
  `xcodebuild -scheme App` needs a *shared* scheme, and Xcode only writes a
  per-user one by default.

### release.yml (push to `main`)

- Builds and pushes backend + frontend Docker images to GHCR
- Tags: `sha-<commit>` + `latest`
- Uses Docker Buildx with GitHub Actions cache

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
  `.animate-pop` (value changes), `.u-stagger` (sequenced list children).
- **Interaction utilities** — `.u-lift` (cards that link somewhere), `.u-press`
  (buttons and icon controls), `.u-nudge` (nav and list rows), `.u-sheen`
  (primary CTAs), `.u-hairline`, `.u-tnum`, `.u-text-gold-gradient`.
- **Touch targets** — on `pointer: coarse` every button gets `min-height: 40px`.
  A control whose drawn size *is* the design (a pill switch, a round icon badge
  over an image) must carry `.tap-target`, or that floor stretches the circle
  into an ellipse; the class keeps the box and moves the 40px touch area onto a
  centred pseudo-element. `.no-min-target` opts out with no replacement area.
- **Component classes** — `.btn` + `.btn-primary/secondary/ghost/danger` +
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
  would reset the router. Android targets SDK 35, so `android/app/src/main/
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

- `ghcr.io/jnnngs/sub-12-backend:latest`
- `ghcr.io/jnnngs/sub-12-frontend:latest`
- Tag with `IMAGE_TAG` env var in `docker-compose.yml` for pinned deploys
- Production frontend nginx proxies `/api/` to backend container (no host port exposed for backend)
