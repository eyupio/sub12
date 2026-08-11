## 2026-08-11 - Stale Go Version in README

Learning: `backend/go.mod` pins `go 1.25` (and CI resolves its toolchain from that file via `go-version-file: backend/go.mod`), matching CLAUDE.md's documented "Go 1.25, Chi v5 router, pgx v5, ...". `README.md` still said "Go 1.24" in both the Stack table and the Quick Start Prerequisites list — likely left over from before a `go.mod` bump.
Impact: A new contributor following the README's Prerequisites would install Go 1.24, which still builds today but silently diverges from the version CI and the primary CLAUDE.md reference actually use — exactly the kind of gap that surfaces later as a "works in CI, not locally" report.
Action: Updated both README.md mentions to Go 1.25+. When `go.mod`'s `go` directive changes, grep the repo for the old version string (`README.md`, `frontend/README.md`, CI badges) rather than assuming go.mod is the only place it's written.
