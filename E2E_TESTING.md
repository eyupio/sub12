# Running the Playwright e2e tests

The end-to-end suite lives in [`e2e/`](e2e/) and drives a real browser against
a real backend + frontend. This page is the quickstart. For test architecture,
fixtures, and how to add new specs see [e2e/README.md](e2e/README.md).

## Quickstart (one command)

From the repo root:

```bash
# macOS / Linux / Git Bash / WSL
./scripts/e2e.sh

# Windows PowerShell
.\scripts\e2e.ps1
```

The script:

1. Starts Postgres + Redis (`make dev`) if they're not already up.
2. Seeds the dev users (`make seed`) and boots the backend on `:8080` if `/healthz` doesn't respond.
3. Boots the frontend on `:5173` if it's not already serving.
4. Installs `e2e/` deps and Chromium on first run, copies `e2e/.env.example` → `e2e/.env` if missing.
5. Shows an interactive menu — pick UI mode, headed, headless, codegen, or open the last report.

Anything the script started, the script stops on exit. Anything you had
already running stays running.

## Modes

| Menu option | Underlying command | When to use |
|---|---|---|
| **1. UI mode** *(recommended)* | `npm run test:ui` | Debug a failing test, iterate on a new one — Playwright's web UI lets you step through actions and re-run instantly. |
| **2. Headed** | `npm run test:headed` | Watch the full suite drive a real browser. |
| **3. Headless** | `npm test` | Fast full run, what CI does. |
| **4. Codegen** | `npm run codegen` | Record selectors against the running app while you click around. |
| **5. Show last report** | `npm run report` | Open the HTML report from the last run. |

Skip the menu with a flag:

```bash
./scripts/e2e.sh --mode headless
.\scripts\e2e.ps1 -Mode headless
```

Valid modes: `ui`, `headed`, `headless`, `codegen`, `report`.

## Manual run (no script)

If you'd rather run the four pieces yourself, use four terminals from the
repo root:

```bash
make dev                              # postgres + redis
cd backend && make seed && make run   # API on :8080, seeds test users
cd frontend && npm run dev            # UI on :5173
cd e2e && npm install && npm test     # run tests (first time only: npx playwright install --with-deps chromium)
```

## Test users

Created by `make seed`. Both use password `password123`:

- `admin@sub12.local` — User A (admin)
- `userb@sub12.local` — User B (regular)

The suite reuses these accounts; it does not create new users. Cleanup of
leagues/clubs/etc. created during a run happens in fixture teardown via the
admin API.

## CI

[`.github/workflows/e2e.yml`](.github/workflows/e2e.yml) runs the same suite
against `STAGING_URL`, but only via manual `workflow_dispatch` — it is **not**
part of the PR gate and does not run on a schedule. Run it yourself (or
trigger it manually from the Actions tab) when changing a flow it covers.
