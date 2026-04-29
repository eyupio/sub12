#!/usr/bin/env bash
# Interactive runner for the Playwright e2e suite.
# Auto-starts infra, backend, and frontend if they're not already up,
# then offers a menu (UI / headed / headless / codegen / report).
#
# Usage:
#   ./scripts/e2e.sh              # interactive menu
#   ./scripts/e2e.sh --mode ui    # ui|headed|headless|codegen|report

set -euo pipefail

MODE=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        --mode)
            MODE="${2:-}"
            shift 2
            ;;
        --mode=*)
            MODE="${1#--mode=}"
            shift
            ;;
        -h|--help)
            sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'
            exit 0
            ;;
        *)
            echo "unknown arg: $1" >&2
            exit 2
            ;;
    esac
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

LOG_DIR="${TMPDIR:-/tmp}"
BACKEND_LOG="$LOG_DIR/sub12-e2e-backend.log"
FRONTEND_LOG="$LOG_DIR/sub12-e2e-frontend.log"

BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
    local ec=$?
    if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" 2>/dev/null; then
        echo "stopping backend (pid $BACKEND_PID)"
        kill "$BACKEND_PID" 2>/dev/null || true
        wait "$BACKEND_PID" 2>/dev/null || true
    fi
    if [[ -n "$FRONTEND_PID" ]] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
        echo "stopping frontend (pid $FRONTEND_PID)"
        kill "$FRONTEND_PID" 2>/dev/null || true
        wait "$FRONTEND_PID" 2>/dev/null || true
    fi
    exit "$ec"
}
trap cleanup EXIT INT TERM

check_url() {
    curl -fsS -o /dev/null --max-time 2 "$1"
}

wait_for() {
    local url="$1" name="$2" timeout="${3:-60}"
    local i=0
    while ! check_url "$url"; do
        i=$((i+1))
        if [[ $i -ge $timeout ]]; then
            echo "timeout waiting for $name at $url" >&2
            return 1
        fi
        sleep 1
    done
    echo "$name ready at $url"
}

# 1. Infra
if ! docker compose -f docker-compose.dev.yml ps --status running 2>/dev/null | grep -q .; then
    echo "starting postgres + redis (make dev)..."
    make dev
else
    echo "postgres + redis: already running"
fi

# 2. Backend
if check_url "http://localhost:8080/healthz"; then
    echo "backend: already running on :8080"
else
    echo "seeding db + starting backend (logs: $BACKEND_LOG)..."
    (cd backend && make seed) >>"$BACKEND_LOG" 2>&1 || {
        echo "seed failed — see $BACKEND_LOG" >&2
        exit 1
    }
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

# 4. e2e deps
cd "$REPO_ROOT/e2e"
if [[ ! -d node_modules ]]; then
    echo "installing e2e deps..."
    npm install
fi
if ! npx --no-install playwright --version >/dev/null 2>&1 || \
   [[ ! -d "${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}" && \
      ! -d "$HOME/Library/Caches/ms-playwright" && \
      ! -d "$LOCALAPPDATA/ms-playwright" ]]; then
    echo "installing chromium for playwright..."
    npx playwright install --with-deps chromium
fi
if [[ ! -f .env && -f .env.example ]]; then
    echo "creating e2e/.env from .env.example"
    cp .env.example .env
fi

# 5. Mode (menu or flag)
run_mode() {
    case "$1" in
        ui)       npm run test:ui ;;
        headed)   npm run test:headed ;;
        headless) npm test ;;
        codegen)  npm run codegen ;;
        report)   npm run report ;;
        *)
            echo "unknown mode: $1 (expected ui|headed|headless|codegen|report)" >&2
            exit 2
            ;;
    esac
}

if [[ -n "$MODE" ]]; then
    run_mode "$MODE"
    exit 0
fi

echo
echo "What do you want to run?"
echo "  1) UI mode (recommended)"
echo "  2) Headed"
echo "  3) Headless (full suite)"
echo "  4) Codegen"
echo "  5) Show last report"
echo "  6) Quit"
read -rp "> " choice
case "$choice" in
    1) run_mode ui ;;
    2) run_mode headed ;;
    3) run_mode headless ;;
    4) run_mode codegen ;;
    5) run_mode report ;;
    6|q|"") echo "bye" ;;
    *) echo "unknown choice: $choice" >&2; exit 2 ;;
esac
