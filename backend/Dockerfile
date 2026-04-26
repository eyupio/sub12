# Build stage
FROM golang:1.24-alpine AS builder

WORKDIR /app

# Cache dependencies
COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o bin/api ./cmd/api

# Runtime stage
FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata postgresql16-client \
    && addgroup -S app && adduser -S -G app -u 10001 app

WORKDIR /app

COPY --from=builder --chown=app:app /app/bin/api .

USER app

EXPOSE 8080

ENTRYPOINT ["./api"]
