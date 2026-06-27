# Activity Simulation — Deferred Enhancements

> **Status: all items below were implemented in the follow-up pass** (migration
> `000102_simulation_extended_actions`). This file is retained as a design
> record. The notes describe the intent and where each feature lives.

This file tracked the Phase 5–7 enhancements that were deferred from the
initial hardening pass (Phases 1–4). Phases 1–4 shipped: migration
`000101_simulation_counters_audit`, correctness fixes (cache staleness,
per-action counts, post-cap retry, discipline/location on posts, per-persona
skill + realistic scores, bcrypt MinCost), the count-offset random-selection
performance fix, admin controls (personas list/edit/delete, purge, cleanup,
audit log, run-now with configurable size), simulated-user flagging in the
admin user list, persona profile editing + avatar upload, and accompanying
tests.

The items below were then implemented in the follow-up pass:

---

## Extended Automation

### 1. Gear on simulated posts (rifle + pellet wiring) — DONE
`SimulationService` now wires `RifleService` + `PelletService`. `EnsurePersonas`
creates one randomized rifle (Go-side `simRifles` catalog) and pellet
(`simPellets`) per persona; `doPost` sets `RifleID`/`PelletID` from a cached
`personaGear` map (loaded via `RifleService.List`/`PelletService.List` on cache
miss). Provisioning failures are non-fatal (persona posts without gear).

### 2. Broader action coverage (comments on posts/activities, shares) — DONE
`doComment` now targets `score_card` (60%), `post` (30%), or `activity` (10%)
via new `RandomPublicPost` / `RandomActivity` repo helpers (count-offset
pattern). New `doShare` action shares a random public score card via
`PostService.Share`. New `share_weight` setting + `share_count` counter.

### 3. Follow decay / unfollow — DONE
New `unfollow_weight` setting + `unfollow_count` counter. `doUnfollow` picks a
random currently-followed user via `RandomFollowedUser` (from `user_follows`)
and calls `SocialService.Unfollow`, preventing follow-graph saturation.

### 4. Time-of-day / day-of-week shaping — DONE
`hourly_multipliers` JSONB (24 values, default all 1.0) on
`simulation_settings`. The runner applies `hourlyMultiplier(mults, hour)` to
the per-tick budget (0 = quiet, 2 = double). Frontend renders a 24-input grid
with an "Evening preset" button.

### 5. Persona personalities — DONE
`personaProfile` (loquacious / sociable / competitive, stable per-id hash)
biases `pickAction`: comment weight × (0.5 + loquacious), follow × (0.5 +
sociable), post × (0.5 + competitive), share × (0.5 + sociable). Cached
alongside the skill map.

---

## Status / UX Polish

### 6. Per-action breakdown in run-now result — DONE
`RunNow`/`performActions` return a `map[string]int` counts map; the handler
returns `{"performed": N, "counts": {...}}`; the frontend result banner shows
the breakdown.

### 7. Last-error and tick-health surfacing — DONE
`last_tick_at` column + `TouchTick` called every tick (even when idle). Status
surfaces `last_tick_at`, `unfollow_count`, `share_count`. The status panel
shows a "Last Tick" time and an "active now" green-dot indicator.

### 8. Active-window timezone helper improvements — DONE
The active-window helper shows a local-time label and a live "active now"
green dot when the current UTC hour is within the window.

### 9. Banner lifecycle — DONE
`runResult`/`saveOk`/`serverError` are cleared on every new submit, error, and
run-now; distinct styling per type.

---

## Transparency / Filtering

### 10. Filter simulated content from public surfaces — DONE
`include_in_public_stats` setting (default on). When off,
`SimulationService.ExcludeSimulatedFromPublic()` returns true; the activity
service excludes simulated users from the public and for-you feeds, and the
pellet test service excludes simulated users' sessions from the public
leaderboard. Wired via a `SimulatedContentFilter` interface + setters on
`ActivityService` and `PelletTestService`.

### 11. Public bot badge (ethical transparency) — DONE
`is_simulated` added to `PublicProfile` and selected in
`SocialRepository.GetPublicProfile`. The public profile page shows a
"Simulated" badge next to the display name.

---

## Performance & Robustness

### 12. Batch provisioning outside the mutex — DONE
`EnsurePersonas` (bcrypt + inserts + gear creation) now runs **outside** `s.mu`
in both `RunOnce` and `RunNow`; only the fast action loop holds `s.mu`. A
dedicated `rngMu` and `cacheMu` keep the shared rng and caches safe across the
locked/unlocked boundary.

### 13. `TABLESAMPLE` for very large tables — DEFERRED
The count-offset selection remains O(2) queries. `TABLESAMPLE BERNOULLI` was
not adopted because it samples a percentage of rows, not a fixed count, and
introduces empty-result edge cases that complicate the simple picker. The
current approach is adequate for the foreseeable content volume; revisit if
`score_cards`/`users` grows past ~1M rows.

### 14. Repo-level integration tests — DONE
`repository/simulation_test.go` exercises settings round-trip (including
`hourly_multipliers` decode), `TouchTick`, `IncrementCounts`, and audit append
against a live Postgres. Gated on `SIM_DB_TEST=1` so it skips cleanly locally
and in CI without infra, runs on demand with `make dev` up.

---

## When picking up an item

1. Create the migration with `make migrate-create` (next sequence number).
2. Update `CLAUDE.md` migration count + the admin-endpoints section if routes
   change.
3. Add/extend the `simulationRepo` interface + `mockSimulationRepo` for any
   new repo method so service tests stay DB-free.
4. Run `cd backend && make lint && make test && make build`.
5. Run `cd frontend && npm run check && npm run lint && npm test && npm run build`.
