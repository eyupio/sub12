# Demo screen recordings

Short screen recordings of the real app, with overlay text baked into the
video, in two kinds:

- **Showcase** — ~30–45s, no prerequisites, sells a capability. Shown on the
  landing page ("See it in action") and reusable for social/store listings.
- **How-to** — ~45–90s, teaches one task start to finish. Shown on `/help`
  alongside the FAQ articles, and linkable from support replies.

Every video is produced by the recorder in `e2e/demos/` — a Playwright
harness that drives the real UI against a seeded local stack and injects the
overlays (title card, lower-third captions, cursor dot) into the page while
recording. Nothing is edited by hand afterwards, so a video is regenerated
with one command whenever the UI it shows changes.

## Production standard

| Property | Value |
|---|---|
| Resolution | 1280×720 (desktop viewport). Mobile variants at 390×844 are a later pass. |
| Format | WebM (VP8), no audio — captions carry the narration, so the video works muted, which is how phones autoplay it |
| Naming | `frontend/public/demos/<slug>.webm` + `<slug>.jpg` poster, served at `/demos/…` |
| Title card | Full-frame intro: kind label, title, SUB12 lockup — ~2.5s |
| Captions | Lower-third bar, one sentence at a time, dark panel with brass accent, ≥1.8s per line |
| Cursor | Injected dot that tracks the pointer and pulses on click (Playwright records no OS cursor) |
| Pacing | Deliberate: pauses after navigation, slow typing, a beat on the end state |
| Data | Demo account `demo@sub12.local` seeded fresh by the recorder via the API — realistic names, no `e2e-…` prefixes on screen |
| End card | The outcome statement + where to find the feature |

Keep each file under ~3 MB (short, 720p VP8 manages this) — they are
committed to the repo and shipped in the frontend image.

## Catalog

| # | Slug | Kind | Title | Length | Status |
|---|---|---|---|---|---|
| 1 | `howto-add-gear` | how-to | Add your rifle and pellets | 0:52 | **recorded** |
| 2 | `howto-first-card` | how-to | Log your first score card | 0:41 | **recorded** |
| 3 | `showcase-score-card` | showcase | A 25-shot card, start to finish | 0:46 | **recorded** |
| 4 | `howto-join-league` | how-to | Join a league and submit a card | 1:32 | **recorded** |
| 5 | `howto-run-league` | how-to | Run a league: seasons, rounds, verification | 1:48 | **recorded** |
| 6 | `showcase-league` | showcase | Your league, live standings | 0:44 | **recorded** |
| 7 | `howto-pellet-test` | how-to | Test pellets: photograph and measure a group | 0:58 | **recorded** |
| 8 | `showcase-pellet-testing` | showcase | Photograph the target, read the group | 1:16 | **recorded** |
| 9 | `showcase-analytics` | showcase | Know exactly what's working | 1:38 | **recorded** |
| 10 | `howto-install-pwa` | how-to | Install SUB12 on your phone | ~40s | planned — browser chrome can't be captured by the in-page recorder; needs a device capture |

## Storyboards

Overlay lines are the exact caption text; keep them under ~60 characters so
the lower third never wraps to three lines.

### 1. `howto-add-gear` — Add your rifle and pellets

Login as demo user with empty gear. Steps → captions:

1. Dashboard → *"Everything starts with your gear."*
2. Open Gear page → *"Open Gear from the menu."*
3. Add rifle, pick make/model from catalog → *"Pick your rifle — the specs fill themselves in."*
4. Save, rifle card appears → *"Saved. Scope, calibre and specs all recorded."*
5. Add pellet the same way → *"Now the pellets you shoot with it."*
6. End on gear list → *"Gear done — every card you log now knows what you shot it with."*

### 2. `howto-first-card` — Log your first score card

Demo user with gear already present.

1. Dashboard → *"Time to log your first card."*
2. New score card → *"25 shots, a rifle, a pellet — that's a card."*
3. Pick rifle/pellet/distance → *"Tell it what you're shooting today."*
4. Enter scores by tapping → *"Tap each shot as you go — or after the detail."*
5. Total updates live → *"The card keeps count for you."*
6. Save → card detail → *"Saved. Stats, averages and trends update instantly."*

### 3. `showcase-score-card` — A 25-shot card, start to finish

Same flow as #2 but faster cuts, fewer captions, punchier copy:
*"Log every shot."* → *"25 shots. One card."* → *"Averages, bulls, splits — done for you."*

### 4. `howto-join-league` — Join a league and submit a card

Seeded league with a join code and an open round; demo user has a card.

1. Leagues page → *"Leagues rank your cards against your rivals'."*
2. Join with code → *"Got a code from your league? Enter it here."*
3. League page, standings → *"You're in — here's the table."*
4. Submit a card to the round → *"Send a card to the open round."*
5. Standings update → *"Your score is in the standings the moment it's verified."*

### 5. `howto-run-league` — Run a league

Filmed as the league owner, with two members' pending cards seeded:

1. League page → *"Your league's engine room is behind the settings gear."*
2. Settings → Seasons & Rounds → *"Each season holds its rounds — add the winter one."*
3. Add season "Winter 2026", add "Round 1" → *"Rounds can open and close on a schedule — or stay open."*
4. Back to the league → *"Two cards are waiting for review."* → review banner
5. Open a pending card → *"Happy with the card? Confirm it and it counts."* → Confirm Score
6. Standings → *"The table only ever shows scores you have signed off."*

### 6. `showcase-league` — Your league, live standings

Three members with verified cards seeded; filmed as an ordinary member.
Standings table → Form → History → Submitted Scores, punchy captions.

### 7–8. Pellet testing

The "photograph" is generated by the recorder itself (`e2e/demos/pelletFlow.ts`):
a paper-coloured card with faint printed rings, five dark ~5.5mm holes and a
solid scale bar the script calibrates as 5.5cm. The design is tuned to the
hole detector's rules — decorative print stays above the local threshold,
the scale bar's blob overshoots the size gate — so AUTO DETECT reliably finds
exactly the five holes. The how-to walks the full wizard (equipment,
conditions, photo, calibrate, auto-detect, save); the showcase runs the same
flow at pace and ends on the pellet-testing overview.

### 9. `showcase-analytics` — Know exactly what's working

`seedHistory()` back-dates ~9 weeks of cards with a climbing average
(deterministic, so re-recordings draw the same charts). Dashboard → Score
Trends (weekly/monthly) → rifle showcase charts.

### 10. `howto-install-pwa` (planned)

The install prompt lives in browser chrome, outside the page, so this one is
a real device capture, not a harness job.

## Portrait variants

`*.mobile.ts` specs record at 390×844 (phone frame, touch enabled) under the
`demos-mobile` Playwright project — run them with
`npx playwright test --config demos/playwright.config.ts --project demos-mobile`
(or they're included in a full `record-demos.sh` run). The overlay drops a
size and the caption sits above the bottom tab bar on narrow frames.

| Slug | Source flow | Length | Use |
|---|---|---|---|
| `showcase-score-card-mobile` | showcase-score-card | 0:44 | App-store preview, social |
| `showcase-pellet-testing-mobile` | showcase-pellet-testing | 0:35 | App-store preview, social |

These are **assets, not catalog entries** — they ship in
`frontend/public/demos/` for store listings and social cuts (see
`docs/mobile-store-readiness.md`), and are deliberately not rendered on
`/help` or the landing page, whose players are sized for 16:9.

## Recording

```bash
./scripts/record-demos.sh              # boots stack if needed, records all
./scripts/record-demos.sh howto-first-card   # just one slug
```

The script reuses the `scripts/e2e.sh` stack conventions (postgres + redis via
docker compose, seeded backend on :8080, Vite on :5173), then runs the
Playwright project in `e2e/demos/`. Output lands in `e2e/demo-output/` and is
copied into `frontend/public/demos/`. Each spec captures its own poster jpeg
at its most representative moment via `demo.saveMoment()` (Playwright's
bundled ffmpeg can only encode VP8, so poster frames can't be extracted from
the webm afterwards).

Each demo spec seeds its own data through the API (see `e2e/demos/setup.ts`)
under the dedicated `demo@sub12.local` account, and tears the account's
content down afterwards, so recordings are repeatable and never show stale
state.

## Where the videos surface

- **Landing page** — `frontend/src/pages/LandingPage.tsx`, the `#demos` "See it
  in action" section. This is the page served at `https://sub12.io/` and the
  only surface a visitor reaches *before signing in*, so it plays every
  available recording, showcase and how-to alike, straight from the catalog.
  Players are `preload="none"`: posters until somebody presses play.
- **Standalone landing** — `landing/index.html` carries the same section for
  the separately-deployed static page, and must use absolute
  `https://sub12.io/demos/…` URLs because it isn't served from the app origin.
- **Help & FAQ** — `/help` renders a "Video guides" rail from
  `frontend/src/catalog/videoGuides.ts`; each entry names the FAQ category it
  belongs beside. Only entries whose `available` flag is true are rendered, so
  a planned video can sit in the catalog without dangling a broken player.
- **README** — `<video>` players sourced from the repo's own raw URLs, so the
  recordings play on GitHub with no site visit and no login.
- Support replies can link a video directly: `https://sub12.io/demos/<slug>.webm`.
  That link only survives because `/demos/` is on the service worker's
  `navigateFallbackDenylist` in `frontend/vite.config.ts` — without it the
  worker answers the navigation with the SPA shell and the visitor gets the
  router's "Target not found" page instead of the video.

Adding a new video = storyboard here → spec in `e2e/demos/` → run the script
→ add the catalog entry (the landing page and `/help` pick it up from there;
add a card to `landing/index.html` and the README by hand).
