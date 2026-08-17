# Changelog

All notable changes to sub12 are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
the project aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
from its first tagged release onward.

sub12 shipped for a while before it was opened up, so there is no tagged history
before `0.1.0` — the entry below is the state of the app at the point the source
was published, not a claim that it was all built in one release. Container images
are additionally tagged `sha-<commit>` on every push to `main`, and the Android
APK tracks the rolling `android-latest` pre-release.

## [Unreleased]

### Added

- **AGPL-3.0 licence** ([LICENSE](LICENSE)). A **Source** link in the app footer
  satisfies the licence's section 13 obligation to offer source to users
  reaching the service over a network; forks that modify the code should point
  `VITE_SOURCE_URL` at their own repository.
- **Interactive installer** — `scripts/install.sh` detects prerequisites,
  generates real secrets, writes `.env` at mode 600, prepares the backup
  directory, runs migrations and waits for a healthy stack. Three modes (local
  development, self-host from images, self-host from source) plus `--check`,
  `--yes` and `--no-start` for unattended use. Windows users run it under WSL2,
  which Docker Desktop needs anyway; a PowerShell counterpart is not yet written.
- **Contributor documentation** — [CONTRIBUTING.md](CONTRIBUTING.md),
  [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), [SECURITY.md](SECURITY.md), issue
  and pull request templates, and `.editorconfig`.
- **`make security`** runs `govulncheck` and `npm audit` together, so the state
  of both scanners is one command rather than tribal knowledge.
- **`make check`** runs everything the PR gate runs, from the repo root.
- **Security CI** — CodeQL for Go and TypeScript, `govulncheck`, a split
  `npm audit`, GitHub dependency review, and a full-history secret scan.
  `.gitleaks.toml` records the confirmed false positives and why each is one.
  CodeQL and dependency review skip while this repository is private, since both
  need Advanced Security until it is public.
- **Dependabot** for Go modules, both npm projects, GitHub Actions and the
  Dockerfiles.
- **EyUp.io attribution** in the app footer, the landing pages and the About
  section.

### Changed

- **Production config validation is now strict.** `config.Validate()` refuses to
  start in `ENV=production` with a `JWT_SECRET` that matches the published
  `.env.example` value or is too short to resist brute force, a `DB_PASSWORD`
  left at `changeme`, `DB_SSLMODE=disable`, a `CORS_ORIGIN` of `*` or one
  pointing at localhost, or a weak `ADMIN_PASSWORD` while `SEED_ADMIN=true`.
  This matters now that the example values are public: a deployment reusing the
  example `JWT_SECRET` lets anyone forge an admin token.
- **The frontend image builds from the committed lockfile** (`npm ci` rather
  than `npm install`), so a container build resolves the same dependency tree
  CI tested.
- Container images and release URLs now refer to `eyupio/sub12`.

### Security

- **Go: 44 reachable vulnerabilities → 0** (`govulncheck`). Raised the `go`
  directive to `1.25.13`, which is what CI resolves its toolchain from, closing
  reachable advisories in `crypto/tls`, `crypto/x509`, `net/http`, `net/url`,
  `net/mail`, `net/textproto`, `mime`, `encoding/asn1`, `encoding/xml` and
  `html/template`. Upgraded `golang-jwt/jwt`, `redis/go-redis`, `pgx`, `chi`,
  `golang-migrate`, `minio-go` and the `golang.org/x` set.
- **npm: `e2e` 2 high → 0; `frontend` 11 → 5**, the remainder being build-time
  tooling reachable only from `@capacitor/cli`. Documented as an accepted risk
  in [SECURITY.md](SECURITY.md) with the reason it is not yet fixed.
- **`@capacitor/cli` moved from `dependencies` to `devDependencies`**, which is
  where Capacitor's own install instructions put it. It is invoked by the
  `cap sync` / `cap run` scripts at build time and never imported by the app, but
  its position in `dependencies` dragged a critical `tar` advisory into the
  runtime dependency audit — the half that covers what actually reaches a
  browser. That audit is now clean, and therefore means something.
- **The secret scan runs the gitleaks CLI from a pinned image rather than
  `gitleaks-action`**, whose wrapper requires a paid licence for
  organisation-owned repositories. A first full-history scan found five hits, all
  confirmed false positives (presence-only credential booleans, and the
  high-entropy fixtures the config tests need); no real secret is in the history.
- **The `opencode` workflow no longer runs for untrusted commenters.** It fired
  on any `/oc` comment from anyone, which on a public repository would have let
  a stranger spend `OPENCODE_API_KEY` and run an agent against the repo; it is
  now gated on the commenter's association with the repository, and the
  third-party action is pinned.
- Every workflow now declares least-privilege `permissions`.

## [0.1.0]

The app as first published. See [README.md](README.md#features) for the full
feature surface; in outline:

### Added

- **Score cards** — 25-shot capture with per-shot entry, target presets, image
  attachments, drafts, and a context (personal / league / club / event) that
  stays changeable after capture.
- **Gear** — rifle and pellet inventories with images, built-in catalogs, and
  opt-in anonymised cross-user comparison showcases.
- **Pellet testing** — image-based group measurement with hole detection,
  manual fallback, confidence scoring, compare/timeline/batch reports, combo
  analytics, and a public leaderboard.
- **Leagues** — seasons and rounds with full CRUD, standings, configurable
  scoring, join requests, delegated moderator capabilities, and score
  verification with a complete audit trail.
- **Clubs** — real-world profiles with address, map pin, disciplines,
  facilities and opening hours; club authority reaches the leagues it hosts.
- **Events** — slug-addressed shoots with participants, guests, delegated
  scorers, invitations, scoreboard and CSV results.
- **Social** — follows, activity feed, posts, comments, likes, achievements,
  blocks and mutes applied inside the feed query itself.
- **Notifications** — one row per recipient delivered in-app, by push and by
  email, each gated on the recipient's own preference; plus group
  announcements.
- **Moderation** — reports on posts, comments and users, an admin decision
  queue, and a background sweeper with an author grace period.
- **Admin** — users, leagues, clubs, events, gear analytics, FAQ, categories,
  feature board, SMTP and email templates, sitemap/SEO, encrypted S3 backups,
  and activity simulation.
- **Accounts** — email/password auth with JWT sessions and refresh tokens,
  TOTP two-factor with backup codes, password reset, avatar upload and email
  change.
- **Platform** — installable PWA, native iOS and Android shells via Capacitor
  6 (share sheet, camera, geolocation, deep links, push, haptics), dark mode,
  and reproducible narrated demo recordings.

[Unreleased]: https://github.com/eyupio/sub12/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/eyupio/sub12/releases/tag/v0.1.0
