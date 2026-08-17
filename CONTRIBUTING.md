# Contributing to sub12

Thanks for wanting to help. sub12 is a target shooting companion app built by
[EyUp.io](https://eyup.io) for the UK airgun benchrest community — most of what
makes it good came from shooters describing what a score card evening actually
looks like, so a bug report from the range is as valuable as a pull request.

- [Ways to contribute](#ways-to-contribute)
- [Getting set up](#getting-set-up)
- [The change you are making](#the-change-you-are-making)
- [Before you open a pull request](#before-you-open-a-pull-request)
- [Conventions that will get flagged in review](#conventions-that-will-get-flagged-in-review)
- [Licensing of contributions](#licensing-of-contributions)

## Ways to contribute

| | |
|---|---|
| **Found a bug** | [Open a bug report](https://github.com/eyupio/sub12/issues/new?template=bug_report.yml). Tell us what you shot, what you expected, and what appeared. |
| **Want a feature** | [Open a feature request](https://github.com/eyupio/sub12/issues/new?template=feature_request.yml), or use the in-app feature board — ideas raised there get triaged onto the public roadmap. |
| **Found a security hole** | Do **not** open an issue. Read [SECURITY.md](SECURITY.md). |
| **Want to write code** | Read on. Small, focused pull requests get reviewed fastest. |
| **Not a programmer** | Documentation fixes, better wording in the app, testing an APK on a device you own and reporting what broke — all genuinely useful. |

If you are planning something substantial, open an issue and describe the
approach before writing it. That is not gatekeeping — it is so nobody spends a
weekend on a design we already know conflicts with, say, how league rounds are
verified.

## Getting set up

The install script does the whole thing, including generating real secrets:

```bash
git clone https://github.com/eyupio/sub12.git
cd sub12
./scripts/install.sh
```

Pick **Local development** when it asks. It starts Postgres and Redis in Docker,
writes a `.env`, runs the migrations, and offers to load seed data. See
[README.md](README.md#installation) for the manual equivalent and the
prerequisites.

Once it finishes:

```bash
cd backend  && make run     # API on :8080
cd frontend && npm run dev  # Vite on :5173
```

Seeded accounts are `dev@sub12.local` and `admin@sub12.local`, password
`password123`. They only exist in development.

## The change you are making

Read [CLAUDE.md](CLAUDE.md) first. It is the project's single source of truth —
architecture, layer boundaries, and the rules behind decisions that look
arbitrary until you know why. Some of those rules exist because of production
outages. The ones that catch people most often:

**Database migrations.** Always `cd backend && make migrate-create NAME=add_foo`
— never hand-write the file, because the Makefile picks the next sequence
number and CI rejects duplicate prefixes. Every `.up.sql` needs a `.down.sql`
that fully reverses it, and all DDL must be idempotent (`IF NOT EXISTS`,
`ON CONFLICT DO NOTHING`, `EXCEPTION WHEN duplicate_object`). One concern per
migration.

**Backend layering** is strict: handler → service → repository. Handlers write
HTTP responses, services hold business logic and return domain errors,
repositories run pgx queries. Don't reach past a layer.

**A new notification type** touches nine places, including two positional
argument lists in the repository. `model/notification_test.go` fails until you
have done all of them — that is intentional, and the test message tells you
what is missing.

**A new public page** has to be a child of `rootRoute`/`authRoute`, added to
both `handler.StaticPages` and the matching `location` block in
`frontend/nginx.conf`, or it silently declares itself a duplicate of the
homepage and never gets indexed. Tests pin both halves.

**Outgoing links** in email or push must come from a config field derived from
`SITE_URL`. Never hard-code a host, never let one default to `localhost`.

## Before you open a pull request

Run what CI runs. All of it, from the repo root:

```bash
make check
```

Or by hand:

```bash
cd backend  && make lint && make test      # go vet, then go test -race
cd frontend && npm run check && npm run lint && npm test && npm run build
```

Two things worth knowing:

- `npm run check` is `tsc -b`, not `tsc --noEmit`. The root `tsconfig.json` is a
  solution file with `"files": []`, so a plain `tsc --noEmit` type-checks
  *nothing* and exits 0 on any codebase however broken. Only build mode follows
  the project references.
- Backend tests that need a database skip themselves unless `DB_HOST` is set.
  `make dev` gives you one; without it a green run may have skipped the tests
  covering your change.

The Playwright suite is **not** in the PR gate. If you touched score capture,
leagues, events or clubs, run it yourself — `./scripts/e2e.sh`, or see
[E2E_TESTING.md](E2E_TESTING.md).

### Pull request hygiene

- Branch off `main`. Keep one logical change per PR.
- Write a commit message that says *why*, not just what. The diff already says
  what.
- Fill in the pull request template. The "how did you test this" box is the one
  reviewers actually rely on.
- Expect review comments. They are about the code.

## Conventions that will get flagged in review

These come straight from [CLAUDE.md](CLAUDE.md) and are the most common review
comments:

- **Don't add features, refactoring or improvements beyond what the issue
  asks.** A drive-by rename in an otherwise good PR makes it slower to review.
- **Don't add comments or docstrings to code you didn't change.**
- **Prefer editing an existing file over creating a new one.** Layer
  directories hold one file per domain, named after the domain.
- **No `fmt.Printf` / `log.Printf`** in the backend — use `zerolog`.
- **No SQL built by string concatenation.** Parameterise with `$1`, `$2`. Where
  a query genuinely has to be dynamic, build `$n` placeholders and pass the
  values as args — see `repository/club.go` for the pattern.
- **Frontend loading states** use `components/Skeleton.tsx`, not a bare
  "Loading…" string, which collapses the layout and reflows when data lands.
- **Use the design system** in `frontend/src/index.css` — motion tokens,
  elevation, `.btn`/`.field`/`.surface-card`, the documented `z-index` layers —
  rather than ad-hoc Tailwind.

## Licensing of contributions

sub12 is licensed under the **GNU Affero General Public License v3.0** (see
[LICENSE](LICENSE)). By opening a pull request you agree that your contribution
is licensed under the same terms.

There is no CLA to sign. You keep the copyright in your own work.

One consequence worth understanding before you build on this: the AGPL's
section 13 means that if you run a modified sub12 as a network service, you must
offer its source to the people using it over that network. That is why the app
footer carries a **Source** link — a fork that changes the code should point
`VITE_SOURCE_URL` at its own repository.
