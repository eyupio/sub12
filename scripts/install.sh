#!/usr/bin/env bash
# Interactive installer for sub12.
#
# Checks prerequisites, generates real secrets, writes .env, prepares the
# backup directory, brings the stack up and waits until it answers.
#
# Usage:
#   ./scripts/install.sh                       # interactive
#   ./scripts/install.sh --mode dev            # dev|self-host|build
#   ./scripts/install.sh --mode self-host \
#       --site-url https://shoot.example --yes # unattended
#   ./scripts/install.sh --check               # prerequisites only, no changes
#
# Modes:
#   dev        Postgres + Redis in Docker; you run the Go API and Vite yourself
#   self-host  the whole stack from published container images
#   build      the whole stack, images built from this checkout
#
# Flags:
#   --mode <m>        skip the mode menu
#   --site-url <url>  public URL the app is served from
#   --port <n>        host port for the web app (self-host/build; default 3000)
#   --seed            load development seed data (dev mode only)
#   --no-start        write configuration but don't start anything
#   --yes, -y         accept defaults, never prompt (implies --mode dev if unset)
#   --check           report prerequisites and exit
#   --help, -h        this text

set -euo pipefail

# ----------------------------------------------------------------- presentation
# Colour only when stdout is a terminal that wants it: piping this into a log or
# running it from CI should not produce escape sequences.
if [[ -t 1 && -z "${NO_COLOR:-}" && "${TERM:-dumb}" != "dumb" ]]; then
    BOLD=$'\033[1m'; DIM=$'\033[2m'; RESET=$'\033[0m'
    GOLD=$'\033[38;5;179m'; GREEN=$'\033[32m'; RED=$'\033[31m'; YELLOW=$'\033[33m'
else
    BOLD=""; DIM=""; RESET=""; GOLD=""; GREEN=""; RED=""; YELLOW=""
fi

TICK="${GREEN}✓${RESET}"
CROSS="${RED}✗${RESET}"
WARN="${YELLOW}!${RESET}"

say()   { printf '%s\n' "$*"; }
info()  { printf '  %s\n' "$*"; }
ok()    { printf '  %b %s\n' "$TICK" "$*"; }
bad()   { printf '  %b %s\n' "$CROSS" "$*" >&2; }
warn()  { printf '  %b %s\n' "$WARN" "$*" >&2; }
step()  { printf '\n%s%s%s\n' "$BOLD" "$*" "$RESET"; }
die()   { printf '\n%b %s\n' "$CROSS" "${BOLD}$*${RESET}" >&2; exit 1; }

banner() {
    printf '\n%s' "$GOLD"
    cat <<'ART'
   ▄▄▄· ▄• ▄▌▄▄▄▄· ▄▄· ▄▄▄
  ▐█ ▀█ █▪██▌▐█ ▀█▪▄█▀▄▐▄▄·   s u b 1 2
  ▄█▀▀█ █▌▐█▌▐█▀▀█▄▐█▌.▐▌██▪
  ▐█▪ ▐▌▐█▄█▌██▄▪▐█▐█▌.▐▌██▌.
   ▀  ▀  ▀▀▀ ·▀▀▀▀  ▀█▄▀▪▀▀▀
ART
    printf '%s' "$RESET"
    printf '  %sTarget shooting companion — installer%s\n' "$DIM" "$RESET"
    printf '  %sby EyUp.io · AGPL-3.0 · github.com/eyupio/sub12%s\n\n' "$DIM" "$RESET"
}

# --------------------------------------------------------------------- defaults
MODE=""
SITE_URL=""
WEB_PORT=""
DO_SEED=""
NO_START=""
ASSUME_YES=""
CHECK_ONLY=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --mode)      MODE="${2:-}"; shift 2 ;;
        --mode=*)    MODE="${1#--mode=}"; shift ;;
        --site-url)  SITE_URL="${2:-}"; shift 2 ;;
        --site-url=*) SITE_URL="${1#--site-url=}"; shift ;;
        --port)      WEB_PORT="${2:-}"; shift 2 ;;
        --port=*)    WEB_PORT="${1#--port=}"; shift ;;
        --seed)      DO_SEED=1; shift ;;
        --no-start)  NO_START=1; shift ;;
        -y|--yes)    ASSUME_YES=1; shift ;;
        --check)     CHECK_ONLY=1; shift ;;
        -h|--help)   sed -n '2,28p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *)           die "unknown argument: $1  (try --help)" ;;
    esac
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

ENV_FILE="$REPO_ROOT/.env"

# ------------------------------------------------------------------- primitives
ask() {
    # ask <prompt> <default> -> echoes the answer
    local prompt="$1" default="${2:-}" reply=""
    if [[ -n "$ASSUME_YES" ]]; then printf '%s' "$default"; return; fi
    if [[ -n "$default" ]]; then
        read -rp "  $prompt ${DIM}[$default]${RESET} " reply </dev/tty || true
    else
        read -rp "  $prompt " reply </dev/tty || true
    fi
    printf '%s' "${reply:-$default}"
}

confirm() {
    # confirm <prompt> <default y|n>
    local prompt="$1" default="${2:-n}" reply=""
    if [[ -n "$ASSUME_YES" ]]; then [[ "$default" == "y" ]]; return; fi
    local hint="y/N"; [[ "$default" == "y" ]] && hint="Y/n"
    read -rp "  $prompt ${DIM}[$hint]${RESET} " reply </dev/tty || true
    reply="${reply:-$default}"
    [[ "${reply,,}" == "y" || "${reply,,}" == "yes" ]]
}

have() { command -v "$1" >/dev/null 2>&1; }

# Random secrets. openssl is the usual source; /dev/urandom is the fallback so a
# minimal container without openssl still gets real entropy rather than a
# predictable placeholder. Never `date`, `$RANDOM`, or $$ — a guessable
# JWT_SECRET is the same as a published one.
gen_secret() {
    local bytes="${1:-48}"
    if have openssl; then
        openssl rand -base64 "$bytes" | tr -d '\n=' | tr '+/' '-_'
    elif [[ -r /dev/urandom ]]; then
        LC_ALL=C tr -dc 'A-Za-z0-9-_' </dev/urandom | head -c $((bytes * 4 / 3))
    else
        die "no source of randomness found (need openssl or /dev/urandom) — refusing to invent a secret"
    fi
}

# Docker on Windows/WSL is sometimes only reachable as docker.exe.
DOCKER_CMD=""
detect_docker() {
    if have docker && docker info >/dev/null 2>&1; then DOCKER_CMD="docker"; return 0; fi
    if have docker.exe && docker.exe info >/dev/null 2>&1; then DOCKER_CMD="docker.exe"; return 0; fi
    return 1
}
compose() { "$DOCKER_CMD" compose "$@"; }

wait_for_http() {
    local url="$1" name="$2" timeout="${3:-120}" i=0
    printf '  waiting for %s ' "$name"
    while ! curl -fsS -o /dev/null --max-time 3 "$url" 2>/dev/null; do
        i=$((i + 1))
        if (( i >= timeout )); then
            printf '\n'
            return 1
        fi
        printf '.'
        sleep 1
    done
    printf ' %b\n' "$TICK"
}

# ---------------------------------------------------------------- prerequisites
PREREQ_FAILED=""
PREREQ_NOTE=""

# Just the version number. `curl --version` alone is six lines and 400 characters
# of feature list, which turns a tidy prerequisite table into a wall.
version_of() {
    case "$1" in
        docker)  "$DOCKER_CMD" --version 2>/dev/null | sed -n 's/^Docker version \([^,]*\).*/\1/p' ;;
        go)      go version 2>/dev/null | awk '{print $3}' ;;
        node)    node --version 2>/dev/null ;;
        npm)     npm --version 2>/dev/null ;;
        openssl) openssl version 2>/dev/null | awk '{print $1, $2}' ;;
        curl)    curl --version 2>/dev/null | head -1 | awk '{print $2}' ;;
        make)    make --version 2>/dev/null | head -1 | awk '{print $3}' ;;
        *)       "$1" --version 2>/dev/null | head -1 | cut -c1-40 ;;
    esac
}

require_tool() {
    # require_tool <cmd> <why> [optional]
    local cmd="$1" why="$2" optional="${3:-}"
    if have "$cmd"; then
        ok "$(printf '%-18s %s' "$cmd" "${DIM}$(version_of "$cmd")${RESET}")"
        return 0
    fi
    if [[ -n "$optional" ]]; then
        warn "$(printf '%-18s %s' "$cmd" "not found — $why")"
        PREREQ_NOTE=1
        return 1
    fi
    bad "$(printf '%-18s %s' "$cmd" "not found — $why")"
    PREREQ_FAILED=1
    return 1
}

check_prereqs() {
    step "Checking prerequisites"

    if detect_docker; then
        ok "$(printf '%-18s %s' "docker" "${DIM}$(version_of docker)${RESET}")"
        if compose version >/dev/null 2>&1; then
            ok "$(printf '%-18s %s' "docker compose" "${DIM}$(compose version --short 2>/dev/null)${RESET}")"
        else
            bad "docker compose      not available — install the Compose v2 plugin"
            PREREQ_FAILED=1
        fi
    else
        bad "docker              not found or not running — needed for Postgres and Redis"
        info "    ${DIM}https://docs.docker.com/get-docker/  (start Docker Desktop if installed)${RESET}"
        PREREQ_FAILED=1
    fi

    require_tool curl "needed to health-check the stack"
    require_tool openssl "secrets will fall back to /dev/urandom" optional || true

    if [[ "$MODE" == "dev" ]]; then
        require_tool go   "needed to run the API locally — https://go.dev/dl/"
        require_tool node "needed to run the frontend — https://nodejs.org/ (v20+)"
        require_tool npm  "ships with Node"
        require_tool make "the backend Makefile drives migrations and the dev server"

        # Node 20 is the floor; Vite 5 and the toolchain assume it.
        if have node; then
            local major
            major="$(node --version | sed 's/^v\([0-9]*\).*/\1/')"
            if [[ -n "$major" ]] && (( major < 20 )); then
                bad "node is v$major — sub12 needs Node 20 or newer"
                PREREQ_FAILED=1
            fi
        fi

        # backend/go.mod pins an exact patch release, and Go fetches a matching
        # toolchain on demand — but only from 1.21, where that machinery landed.
        # Older than that and the build fails with a bare "unknown directive".
        if have go; then
            local go_minor
            go_minor="$(go version | sed -n 's/^go version go1\.\([0-9]*\).*/\1/p')"
            if [[ -n "$go_minor" ]] && (( go_minor < 21 )); then
                bad "go is 1.$go_minor — sub12 needs 1.21+ so the pinned toolchain can be fetched"
                PREREQ_FAILED=1
            fi
        fi
    fi

    if [[ -n "$PREREQ_FAILED" ]]; then
        say ""
        die "missing prerequisites — install the tools marked ✗ above and run this again"
    fi
    [[ -n "$PREREQ_NOTE" ]] && info "${DIM}items marked ! are optional${RESET}"
    return 0
}

# ------------------------------------------------------------------- mode choice
choose_mode() {
    [[ -n "$MODE" ]] && return 0
    if [[ -n "$ASSUME_YES" ]]; then MODE="dev"; return 0; fi

    step "How do you want to run sub12?"
    cat <<EOF

    ${BOLD}1)${RESET} Local development ${DIM}(recommended if you're going to change the code)${RESET}
       Postgres + Redis in Docker. You run the Go API and the Vite dev server,
       with hot reload. Seed accounts available.

    ${BOLD}2)${RESET} Self-host ${DIM}(run it for your club)${RESET}
       The whole stack from published container images. Nothing to compile.

    ${BOLD}3)${RESET} Self-host, built from this checkout
       Same as 2, but the images are built from the source you have. Slower;
       use it if you've changed the code or want to verify the build.

EOF
    local choice
    choice="$(ask "Choose 1-3:" "1")"
    case "$choice" in
        1) MODE="dev" ;;
        2) MODE="self-host" ;;
        3) MODE="build" ;;
        *) die "unknown choice: $choice" ;;
    esac
}

# ------------------------------------------------------------------ .env writing
# Anything already in .env wins, so re-running the installer never silently
# rotates a live deployment's secrets. Rotating JWT_SECRET signs every user out;
# rotating DB_PASSWORD locks the app out of its own database, because Postgres
# keeps the password it was initialised with.
existing_env_value() {
    local key="$1"
    [[ -f "$ENV_FILE" ]] || return 1
    local line
    line="$(grep -m1 -E "^[[:space:]]*${key}=" "$ENV_FILE" 2>/dev/null)" || return 1
    printf '%s' "${line#*=}"
}

is_placeholder() {
    # Mirrors placeholderSecrets / isPlaceholderSecret in
    # backend/internal/config/config.go. Keep the two lists identical: a value
    # this accepts and the backend rejects means the installer cheerfully writes
    # a config that then refuses to boot, which is a miserable first experience.
    local v="${1,,}"
    [[ -z "$v" ]] && return 0
    local p
    for p in changeme change-me password123 placeholder replace-me replaceme \
             insecure your-secret yoursecret my-secret mysecret supersecret \
             super-secret todo xxxx; do
        [[ "$v" == *"$p"* ]] && return 0
    done
    return 1
}

# secret_for <KEY> <bytes> -> reuse a real existing value, else generate
secret_for() {
    local key="$1" bytes="${2:-48}" current=""
    if current="$(existing_env_value "$key")" && ! is_placeholder "$current"; then
        printf '%s' "$current"
        return
    fi
    gen_secret "$bytes"
}

# Postgres burns POSTGRES_PASSWORD into the data directory the first time it
# initialises and ignores the variable ever afterwards. So a data directory left
# over from `make dev` without a .env was initialised with `changeme`, and the
# freshly generated password we're about to write will simply not authenticate —
# surfacing several steps later as a migration failure that reads like a network
# problem. Catch it here, while the fix is still a choice.
check_postgres_password_matches() {
    local data_dir
    if [[ "$MODE" == "dev" ]]; then
        data_dir="$REPO_ROOT/data/postgres-dev"
    else
        data_dir="$REPO_ROOT/data/postgres"
    fi

    # Nothing initialised yet: whatever we write becomes the password.
    [[ -d "$data_dir" && -n "$(ls -A "$data_dir" 2>/dev/null)" ]] || return 0

    # An existing cluster plus a password we carried over from .env is the normal
    # re-run, and they agree by construction.
    local previous
    if previous="$(existing_env_value DB_PASSWORD)" && [[ "$previous" == "$DB_PASSWORD" ]]; then
        return 0
    fi

    say ""
    warn "There is already a Postgres data directory at ${data_dir#$REPO_ROOT/}"
    warn "and no matching DB_PASSWORD in .env. Postgres keeps the password it was"
    warn "first initialised with, so a new one will be rejected."
    say ""
    info "  ${BOLD}1)${RESET} Delete the existing database and start clean ${DIM}(loses all data)${RESET}"
    info "  ${BOLD}2)${RESET} Type the password that cluster was initialised with"
    info "  ${BOLD}3)${RESET} Abort"
    say ""

    local choice
    choice="$(ask "Choose 1-3:" "3")"
    case "$choice" in
        1)
            if confirm "Permanently delete ${data_dir#$REPO_ROOT/}?" "n"; then
                if [[ -w "$data_dir" ]]; then
                    rm -rf "$data_dir"
                elif have sudo; then
                    sudo rm -rf "$data_dir"
                else
                    die "cannot remove $data_dir — insufficient permissions and no sudo"
                fi
                ok "old database removed"
            else
                die "aborted — nothing has been changed"
            fi
            ;;
        2)
            local typed
            typed="$(ask "Existing DB_PASSWORD:" "")"
            [[ -n "$typed" ]] || die "no password given — aborting rather than writing one that cannot work"
            DB_PASSWORD="$typed"
            ok "using the existing database password"
            ;;
        *)
            die "aborted — nothing has been changed"
            ;;
    esac
}

gather_settings() {
    step "Configuration"

    if [[ "$MODE" == "dev" ]]; then
        ENV_NAME="development"
        SITE_URL="${SITE_URL:-http://localhost:5173}"
        CORS_ORIGIN="http://localhost:5173"
        DB_HOST="localhost"
        DB_SSL="disable"
        ALLOW_INSECURE_DB="false"
        info "development defaults: API on :8080, app on :5173"
    else
        ENV_NAME="production"
        WEB_PORT="${WEB_PORT:-$(existing_env_value WEB_PORT || echo 3000)}"
        if [[ -z "$SITE_URL" ]]; then
            SITE_URL="$(existing_env_value SITE_URL || true)"
            SITE_URL="$(ask "Public URL people will use to reach sub12:" "${SITE_URL:-http://localhost:$WEB_PORT}")"
        fi
        SITE_URL="${SITE_URL%/}"
        CORS_ORIGIN="$SITE_URL"
        DB_HOST="postgres"
        # Postgres is on the compose network with no published port. See the
        # comment on DB_ALLOW_INSECURE_LOCAL_NETWORK in docker-compose.yml.
        DB_SSL="disable"
        ALLOW_INSECURE_DB="true"

        if [[ "$SITE_URL" == http://* && "$SITE_URL" != http://localhost* ]]; then
            warn "$SITE_URL is plain HTTP. Put a TLS-terminating reverse proxy in front"
            warn "of it before real accounts exist — passwords and tokens are in those requests."
        fi
    fi

    JWT_SECRET="$(secret_for JWT_SECRET 48)"
    DB_PASSWORD="$(secret_for DB_PASSWORD 32)"
    check_postgres_password_matches

    # Sanity-check our own output against the backend's rule rather than trusting
    # gen_secret. A silent regression here ships a guessable signing key.
    if is_placeholder "$JWT_SECRET" || (( ${#JWT_SECRET} < 32 )); then
        die "generated JWT_SECRET failed its own validity check — refusing to write it"
    fi

    # A fresh deployment normally gets its administrator from the first-run
    # wizard at /setup, which also asks what the installation is called and
    # how it should look. Seeding one from .env pre-empts that: the existence
    # of an administrator is precisely what closes the wizard, so answering
    # yes here means never being offered it. Worth having anyway for an
    # unattended install with no browser at the other end, so it is offered —
    # just no longer as the default.
    SEED_ADMIN="false"
    ADMIN_PASSWORD=""
    if [[ "$MODE" != "dev" ]]; then
        if confirm "Seed an admin account from .env instead of using the setup wizard?" "n"; then
            SEED_ADMIN="true"
            ADMIN_PASSWORD="$(existing_env_value ADMIN_PASSWORD || true)"
            if [[ -z "$ADMIN_PASSWORD" ]] || is_placeholder "$ADMIN_PASSWORD"; then
                ADMIN_PASSWORD="$(gen_secret 18)"
                ADMIN_GENERATED=1
            fi
        fi
    fi
}

write_env() {
    step "Writing .env"

    if [[ -f "$ENV_FILE" ]]; then
        local backup="$ENV_FILE.backup.$(date +%Y%m%d-%H%M%S)"
        cp "$ENV_FILE" "$backup"
        ok "existing .env backed up to ${backup#$REPO_ROOT/}"
        info "${DIM}secrets already in it were kept, not regenerated${RESET}"
    fi

    # umask before creation, not chmod after: a world-readable window between
    # write and chmod is a window in which the signing key leaks.
    ( umask 077; : > "$ENV_FILE" )

    cat > "$ENV_FILE" <<EOF
# sub12 configuration — generated by scripts/install.sh on $(date -u '+%Y-%m-%d %H:%M:%S UTC')
#
# This file contains real secrets. It is git-ignored; keep it that way, and keep
# it out of backups that are less protected than the database itself.
#
# Re-running the installer preserves every secret already in here. To rotate one,
# delete its line and run the installer again — but note that rotating
# JWT_SECRET signs every user out, and rotating DB_PASSWORD after Postgres has
# been initialised locks the app out of its own database until you change the
# password in Postgres too.

# Database
DB_HOST=$DB_HOST
DB_PORT=5432
DB_NAME=sub12
DB_USER=sub12
DB_PASSWORD=$DB_PASSWORD
DB_SSLMODE=$DB_SSL
DB_ALLOW_INSECURE_LOCAL_NETWORK=$ALLOW_INSECURE_DB

# Redis
REDIS_URL=redis://localhost:6379

# Auth
JWT_SECRET=$JWT_SECRET
JWT_EXPIRY_HOURS=24
PASSWORD_RESET_TTL_MINUTES=60

# Server
PORT=8080
ENV=$ENV_NAME
CORS_ORIGIN=$CORS_ORIGIN

# Canonical public host. Every link sent by email or push is built from this, so
# it has to be the URL people actually visit.
SITE_URL=$SITE_URL

# First admin account, created on startup. Turn SEED_ADMIN off once it exists —
# leaving it on means the password stays in this file to no purpose.
SEED_ADMIN=$SEED_ADMIN
ADMIN_PASSWORD=$ADMIN_PASSWORD

# Reverse geocoding: names picked coordinates so a card reads "Otley Sports
# Ground" rather than "53.862, -1.958". Set empty to switch it off. If you run
# sub12 at any scale, host your own Nominatim rather than leaning on the public
# instance — its usage policy is not a formality.
GEOCODE_URL=https://nominatim.openstreetmap.org

# Push notifications (Firebase Cloud Messaging, HTTP v1). Without it device
# tokens are still stored, but nothing is delivered.
# FCM_CREDENTIALS_JSON='{"type":"service_account","project_id":"..."}'

# SMTP is configured in the admin UI, not here, so credentials live in the
# database rather than on disk.
EOF

    if [[ "$MODE" != "dev" ]]; then
        cat >> "$ENV_FILE" <<EOF

# Host port the web app is published on. Point your reverse proxy here.
WEB_PORT=$WEB_PORT
EOF
    fi

    chmod 600 "$ENV_FILE"
    ok ".env written ${DIM}(mode 600)${RESET}"
}

# ---------------------------------------------------------------- backup volume
prepare_backup_dir() {
    [[ "$MODE" == "dev" ]] && return 0
    local dir="$REPO_ROOT/data/backups"
    mkdir -p "$dir"

    # The backend container runs as UID 10001 and writes encrypted dumps here. If
    # the host directory is owned by anyone else, admin backup runs fail with
    # "permission denied" at the moment somebody is trying to take a backup —
    # which is the worst possible time to discover it.
    local owner
    owner="$(stat -c '%u' "$dir" 2>/dev/null || stat -f '%u' "$dir" 2>/dev/null || echo "")"
    if [[ "$owner" == "10001" ]]; then
        ok "data/backups owned by UID 10001"
        return 0
    fi

    if [[ "$(id -u)" == "0" ]]; then
        chown 10001:10001 "$dir" && chmod 750 "$dir"
        ok "data/backups set to UID 10001"
    elif have sudo && confirm "data/backups needs to be owned by UID 10001. Use sudo to set it?" "y"; then
        sudo chown 10001:10001 "$dir" && sudo chmod 750 "$dir"
        ok "data/backups set to UID 10001"
    else
        warn "data/backups is not owned by UID 10001 — admin backup runs will fail."
        warn "Fix later with: sudo chown 10001:10001 data/backups && sudo chmod 750 data/backups"
    fi
}

# ------------------------------------------------------------------- bring it up
start_dev() {
    step "Starting Postgres and Redis"
    compose -f docker-compose.dev.yml --env-file "$ENV_FILE" up -d
    ok "containers up"

    step "Running database migrations"
    if ( cd backend && make migrate-up ); then
        ok "schema up to date"
    else
        die "migrations failed — check that Postgres is accepting connections, then rerun: cd backend && make migrate-up"
    fi

    if [[ -z "$DO_SEED" ]] && confirm "Load development seed data (test accounts, leagues, cards)?" "y"; then
        DO_SEED=1
    fi
    if [[ -n "$DO_SEED" ]]; then
        step "Seeding"
        if ( cd backend && make seed ); then
            ok "seed data loaded"
        else
            warn "seeding failed — the app still works, it's just empty"
        fi
    fi

    step "Installing frontend dependencies"
    ( cd frontend && npm install --no-fund --no-audit ) && ok "node_modules ready"
}

start_stack() {
    step "Starting the full stack"
    if [[ "$MODE" == "build" ]]; then
        info "building images from this checkout — this takes a few minutes"
        compose --env-file "$ENV_FILE" up -d --build
    else
        info "pulling published images"
        compose --env-file "$ENV_FILE" up -d --pull always
    fi

    local url="http://localhost:${WEB_PORT}"
    if wait_for_http "$url" "web app" 180; then
        ok "sub12 is answering on $url"
    else
        bad "the web app did not come up within 3 minutes"
        info "  ${DIM}docker compose logs backend${RESET}  ← start here; a refused config value is printed at startup"
        info "  ${DIM}docker compose ps${RESET}"
        return 1
    fi
}

# ----------------------------------------------------------------------- summary
summary() {
    step "Done"
    say ""
    if [[ "$MODE" == "dev" ]]; then
        cat <<EOF
  Start the two halves in separate terminals:

    ${BOLD}cd backend  && make run${RESET}     ${DIM}API on http://localhost:8080${RESET}
    ${BOLD}cd frontend && npm run dev${RESET}  ${DIM}app on http://localhost:5173${RESET}

EOF
        if [[ -n "$DO_SEED" ]]; then
            cat <<EOF
  Seeded accounts ${DIM}(development only)${RESET}:

    dev@sub12.local     password123   ${DIM}user${RESET}
    admin@sub12.local   password123   ${DIM}admin${RESET}

EOF
        fi
        cat <<EOF
  ${DIM}make down${RESET}      stop Postgres and Redis
  ${DIM}make check${RESET}     run everything CI runs
  ${DIM}CONTRIBUTING.md${RESET}  how to get a change merged
EOF
    else
        cat <<EOF
  ${BOLD}sub12 is running at ${GOLD}http://localhost:${WEB_PORT}${RESET}

EOF
        if [[ "$SITE_URL" != "http://localhost:$WEB_PORT" ]]; then
            cat <<EOF
  Point your reverse proxy at that port and serve it as ${BOLD}$SITE_URL${RESET}
  over HTTPS. The container listens on 8080 internally and proxies /api/ to the
  backend itself, so one upstream is all you need.

EOF
        fi
        if [[ "$SEED_ADMIN" != "true" ]]; then
            cat <<EOF
  ${BOLD}Finish setting up in the browser${RESET}

    Open ${GOLD}http://localhost:${WEB_PORT}${RESET} — you'll land on the setup wizard.

  It asks whether this installation is a community or one club's own site,
  what it is called and coloured, and who administers it. ${YELLOW}It runs once${RESET}: the
  moment it creates that first administrator it closes for good, so do it
  before you put the site in front of anyone. Everything except the account
  can be changed later from Admin → Branding.

EOF
        fi
        if [[ "$SEED_ADMIN" == "true" ]]; then
            cat <<EOF
  ${BOLD}First admin account${RESET}

    email     admin@sub12.local
    password  ${GOLD}${ADMIN_PASSWORD}${RESET}

  ${YELLOW}Write that down now.${RESET} It is in .env too, but once you've signed in and
  changed it, set ${DIM}SEED_ADMIN=false${RESET} and clear ${DIM}ADMIN_PASSWORD${RESET} — there is no
  reason for it to sit on disk after that.

EOF
        fi
        cat <<EOF
  ${DIM}docker compose logs -f backend${RESET}   follow the API
  ${DIM}docker compose down${RESET}              stop everything
  ${DIM}docker compose pull && docker compose up -d${RESET}   upgrade

  Backups are configured in the admin UI. They are AES-encrypted with a
  passphrase you set there; a run without one fails rather than uploading
  plaintext, which is deliberate.

  ${DIM}SECURITY.md${RESET} lists what a self-hoster owns. Worth five minutes.
EOF
    fi
    say ""
    printf '%s  sub12 is AGPL-3.0. If you modify it and run it for other people, you must\n' "$DIM"
    printf '  offer them the source — the Source link in the footer is how. See LICENSE.%s\n\n' "$RESET"
}

# -------------------------------------------------------------------------- main
banner

if [[ -n "$CHECK_ONLY" ]]; then
    MODE="${MODE:-dev}"
    check_prereqs
    step "Prerequisites satisfied for --mode $MODE"
    say ""
    exit 0
fi

choose_mode
case "$MODE" in
    dev|self-host|build) ;;
    *) die "unknown mode: $MODE  (expected dev, self-host or build)" ;;
esac

check_prereqs
gather_settings
write_env
prepare_backup_dir

if [[ -n "$NO_START" ]]; then
    step "Not starting anything (--no-start)"
    info "configuration is written; bring it up yourself when ready"
    say ""
    exit 0
fi

if [[ "$MODE" == "dev" ]]; then
    start_dev
else
    start_stack
fi

summary
