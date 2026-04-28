# sub-12 E2E tests

Playwright + TypeScript end-to-end tests, decoupled from the main app build.
This package has its own deps, scripts, and lockfile. Nothing in the main
`frontend/` or `backend/` packages depends on anything in here.

## First-time local setup

```bash
cd e2e
npm install
npx playwright install --with-deps chromium
cp .env.example .env
# edit .env to point at the running app + supply test user creds
```

Make sure the app is running locally:

```bash
# from the repo root, in three terminals
make dev                              # postgres + redis
cd backend && make seed && make run   # API on :8080, seeds test users
cd frontend && npm run dev            # UI on :5173
```

Test users that must exist (created by `make seed`):

- `admin@sub12.local` / `password123` — User A (admin role)
- `userb@sub12.local` / `password123` — User B (regular user)

## Daily commands

| Command | What it does |
|---|---|
| `npm test` | Run the whole suite headless |
| `npm run test:ui` | Open Playwright UI mode (best for debugging / iteration) |
| `npm run test:headed` | Run headed, watch the browser |
| `npm run test:league` | Just the league specs |
| `npm test tests/league/league-lifecycle.spec.ts` | Single spec |
| `npm test -- -g "invalid invite"` | Filter by test name |
| `npm run codegen` | Open Playwright codegen against `BASE_URL` |
| `npm run report` | Open the last HTML report |
| `npm run typecheck` | tsc strict pass over the e2e package |
| `npm run lint` | ESLint |

## Debugging

- **UI mode** (`npm run test:ui`) lets you step through actions, see the DOM
  snapshot at each step, and re-run individual tests instantly.
- **Traces** are recorded `on-first-retry` in `playwright.config.ts`. After a
  failure: `npx playwright show-trace test-results/<run>/trace.zip`.
- **Codegen** records actions into a draft script — useful when you're not
  sure what selector to use for a new feature: `npm run codegen` (it'll open
  Chromium against `BASE_URL`).

## How to add tests for a new feature

The league suite is the reference implementation. To add coverage for, say,
events:

1. **POMs** — copy `pages/league/` to `pages/event/`. One file per screen,
   one method per intent (`createEvent(name)`, not `clickCreateButton()`).
   Re-export from `pages/event/index.ts`.
2. **Factory fixture** — copy `fixtures/leagueFactory.ts` to
   `fixtures/eventFactory.ts`. The factory creates entities via API for fast
   setup and cleans up in the after-hook regardless of test outcome.
3. **Specs** — under `tests/event/`, add `event-lifecycle.spec.ts` (the happy
   path) and `event-edge-cases.spec.ts` (errors, permissions, validation).
   Import `test` from `fixtures/eventFactory` (or `fixtures/gear` if you need
   per-user gear pre-seeded too).
4. **API helpers** — add the new domain methods to `helpers/api.ts`. Keep
   them typed; we forbid `any`.
5. **Selectors** — if the feature ships without `data-testid` on critical
   elements, log them in `SELECTORS_TODO.md` so the app team knows what to
   add.

The whole point of the layout is that adding a new domain is mechanical —
copy the league directory, rename, change selectors. No architectural
decisions per feature.

## Test data and the cleanup contract

Every test creates uniquely-named entities (`uniqueName('e2e-foo')` →
`e2e-foo-20260428T101530-a3f2c1`). Cleanup runs in `afterEach` /
`afterAll` / fixture teardown — even when a test fails — using the API
client (no UI needed). User A is admin, so it can `DELETE
/api/v1/admin/leagues/{id}` to wipe leagues created by either user.

Things the tests **do not** create:

- The two test users themselves (seeded by `make seed`).
- The Postgres database (assumed to exist and be migrated).

Things to know:

- The suite is parallel-safe — every entity name is unique per run.
- Auth state is captured once in `auth/global-setup.ts` and reused through
  storage state. We bypass the UI login form on purpose; it has its own
  dedicated tests.
- `BASE_URL` defaults to `http://localhost:5173`. CI overrides it to
  staging via the `STAGING_URL` secret.

## Open questions / known gaps

See [SELECTORS_TODO.md](SELECTORS_TODO.md). The big ones:

- No `data-testid` anywhere in the app today — selectors lean on visible
  text.
- "End / finalise league" UI does not exist; the lifecycle spec stops at
  "standings reflect submitted scores."
