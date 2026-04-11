.PHONY: dev up down logs build

## dev: start infrastructure (postgres + redis) for local development
dev:
	docker compose -f docker-compose.dev.yml --env-file .env up -d
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
