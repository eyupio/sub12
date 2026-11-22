# Demo recordings and video guides

How the demo recordings are made, cut and registered. The storyboards and caption lines are in `docs/demo-recordings.md`. It appends to the root `CLAUDE.md` and never overrides it; sections the text names but that are not here (for example "Placeholder credentials are refused" or "Outgoing public URLs") are in `CLAUDE.md`.

## Demo Recordings & Video Guides

Short screen recordings of the real app with the narration baked into the
frames as overlay text (title card, lower-third captions, cursor dot), in two
kinds: **showcase** (the pitch — what the app does) and **how-to** (the
instruction — how you do it). Both play on the landing page and on `/help`.
Nothing is edited by hand — every video is reproducible with one command
whenever the UI it shows changes.

- `docs/demo-recordings.md` is the catalog: production standard, storyboards
  and exact caption lines. New video = storyboard there first.
- `e2e/demos/` is the recorder — a Playwright project separate from the e2e
  suite (own config, one worker, video always on, human-pace slowMo). Specs
  seed their own data through the API under `demo@sub12.local` and film
  against the same local stack as `scripts/e2e.sh`. Posters are screenshots
  the spec takes at its best moment (`demo.saveMoment()`); Playwright's
  bundled ffmpeg only encodes VP8, so frames can't be extracted afterwards.
- **The film is cut back to its title card.** Playwright films the whole life
  of the page, so the seeding, the sign-in and the app's first load all land
  on the front of the recording — ~26 seconds of blank white and then of a
  motionless page, against a dev stack. Pressing play on the landing page and
  getting a white rectangle followed by a still screenshot is exactly what a
  broken player looks like, and it is what shipped. `Overlay` now records
  `filmStartMs` (when the first title card or caption went up) and the fixture
  hands it to `trimRecording()` in `e2e/demos/trimVideo.ts`, which rewrites the
  webm to start there. The cut never re-encodes — it opens the film on the last
  keyframe before the mark and drops the still frames after it — so a marketing
  asset never picks up generation loss, at the price of the ≤5s of lead-in that
  keyframe spacing leaves behind.
- `./scripts/record-demos.sh [slug]` boots the stack if needed, records, and
  publishes webm + poster jpeg into `frontend/public/demos/` (served at
  `/demos/…`, committed to the repo, deliberately not in the PWA precache and
  not in nginx's immutable-cache block so re-recordings propagate).
- `frontend/src/catalog/videoGuides.ts` is the one place a recording is
  registered. `available: true` promises the files are shipped — a test fails
  if the webm or poster is missing — and only available entries render, so a
  planned video can sit in the catalog without dangling a broken player.
- Surfaces, all four fed from that one catalog:
  - `components/VideoGuides.tsx` — the rail + modal player on `/help`.
  - `pages/LandingPage.tsx` — the `#demos` "See it in action" section. This is
    the page actually served at `https://sub12.io/`, so it is the only one of
    these a visitor sees **before signing in**; `/help` is an `appRoute` child
    and every other surface is behind auth. A recording that isn't here is a
    recording no prospective user will ever watch. Its players are
    `preload="none"` — the files run to several MB each and the posters carry
    the section until somebody presses play.
  - `landing/index.html` — the standalone static landing page, which is
    deployed separately (nothing in `docker-compose.yml` or CI builds it) and
    so must reference the videos by absolute `https://sub12.io/demos/…` URL.
    Editing it is not editing what sub12.io serves.
  - `README.md` — `<video>` players sourced from this repository's own raw
    URLs, so the recordings play on GitHub without a site visit or a login.
- **`/demos/` is on the service worker's `navigateFallbackDenylist`**
  (`frontend/vite.config.ts`). A `/demos/x.webm` URL is a file, not a router
  path, and opening one directly — from the README, or from a shared link — is
  a *navigation*. Left off the denylist the worker answers it with
  `index.html`, and the router, which has no `/demos` route, renders "Target
  not found". nginx serves the file correctly throughout, so the 404 appears
  only for visitors who had already loaded the site once, and never in a
  server log.
