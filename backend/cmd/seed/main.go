package main

import (
	"context"
	"fmt"
	"os"
	"time"

	_ "embed"

	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed seed.sql
var seedSQL string

func main() {
	dsn := buildDSN()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		fmt.Fprintf(os.Stderr, "seed: connect: %v\n", err)
		os.Exit(1)
	}
	defer pool.Close()

	if _, err := pool.Exec(ctx, seedSQL); err != nil {
		fmt.Fprintf(os.Stderr, "seed: exec: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("seed: ok")
}

func buildDSN() string {
	host := envOr("DB_HOST", "localhost")
	port := envOr("DB_PORT", "5432")
	name := envOr("DB_NAME", "sub12")
	user := envOr("DB_USER", "sub12")
	pass := os.Getenv("DB_PASSWORD")
	ssl := envOr("DB_SSLMODE", "disable")

	if pass == "" {
		fmt.Fprintln(os.Stderr, "seed: DB_PASSWORD is required")
		os.Exit(1)
	}

	return fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=%s", user, pass, host, port, name, ssl)
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
