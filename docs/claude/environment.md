# Environment variables

The required and optional environment variables, with defaults. It appends to the root `CLAUDE.md` and never overrides it; sections the text names but that are not here (for example "Placeholder credentials are refused" or "Outgoing public URLs") are in `CLAUDE.md`.

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
| `DB_SSLMODE` | `disable` | libpq TLS mode. Production refuses anything unencrypted unless `DB_ALLOW_INSECURE_LOCAL_NETWORK=true` — see "Placeholder credentials are refused" |
| `DB_ALLOW_INSECURE_LOCAL_NETWORK` | `false` | The operator asserting Postgres is not reachable off-host, which is the only way past the production TLS check. Set by `docker-compose.yml` for the topology it defines. Never set it for a managed database |
| `WEB_PORT` | `3000` | Host port the frontend container publishes. Point a reverse proxy here |
| `IMAGE_REPO` | `ghcr.io/eyupio` | Registry prefix for the two images, so a fork runs its own without editing `docker-compose.yml` |
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
| `FRONTEND_ORIGIN` | `http://frontend:8080` | Internal URL the backend fetches the SPA `index.html` from so it can inject per-page Open Graph tags. Point it at the frontend container; every share link and every page in `StaticPages` degrades to a holding page if it can't be reached. |
| `DEFAULT_AVATAR_URL` | *(empty)* | Absolute URL used as the avatar in emails and share cards when a user has none. Covered by the `Validate()` localhost guard. |
| `INDEXNOW_KEY` | *(empty)* | IndexNow submission key. Empty disables pinging search engines on publish. |
| `INDEXNOW_KEY_LOCATION` | *(derived)* | URL of the key file; the backend serves it at `/{key}.txt`. |
| `TRUSTED_PROXY_HOPS` | `1` | Number of reverse proxies between the client and this backend. The router walks `X-Forwarded-For` right-to-left past that many hops and keys auth rate limits on the entry the trusted proxy appended, so a client-supplied header cannot shift the bucket. Set 0 only for direct exposure. |
| `RATELIMIT_ENABLED` | `true` | Master switch for `middleware/ratelimit.go` (Redis-backed, per-user, per-minute). |
| `RATELIMIT_AUTH_PER_MIN` | `10` | Login/register/reset attempts. Keyed on IP, not user. |
| `RATELIMIT_FOLLOW_PER_MIN` | `10` | Follow/unfollow. |
| `RATELIMIT_COMMENT_PER_MIN` | `20` | Comment writes. |
| `RATELIMIT_POST_PER_MIN` | `10` | Post creation. |
| `RATELIMIT_REPORT_PER_MIN` | `5` | Content reports. |
| `RATELIMIT_LIKE_PER_MIN` | `60` | Likes. |
| `RATELIMIT_SOCIAL_TOGGLE_PER_MIN` | `30` | Other social toggles. |
| `RATELIMIT_GEOCODE_PER_MIN` | `30` | Reverse-geocode lookups per user, on top of the global one-per-second pacing. |
| `MODERATION_FLAG_GRACE` | `48h` | How long an author has to amend a flagged comment or post before the sweeper hides it. |
| `MODERATION_SWEEP_INTERVAL` | `15m` | How often that sweeper runs. |

`Validate()` only refuses a localhost value when `ENV=production`, and only for
the four URL fields listed in it — see "Outgoing public URLs".
