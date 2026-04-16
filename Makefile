.PHONY: dev up down logs build help

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
