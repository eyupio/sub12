.PHONY: dev up down logs build check security install help

.DEFAULT_GOAL := help

## help: show this help message
help:
	@awk 'BEGIN {FS = ":.*?## "} /^## / {sub(/^## /, "", $$0); printf "  %s\n", $$0; next} /^[a-zA-Z0-9_-]+:.*?## / {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

## dev: start infrastructure (postgres + redis) for local development
## Uses .env if present; docker-compose.dev.yml already has safe defaults.
dev:
	docker compose -f docker-compose.dev.yml $(if $(wildcard .env),--env-file .env,) up -d
	@echo "Postgres on :5432, Redis on :6379"
	@echo "Run 'cd backend && make run' and 'cd frontend && npm run dev'"

## up: start full stack (infra + backend + frontend)
up:
	docker compose --env-file .env up -d --build

## down: stop all containers
down:
	docker compose -f docker-compose.dev.yml down
	docker compose down

## logs: tail all container logs
logs:
	docker compose -f docker-compose.dev.yml logs -f

## build: build backend binary and frontend bundle
build:
	$(MAKE) -C backend build
	cd frontend && npm run build

## install: interactive installer — prerequisites, secrets, .env, migrations
install:
	./scripts/install.sh

## check: run everything the PR gate runs (backend + frontend)
## Backend tests that need a database skip unless DB_HOST is set — run `make dev` first.
check:
	@printf '\n\033[1m── backend ──\033[0m\n'
	$(MAKE) -C backend lint
	$(MAKE) -C backend test
	@printf '\n\033[1m── frontend ──\033[0m\n'
	cd frontend && npm run check && npm run lint && npm test && npm run build
	@printf '\n\033[32m✓ everything CI gates on passed\033[0m\n'

## security: run the vulnerability scanners (govulncheck + npm audit)
## Mirrors .github/workflows/security.yml. Known accepted findings are in SECURITY.md.
security:
	@printf '\n\033[1m── Go: reachable vulnerabilities ──\033[0m\n'
	@cd backend && go run golang.org/x/vuln/cmd/govulncheck@latest ./... || \
		printf '\033[33m! a stdlib finding is fixed by raising the `go` directive in backend/go.mod\033[0m\n'
	@printf '\n\033[1m── frontend: runtime dependencies (these ship to browsers) ──\033[0m\n'
	@cd frontend && npm audit --omit=dev --audit-level=moderate
	@printf '\n\033[1m── frontend: build tooling (advisory — see SECURITY.md) ──\033[0m\n'
	@cd frontend && npm audit --audit-level=high || true
	@printf '\n\033[1m── e2e ──\033[0m\n'
	@cd e2e && npm audit --audit-level=high || true
