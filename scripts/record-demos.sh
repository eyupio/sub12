#!/usr/bin/env bash
# Record the demo videos in e2e/demos/ against a local stack and publish the
# results into frontend/public/demos/ (webm + poster jpg).
#
# Usage:
#   ./scripts/record-demos.sh                  # record every demo
#   ./scripts/record-demos.sh howto-first-card # just one slug (playwright -g filter)
#
# Expects the same stack as scripts/e2e.sh (and starts postgres/redis via
# docker compose, the backend and the frontend itself if they are not up).

set -euo pipefail

FILTER="${1:-}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

LOG_DIR="${TMPDIR:-/tmp}"
BACKEND_LOG="$LOG_DIR/sub12-demos-backend.log"
FRONTEND_LOG="$LOG_DIR/sub12-demos-frontend.log"

BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
    local ec=$?
    for pid in "$BACKEND_PID" "$FRONTEND_PID"; do
        if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
            wait "$pid" 2>/dev/null || true
        fi
    done
    exit "$ec"
}
trap cleanup EXIT INT TERM

check_url() { curl -fsS -o /dev/null --max-time 2 "$1"; }

wait_for() {
    local url="$1" name="$2" timeout="${3:-60}" i=0
    while ! check_url "$url"; do
        i=$((i+1))
        [[ $i -ge $timeout ]] && { echo "timeout waiting for $name at $url" >&2; return 1; }
        sleep 1
    done
    echo "$name ready at $url"
}

# 1. Infra (best effort — mirrors scripts/e2e.sh)
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    docker compose -f docker-compose.dev.yml up -d
    sleep 2
else
    echo "warning: Docker unavailable — assuming postgres + redis are already running" >&2
fi

# 2. Backend (seeds the standard test users)
if check_url "http://localhost:8080/healthz"; then
    echo "backend: already running on :8080"
else
    echo "seeding db + starting backend (logs: $BACKEND_LOG)..."
    (cd backend && make seed) >>"$BACKEND_LOG" 2>&1 || {
        echo "seed failed — see $BACKEND_LOG" >&2; exit 1; }
    (cd backend && make run) >>"$BACKEND_LOG" 2>&1 &
    BACKEND_PID=$!
    wait_for "http://localhost:8080/healthz" "backend" 60
fi

# 3. Frontend
if check_url "http://localhost:5173"; then
    echo "frontend: already running on :5173"
else
    echo "starting frontend (logs: $FRONTEND_LOG)..."
    (cd frontend && npm run dev) >>"$FRONTEND_LOG" 2>&1 &
    FRONTEND_PID=$!
    wait_for "http://localhost:5173" "frontend" 60
fi

# 4. Record
cd "$REPO_ROOT/e2e"
[[ -d node_modules ]] || npm install
if [[ ! -f .env && -f .env.example ]]; then cp .env.example .env; fi

ARGS=(test --config demos/playwright.config.ts)
[[ -n "$FILTER" ]] && ARGS+=(-g "$FILTER")
npx playwright "${ARGS[@]}"

# 5. Publish into frontend/public/demos. Posters are jpegs the demo specs
# capture themselves via demo.saveMoment() (Playwright's bundled ffmpeg can't
# encode jpeg, so frames aren't extracted from the webm).
DEST="$REPO_ROOT/frontend/public/demos"
mkdir -p "$DEST"
shopt -s nullglob
for webm in "$REPO_ROOT"/e2e/demo-output/*.webm; do
    slug="$(basename "$webm" .webm)"
    cp "$webm" "$DEST/$slug.webm"
    if [[ -f "$REPO_ROOT/e2e/demo-output/$slug.jpg" ]]; then
        cp "$REPO_ROOT/e2e/demo-output/$slug.jpg" "$DEST/$slug.jpg"
    else
        echo "no poster captured for $slug (spec never called demo.saveMoment())" >&2
    fi
    echo "published $slug"
done

echo
echo "Videos in frontend/public/demos/ — commit the ones you mean to ship,"
echo "and list them in frontend/src/catalog/videoGuides.ts."
