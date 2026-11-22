# API route reference

The public, protected and admin route lists with the rules attached to them. `backend/internal/api/router.go` is still the authoritative map. It appends to the root `CLAUDE.md` and never overrides it; sections the text names but that are not here (for example "Placeholder credentials are refused" or "Outgoing public URLs") are in `CLAUDE.md`.

### Public (no auth)

- `POST /auth/register`, `POST /auth/login`, `POST /auth/login/2fa`, `POST /auth/refresh`, `POST /auth/logout`
- `POST /auth/forgot-password`, `POST /auth/reset-password`
  - Every password-bearing endpoint above is rate-limited per IP (`rl.Limit("auth")`). `refresh` and `logout` are deliberately unbounded, so ordinary token refresh from a shared IP is never throttled by somebody else's login attempts.
- `GET /site/settings` — this deployment's branding, fetched by every visitor before the shell paints. `GET /setup/status` and `POST /setup` are the once-only first-run wizard (`setup` is rate-limited under the `auth` bucket) — see "A deployment owns its own identity"
- `GET /images/{id}`
- `GET /faqs`, `GET /faqs/{slug}`
- `GET /leagues`, `GET /leagues/{id}`
- `GET /clubs`, `GET /clubs/{id}`, `GET /clubs/{id}/standings`, `GET /clubs/{id}/opening-hours`, `GET /clubs/disciplines`
  - The club directory accepts `?q=` (name, town, region or postcode), `?discipline=`, and `?lat=&lng=[&radius_km=]` to return `distance_km` and sort nearest-first. `?code=` still resolves a single club by join code and ignores the other filters.
- `GET /score-cards/{id}/comments`
- `GET /pellet-tests/public-leaderboard`

### Protected (requires `Authorization: Bearer <jwt>`)

- **Score cards:** CRUD + image upload + comments (write) + community review (`/score-cards/{id}/review-request` + `/confirm`): the owner of a public/followers personal card opens a peer-review request (drafts, private and league cards are refused); any non-owner can confirm, and at the request's `required_confirmations` the request flips to verified (guarded so racing confirms emit one event), notifying the owner. Feed activities inherit the card's visibility, and each one links to `/scores/{id}/review` — a page carrying the review progress, the reviewers who confirmed, the confirm/cancel action and the card's comments (`components/ScoreCardComments.tsx`, shared with the card detail page). Cancelling discards gathered confirmations and removes the feed post; submitting the card to a league clears both. `PATCH /score-cards/{id}` takes `league_round_id` on the "omit to keep, empty string to clear" convention: clearing it detaches the card from its round and keeps it as a personal one, which is how a shooter rescues a card whose round is full. A non-empty value must name the round the card already sits in, and `club_id` follows the same convention — joining or moving between rounds stays with `submit-to-league`, which runs the membership and cap checks (see "A card's context is never final"). The refine flow can also save a draft without graduating it, so a card with nowhere to go yet stays editable in Drafts.
- **Gallery:** `GET /users/me/gallery` lists every uploaded photo the caller
  owns — score cards (with league/club/event submission context resolved to
  names), rifles, pellets and pellet-test images — newest first. The
  `/gallery` page renders it with a top-shots showcase, kind/submission
  filters, and submit-to-league / submit-to-event / withdraw actions.
- **Rifles:** CRUD + image upload + showcase (`GET /rifles/{id}/showcase`)
- **Pellets:** CRUD + image upload + showcase (`GET /pellets/{id}/showcase`)
- **Gear comparison:** `PATCH /users/me/gear-comparison` opts every owned rifle and pellet in or out at once. Per-item control is the `comparison_opt_in` field on the rifle/pellet PATCH. A showcase bundles the owner's own stats, trends, distributions and pairings with an anonymised cross-user comparison for the same make/model — built only from opted-in items owned by non-private profiles, and suppressed entirely below `model.GearMinComparisonOwners` (3) contributing owners.
- **Pellet tests:** CRUD + groups + images + measurements + detections + export + leaderboard + stats + compare + timeline + confidence + batch-report + combo-analytics
- **Leagues:** Create, join, standings, scores, score counts, config, members (incl. promote/demote moderators and re-grant their capabilities), seasons and rounds (create, rename, re-date, archive/restore and delete — see "Seasons and rounds are maintained, not just created" above), join requests, score verification (member confirm + moderator verify/amend/reject/reopen + audit trail). Leagues with `require_score_verification` off auto-verify submissions (create/graduate/submit and on config change), so cards never strand outside the standings; a threshold of 0 with verification on counts as 1. Rejected cards must be reopened before amending; an owner editing a rejected card is audited as a reopen. Non-members only see verified cards and counts. Verification outcomes notify the shooter (`score_verified`/`score_rejected`/`score_amended`).
- **Clubs:** Create, update, delete (the club owner, not just platform admins), join, members, image upload, opening hours (`PUT /clubs/{id}/opening-hours` replaces the published week). The club profile carries a real-world identity — postal address, map pin, website/email/phone, disciplines, distances, facilities, membership and visitor info, founding year — surfaced as the About panel on the club page and editable from club settings. Text profile fields follow an "omit to keep, empty string to clear" convention; arrays clear with `[]`; coordinates clear only via `clear_coordinates`. Disciplines are validated against `model.ClubDisciplines`.
- **Moderators and delegated capabilities:** see "Moderator roles" above. `send_announcements` is in both catalogues and is never granted by default. `GET /leagues/{id}/moderator-permissions` and `GET /clubs/{id}/moderator-permissions` return the delegable catalogue plus the caller's own role; `PATCH .../members/{userId}` promotes, demotes and re-grants.
- **Feature board:** `GET /feature-requests` (recent) and `/feature-requests/ranking` (most-voted) list the ideas visible to the viewer — platform ideas for everyone, league/club ideas for members of that league or club. `POST /feature-requests/{id}/vote` toggles the viewer's upvote, `/comments` carries the discussion, and `GET /feature-requests/{id}/events` returns the request's history (created, status, priority and owner changes). Rows come back enriched with requester, owner, scope *name* and vote/comment counts so the board never renders a raw ID. New ideas are not created here: the board's composer opens a `feature`-category support ticket, which an admin refines onto the board via `POST /admin/tickets/{id}/feature-request`. Admins set `status` and `priority` with `PATCH /admin/feature-requests/{id}`; both changes are recorded in the history. The UI collapses the eight statuses into five stages (under review, planned, in progress, shipped, not planned) defined once in `frontend/src/utils/featureBoard.ts`.
- **Events:** A shoot other people enter, addressed by `slug` rather than UUID. `POST`/`GET /events`, `/events/{slug}` and its participants, guests, scorers (delegated card-verification duty), invitations (`/events/invitations/{token}` + `/accept`, `/decline`), scores, scoreboard, `results.csv`, `promote` and per-card `confirm`/`amend`/`reject`. Cards reach an event through `submit-to-event` — see "A card's context is never final".
- **Posts:** The social feed's own content — `POST`/`GET /posts`, `/posts/share` (share an entity into the feed), `/posts/{id}/comments`, `/like`, and `/flag`/`/unflag`. Writes are rate-limited (`RATELIMIT_POST_PER_MIN`, `_COMMENT_`, `_LIKE_`).
- **Moderation:** `POST /reports` raises a report on a post, comment or user; an admin decides it at `/admin/reports/{id}/decide`. A flagged row is hidden by the background sweeper only after `MODERATION_FLAG_GRACE`, so the author gets a chance to amend first.
- **Privacy:** `/users/me/blocks` and `/users/me/mutes`. Both are applied in the feed query itself (`repository/activity.go`), and a block is symmetric — neither side sees the other. Announcements are exempt: they come from a group the user joined, not a person they chose to hear from.
- **Support & FAQ:** Support tickets carry the help desk and are the only way a feature request is born (see "Feature board"). Admins work the queue at `/admin/tickets` (`status`, `assign`, `feature-request`). `GET /faqs` and `/faqs/{slug}` are public; admins edit and reorder them under `/admin/faqs`.
- **Two-factor:** `/users/me/2fa/status`, `/enroll/begin`, `/enroll/confirm`, `/disable`, `/backup-codes/regenerate` (TOTP via `pquerna/otp`). Login with 2FA on completes at `POST /auth/login/2fa`.
- **Locations & categories:** `/locations` are the user's saved places — the first rule in "Naming a picked location". `/categories` are the shared taxonomy admins maintain at `/admin/categories`.
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
- **Events:** List, get, update, delete (`/admin/events`)
- **Reports:** Queue and `POST /admin/reports/{id}/decide`; `/admin/activities/{id}` hides and `/unhide` restores a feed row
- **FAQ:** CRUD plus `reorder-sections` / `reorder-items`
- **Categories:** CRUD for the shared taxonomy
- **Feature board:** `PATCH /admin/feature-requests/{id}` and `POST /admin/tickets/{id}/feature-request` — see "Feature board"
- **Announcements:** `POST /admin/announcements` sends platform-wide — see "Announcements"
- **Branding:** `GET`/`PATCH /admin/site-settings` and `POST`/`DELETE /admin/site-settings/logo` edit everything the setup wizard asked. The logo lives here rather than in the wizard because uploading one needs an account and setup runs before there is one
- **Sitemap & SEO:** `/admin/sitemap/stats` reports what is eligible and served, `/ping` submits to IndexNow, `/submissions` is the log, `/indexnow-key` shows the key — see "Indexable surface"
- **Backup:** `/admin/backup/settings` (+ `test-s3`), `run`, `runs`, download and restore. Dumps are gzipped and AES-encrypted with a passphrase-derived key before upload, so a run without a configured passphrase fails rather than shipping plaintext.
- **Activity simulation:** Settings (get/patch), status, run-now (configurable batch size with per-action breakdown), personas (list/edit/delete/purge), cleanup (trim to target), audit log. Provisions flagged (`is_simulated`) accounts that post/like/comment/follow/unfollow/share via the normal service paths; paced by a background runner with hourly time-of-day shaping, disabled by default. Per-action counters, last-error, and tick-health surfaced in status; admin operations recorded in `simulation_audit`. Simulated users are flagged in the admin user list (badge + hide filter) and on public profiles. An `include_in_public_stats` toggle excludes simulated content from the public feed and pellet leaderboard.

  Personas are built to read as people rather than as a bot roster (see "Simulation realism" below for how, and which parts are admin-tunable).
