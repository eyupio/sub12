.PHONY: run build test migrate-up migrate-down lint tidy

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
migrate-create:
	migrate create -ext sql -dir $(MIGRATIONS_DIR) -seq $(NAME)
