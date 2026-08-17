<!--
Thanks for contributing. Keep this short — the diff says what changed, so use
the space to say why, and to tell reviewers how you know it works.

If this fixes a security vulnerability, please make sure it was reported
privately first (SECURITY.md) so the advisory and the fix can land together.
-->

## What and why

<!-- What does this change, and what problem does it solve? One paragraph is plenty. -->

Closes #

## How you tested it

<!--
The box reviewers actually rely on. Be specific: "ran the league standings after
verifying a card and the total moved" beats "tested locally".
-->

## Checklist

- [ ] `cd backend && make lint && make test` passes
- [ ] `cd frontend && npm run check && npm run lint && npm test && npm run build` passes
- [ ] Backend tests ran against a database (`make dev` first) — DB-backed tests skip silently without `DB_HOST`
- [ ] I read the relevant section of [CLAUDE.md](../CLAUDE.md) and followed its conventions
- [ ] No unrelated refactoring, renames or comment additions in this diff

## If it applies

<!-- Delete any line that doesn't apply to this change. -->

- [ ] **Migration** — created with `make migrate-create`, idempotent DDL, matching `.down.sql` that fully reverses it, one concern only
- [ ] **New notification type** — all nine places done; `model/notification_test.go` passes
- [ ] **New public page** — child of `rootRoute`/`authRoute`, added to both `handler.StaticPages` and `frontend/nginx.conf`, and to the sitemap if it should be indexed
- [ ] **New env var** — added to `config.go` with an empty default, derived from `SITE_URL` if it's a user-facing link, added to the `Validate()` guard, and documented in `CLAUDE.md`, `.env.example` and `docker-compose.yml`
- [ ] **New moderator capability** — catalogue entry in `model/moderator.go` plus the gated call site
- [ ] **Touched score capture, leagues, events or clubs** — ran the Playwright suite (`./scripts/e2e.sh`), which is *not* in the PR gate
- [ ] **Changed the UI a demo recording shows** — re-recorded with `./scripts/record-demos.sh`
- [ ] **Native change** — built and checked on a real device or emulator

## Notes for reviewers

<!-- Anything you're unsure about, a trade-off you made, or a follow-up you're deliberately leaving out. -->
