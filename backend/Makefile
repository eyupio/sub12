.PHONY: run build test migrate-up migrate-down lint tidy seed

# Load .env so DB_USER, DB_PASSWORD etc. are available to make targets.
-include ../.env
export

MIGRATE_URL ?= postgres://$(DB_USER):$(DB_PASSWORD)@$(DB_HOST):$(DB_PORT)/$(DB_NAME)?sslmode=disable
MIGRATIONS_DIR := internal/db/migrations

## run: start the API server (requires running postgres)
run:
	go run ./cmd/api

## build: compile the binary
build:
	go build -o bin/api ./cmd/api

## test: run all tests with race detector
test:
	go test -race -count=1 ./...

## tidy: tidy and verify go modules
tidy:
	go mod tidy
	go mod verify

## lint: run go vet
lint:
	go vet ./...

## migrate-up: apply all pending migrations
migrate-up:
	migrate -path $(MIGRATIONS_DIR) -database "$(MIGRATE_URL)" up

## migrate-down: roll back the last migration
migrate-down:
	migrate -path $(MIGRATIONS_DIR) -database "$(MIGRATE_URL)" down 1

## migrate-create: create a new migration (usage: make migrate-create NAME=add_foo)
## Auto-detects the next sequence number to prevent duplicate prefixes.
migrate-create:
	@NEXT=$$(ls -1 $(MIGRATIONS_DIR)/*.sql 2>/dev/null \
		| sed 's/.*\///' | cut -d_ -f1 | sort -n | tail -1 \
		| awk '{printf "%06d", $$1+1}') ; \
	if [ -z "$$NEXT" ]; then NEXT="000001"; fi ; \
	echo "Creating migration $$NEXT\_$(NAME)" ; \
	migrate create -ext sql -dir $(MIGRATIONS_DIR) -seq -digits 6 $(NAME)

## migrate-lint: check for duplicate migration prefixes
migrate-lint:
	@dupes=$$(ls -1 $(MIGRATIONS_DIR)/*.sql 2>/dev/null \
		| sed 's/.*\///' | cut -d_ -f1 | sort | uniq -d) ; \
	if [ -n "$$dupes" ]; then echo "ERROR: duplicate prefixes: $$dupes"; exit 1; fi ; \
	echo "No duplicate migration prefixes found."

## seed: load development seed data (dev/admin accounts, password: password123)
seed:
	psql "$(MIGRATE_URL)" -f internal/db/seed/seed.sql
