# Documentation

Long-form notes that would bloat [CLAUDE.md](../CLAUDE.md) but that you'd want
before touching the thing they describe.

## Start here

| | |
|---|---|
| [**CLAUDE.md**](../CLAUDE.md) | The single source of truth. Architecture, layer boundaries, conventions, and the reasoning behind rules that look arbitrary until you know the outage that produced them. Read before a substantial change. |
| [**CONTRIBUTING.md**](../CONTRIBUTING.md) | Getting set up, what CI checks, and what gets flagged in review. |
| [**SECURITY.md**](../SECURITY.md) | Reporting a vulnerability, what a self-hoster owns, and the hardening that's already in place. |
| [**README.md**](../README.md) | Features, installation, self-hosting. |

## In this folder

| | |
|---|---|
| [demo-recordings.md](demo-recordings.md) | The production standard and storyboard catalog for the narrated screen recordings on the landing page and `/help`. A new video starts with a storyboard here. |
| [mobile-store-readiness.md](mobile-store-readiness.md) | What's still needed before the iOS and Android builds can be submitted to the app stores. |
| [activity-simulation-followups.md](activity-simulation-followups.md) | Outstanding work on the simulated-persona engine that populates a demo instance. |

## Elsewhere in the repo

| | |
|---|---|
| [E2E_TESTING.md](../E2E_TESTING.md) | One-command quickstart for the Playwright suite. It is **not** in the PR gate, so run it yourself when you touch score capture, leagues, events or clubs. |
| [frontend/README.md](../frontend/README.md) | Capacitor prerequisites, one-time iOS setup, icon and splash generation, and the full native asset workflow. |
| [brand/README.md](../brand/README.md) | Colour palette and which logo file to use where. Brand assets are **not** covered by the code licence. |
| [.jules/](../.jules) | Engineering journals — recurring bug and vulnerability patterns found in this codebase, written up so the next person recognises the shape. Worth skimming `sentinel.md` before touching auth or uploads. |

## Where the answer usually is

Layer directories hold one file per domain, named after the domain, so the file
you want is normally the domain name — `league.go`, `leagues.ts`.

- **What routes exist?** `backend/internal/api/router.go` is the one map of the
  whole API. Read it rather than a summary.
- **What's the current migration head?** `ls backend/internal/db/migrations | tail`.
  Never a number written down in a document.
- **Which pages are public?** `frontend/src/routeTree.tsx` — the choice between
  `rootRoute`/`authRoute` and `appRoute` decides whether a page can be indexed.
- **What can a league moderator do?** `backend/internal/model/moderator.go`.
- **Why does this config field exist?** `backend/internal/config/config.go`, where
  every field carries the reason.
