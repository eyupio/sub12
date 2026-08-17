# Security Policy

## Reporting a vulnerability

**Please do not open a public issue for a security vulnerability.**

Report it privately through GitHub's private vulnerability reporting:

> **[Report a vulnerability](https://github.com/eyupio/sub12/security/advisories/new)**
> (Security tab → Report a vulnerability)

That opens a draft advisory only the maintainers can see. If you cannot use it,
open a regular issue titled "Security contact request" with no detail in it, and
a maintainer will arrange a private channel.

Please include, as far as you can:

- the affected component (backend endpoint, frontend route, workflow, container)
- the version, commit SHA or container tag you tested
- reproduction steps, ideally a `curl` command or a short script
- what an attacker gains — read another user's cards, escalate to admin, deny service

### What to expect

| | |
|---|---|
| Acknowledgement | within 3 working days |
| Initial assessment | within 10 working days |
| Fix or mitigation for a confirmed high/critical issue | as soon as practical, and we will keep you posted |
| Credit | in the advisory and release notes, unless you would rather stay anonymous |

sub12 is a volunteer-run open source project, not a funded product. There is no
bug bounty. We will always tell you honestly where a report stands rather than
leave it silent.

## Supported versions

Only the latest `main` and the most recent `latest` container images are
supported. There are no maintained release branches, so a fix ships forward
rather than being backported.

| Version | Supported |
|---|---|
| `main` / `ghcr.io/eyupio/sub12-*:latest` | ✅ |
| Older `sha-*` image tags | ❌ |
| Sideloaded Android APKs older than `android-latest` | ❌ |

## Scope

In scope — the code in this repository:

- the Go API in `backend/`, including auth, the moderator capability model, and
  the admin surface
- the React app in `frontend/`, including the Capacitor native shells
- the shipped `docker-compose.yml`, `Dockerfile`s and `nginx.conf`
- the GitHub Actions workflows in `.github/workflows/`

Out of scope:

- `https://sub12.io` as a running service — findings that only concern that
  deployment's configuration, DNS, or hosting provider
- vulnerabilities that require a self-hoster to have ignored an explicit
  refusal-to-start error from `config.Validate()` (see below)
- third-party dependencies, unless sub12 uses them in a way that is itself
  unsafe; report those upstream and tell us so we can pin or patch
- denial of service that needs privileged access, or that amounts to "a large
  request body is large"
- missing hardening headers on endpoints that serve no user data, absent a
  concrete exploit
- social engineering, physical access, and anything requiring a compromised
  device

## What a self-hoster must get right

Several of sub12's defences are configuration the operator owns. The backend
refuses to start in `ENV=production` when these are wrong — read the error
rather than working around it:

- **`JWT_SECRET`** must be long, random and private. The value in
  `.env.example` is published in this repository, so anyone on the internet can
  forge tokens — including admin tokens — against a deployment that reuses it.
  `scripts/install.sh` generates a real one for you.
- **`DB_PASSWORD`** likewise. `changeme` is public.
- **`DB_SSLMODE`** should be `require` or stricter unless Postgres is reachable
  only over a private network you control.
- **`CORS_ORIGIN`** must name your own origin. It is never `*`, because the
  refresh cookie is sent with credentials.
- **`ADMIN_PASSWORD`** only matters when `SEED_ADMIN=true`. Turn seeding off
  once the account exists.
- **Run the first-run wizard before the site is reachable by anyone else.** A
  deployment with no administrator serves `/setup`, which creates one without
  authentication — there is nothing yet to authenticate as. It is a one-shot:
  it claims the deployment with a conditional update, so exactly one caller can
  ever succeed and every later attempt is refused whether or not it loads the
  page, and it is rate-limited per IP like the other credential endpoints. The
  window is real all the same, and it is the interval between the stack
  answering and you finishing the wizard. Close it promptly, or set
  `SEED_ADMIN=true` with a real `ADMIN_PASSWORD` so the account exists the
  moment the backend boots and the wizard is shut from the start.
- **Backups** are AES-encrypted with a key derived from a passphrase you set.
  Without a passphrase a backup run fails rather than uploading plaintext —
  that is deliberate.

## Known accepted risks

These are tracked, dev-only, and deliberately not fixed yet. They are listed so
a scanner result does not look like a surprise:

- **`@capacitor/cli` → `tar`** (arbitrary file write, critical). Reached only
  when a developer runs `cap sync` locally or in the mobile build workflows; it
  is not in the web bundle or either container image. The fix is Capacitor 8,
  which is a native-project migration needing on-device testing. Tracked
  separately.
- Any remaining `npm audit` findings under `frontend/` and `e2e/` are build and
  test tooling. `npm run build` output ships; `node_modules` does not.

`npm audit` runs twice, and the split is the point: `--omit=dev` covers what
reaches a browser and is a **hard gate that must stay clean**, while the full run
covers build tooling and is advisory. If a dev-only package ever appears in the
runtime half, that is a dependency misclassified in `package.json` rather than a
new vulnerability — check which section it is in before reaching for an upgrade.

Run `make security` to see the current state of both scanners.

### Secret scanning

`gitleaks` scans the **full history**, not just the working tree, because a
secret committed and later removed is still a secret that was pushed.

If it fires: rotate the credential first. Rewriting history does not un-publish
anything a clone, fork, crawler or Actions log already has, so the commit is the
cleanup and the rotation is the fix.

Confirmed false positives are allowlisted in `.gitleaks.toml`, each with the
reasoning written next to it. They are matched as regexes against the specific
construct rather than excluded by path, deliberately: muting a whole file mutes
every future finding in it too.

### Two scanners are dormant until this repository is public

CodeQL and GitHub's dependency review are free on public repositories and
require GitHub Advanced Security on private ones. While sub12 is private, both
jobs **skip** rather than run — CodeQL's analysis actually succeeds and then
cannot upload its results, and dependency review refuses outright.

They are skipped rather than marked `continue-on-error` on purpose: a job that
always reports success while uploading nothing is worse than no job, because
nobody notices when it quietly stops working. Both start working with no change
to the workflow the moment visibility flips.

## Hardening we already do

So you know what is deliberate rather than missing:

- passwords hashed with bcrypt; TOTP two-factor with bcrypt-hashed backup codes
- JWT access tokens plus an httpOnly `SameSite=Lax` refresh cookie on web; the
  native shells persist the refresh token because the cookie is not delivered
  cross-site from a WebView
- all SQL parameterised through pgx — dynamic clauses build `$n` placeholders,
  never interpolated values
- per-IP rate limiting on every password-bearing endpoint, and per-user limits
  on posts, comments, likes, follows, reports and geocoding
- `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`,
  `Permissions-Policy`, a `script-src 'self'` CSP, and HSTS in production
- blocks applied inside the feed query itself, symmetrically, rather than
  filtered in the client
- both containers run as a non-root user; the backend port is not published to
  the host in the shipped compose file
- CodeQL, `govulncheck`, `npm audit` and dependency review run in CI
