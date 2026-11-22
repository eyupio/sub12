# GitHub Copilot Instructions — sub-12

`CLAUDE.md` is the source of truth for this repository's layout, commands, migration rules and conventions, and it points to `docs/claude/` for the API routes, domain rules, environment variables, CI pipeline and design system. Read it first. This file only repeats the rules that are easy to miss.

- Backend is Handler → Service → Repository (Go, `chi`, `pgx`, `zerolog`, `envconfig`). Parameterised SQL only (`$1`, `$2`); never concatenate user input into a query. Log with `zerolog`, not `fmt.Println` or `log.Println`.
- Migrations: create them with `make migrate-create NAME=description`, make every DDL statement idempotent, give every `.up.sql` a matching `.down.sql`, and never reuse a sequence number.
- Frontend is TanStack Router and Query, Zustand and Tailwind. API calls go in `src/api/` through the shared client; avoid `any`.
- Run `cd backend && make test` and `cd frontend && npm test` before pushing.
- Do not add features, refactoring or comments beyond what was asked.
