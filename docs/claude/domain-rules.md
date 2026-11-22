# Domain rules

The rules behind share URLs, card context, locations, seasons and rounds, moderator roles, notifications, announcements, deployment identity and the indexable surface. Read the section for the area you are changing. It appends to the root `CLAUDE.md` and never overrides it; sections the text names but that are not here (for example "Placeholder credentials are refused" or "Outgoing public URLs") are in `CLAUDE.md`.

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
- **Events** follow the same pattern: `POST /score-cards/{id}/submit-to-event`
  (body `event_slug`) attaches a personal card to the caller's own entry in a
  live card-submission event — enforcing the one-finalised-card-per-entry rule
  and the event's image rule — and `PATCH` with `event_participant_id: ""`
  withdraws it again. A league card must be detached before an event can claim
  it, and vice versa; a card never sits in both.
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
- **A control the viewer's grant doesn't cover is drawn read-only, with the
  reason.** Reaching the settings page means being a moderator; it does not
  mean holding every capability on it, and each section saves through a
  different one — `manage_settings` for the league record (name, description,
  privacy, image, join code, scoring config, regional defaults),
  `manage_seasons` for the calendar, `manage_members` for the roster and the
  join-request queue, `manage_moderators` for roles. Gating the page as a
  whole and rendering every section live is what produced the original
  complaint: the forms accepted input and each save came back "Failed to save
  league" with nothing to explain it. `LeagueSettings.tsx` passes each section
  the capability its own endpoint checks; the fields stay visible (a moderator
  may need to read them), the submit disappears, and `CapabilityNote` says
  which permission is missing and who grants it.

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

### A deployment owns its own identity

`site_settings` is a singleton row (id = 1, the same shape as `smtp_settings`)
holding what *this installation* is: its name, tagline, logo, accent colours,
boot theme, welcome copy, whether registration is open, and whether it presents
as a community or as one club's own site. The first-run wizard at `/setup`
writes it; `pages/AdminBranding.tsx` edits it afterwards.

- **The wizard is once-only, and the backend is what enforces that.**
  `POST /api/v1/setup` and `POST /api/v1/setup/restore` are unauthenticated by
  necessity — a fresh install has
  nobody to authenticate as — so the guard has to hold against a caller who
  never loads the page. `SiteSettingsService.CompleteSetup` checks
  `UserRepository.AdminExists`, then *claims* the deployment with a conditional
  `UPDATE … WHERE setup_completed_at IS NULL` that exactly one concurrent
  caller can win, and only the winner creates an account. A claim that then
  fails (a duplicate email, most likely) is released, or a mistyped address
  would brick the wizard with no account to log in with. The endpoint is
  rate-limited under the `auth` bucket alongside the other credential paths.
- **A fresh install may restore instead of creating a temporary account.** The
  setup screen accepts an encrypted SUB12 archive and its passphrase, then uses
  the same setup claim before calling `BackupService`. The passphrase is not
  saved into the new database; the restored `backup_settings` row remains the
  source of truth. The route rejects a live deployment before reading the large
  body and shares the restore-specific 512 MiB/30-minute proxy limits.
- **Setup returns no tokens.** The wizard signs in through the ordinary
  `POST /auth/login` with the credentials it just set, so the refresh cookie,
  the rate limiter and the 2FA path are the ones every later session uses.
- **Migration 000123 stamps an existing deployment as complete** if the `users`
  table has anything in it. Without that, upgrading drops a running site onto a
  setup screen. `scripts/install.sh` now defaults to *not* seeding an admin from
  `.env`, because seeding one is precisely what closes the wizard.
- **`ENV`-level config is unaffected.** Branding is per-deployment data, not
  configuration: there is no env var for it, and nothing in `config.Validate()`
  reads it.
- **An accent is a hex colour or nothing.** `model.NormaliseAccent` is a strict
  `#rgb`/`#rrggbb` parser because the value is interpolated into a CSS custom
  property — arbitrary text there is a declaration injected into every page.
  `utils/branding.ts` derives the whole gold family from it (`--gold-2`,
  `--gold-tint`, `--ring`, `--brass-dim`, `--shadow-gold`, `--grid`), because
  those tokens are rgba() literals of the original hue in `index.css` and a bare
  `--gold` override leaves them behind as stripes of brass.
- **Single-club mode needs a club.** Both the wizard and the admin patch refuse
  the mode without one, since the nav entry and the directory redirect both
  point at it. The club is an ordinary club owned by the administrator the
  wizard created — nothing about it is special except that `site_settings`
  points at it.
- **`public_registration` is enforced in the router**, not just in the UI.
  `SiteSettingsHandler.RegistrationGate` wraps `POST /auth/register`, because
  an invite-only club's setting has to hold against a direct POST — hiding the
  link is presentation. A settings read that fails allows the sign-up: a
  transient database fault must not lock out registration site-wide, and the
  path immediately behind the gate needs the same database anyway.
- **The attribution is not a setting.** `PublicSiteSettings.Upstream` is stamped
  by `SiteSettings.ToPublic` from constants in `model/site_setting.go`, so no
  stored value can remove it, and `components/PoweredBy.tsx` is the single place
  it is rendered — bundled with the AGPL section 13 **Source** link, because
  three obligations kept in three places is how one of them goes missing.
  Tests on both sides pin it. A self-hoster brands the door; the plaque stays.

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
- **A page the backend can't build must still open.** `ShareMeta` composes its
  response by fetching the frontend container's `index.html` over the internal
  network (`FRONTEND_ORIGIN`); with no bundle it has nothing to serve, and the
  embedded `share_meta_fallback.html` holding page cannot boot the app. So the
  fallback goes out as **503**, and every location in `frontend/nginx.conf`
  that proxies HTML to the backend carries `proxy_intercept_errors on` plus
  `error_page 502 503 504 = @spa_shell`, which serves the bundled
  `index.html` from disk at 200. The visitor gets the working app; only the
  per-entity preview metadata is lost, and no human ever sees that. Both
  halves are pinned by tests — a 200 on the fallback, or a proxied location
  without the `error_page`, puts people back on a dead page that reloading
  cannot leave. The same rule keeps the holding page **script-free**: it is
  served under `script-src 'self'`, which blocks inline scripts and `onclick`
  handlers alike, so anything it promises to do by itself will silently not
  happen.
