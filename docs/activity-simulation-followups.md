# Activity Simulation — Deferred Enhancements

This file tracks the Phase 5–7 enhancements that were intentionally deferred
from the initial hardening pass (Phases 1–4) of the Activity Simulation feature.
Phases 1–4 shipped: migration `000101_simulation_counters_audit`, correctness
fixes (cache staleness, per-action counts, post-cap retry, discipline/location
on posts, per-persona skill + realistic scores, bcrypt MinCost), the
count-offset random-selection performance fix, admin controls (personas
list/edit/delete, purge, cleanup, audit log, run-now with configurable size),
simulated-user flagging in the admin user list, persona profile editing +
avatar upload, and accompanying tests.

The items below are the remaining enhancements, grouped by theme. Each is
scoped so it can be picked up independently.

---

## Extended Automation

### 1. Gear on simulated posts (rifle + pellet wiring)
Currently `doPost` sets discipline/location/distance but no rifle or pellet, so
simulated cards lack gear badges and don't feed into rifle/pellet stats.

- Wire `RifleService` + `PelletService` into `SimulationService`.
- In `EnsurePersonas`, after creating each user, create one randomized rifle
  (from a Go-side catalog mirroring `frontend/src/catalog/rifleCatalog.ts`) and
  one pellet (mirroring `pelletCatalog.ts`).
- Cache persona → gear IDs alongside the persona cache.
- `doPost` sets `RifleID` and `PelletID` from the actor's gear.
- Surface gear in the `SimulatedPersona` list (optional).

### 2. Broader action coverage (comments on posts/activities, shares)
Currently comments only target score cards; likes only target score cards.

- `doComment` randomly targets `score_card`, `post`, or `activity`.
- Add `RandomPublicPost` / `RandomActivity` repo helpers (reuse the
  count-offset pattern from `RandomPublicCard`).
- Add a `share` action + `share_weight` (calls the post share service path).

### 3. Follow decay / unfollow
The follow graph only grows; saturated personas can't follow new targets.

- Add `unfollow_weight` setting + `doUnfollow` action.
- New `RandomFollowedUser` repo helper: picks a user the actor currently
  follows (from `user_follows`).
- Calls `social.Unfollow`.
- Migration: `ADD COLUMN unfollow_weight INT NOT NULL DEFAULT 0` + CHECK.
- Frontend: add Unfollow weight input to the action-weights grid; surface
  `unfollow_count` in status.

### 4. Time-of-day / day-of-week shaping
Currently the hourly rate is flat; real communities are busier evenings/weekends.

- Add `hourly_multipliers JSONB` (24 values, default all `1.0`) to
  `simulation_settings`.
- Runner applies `hourly_multipliers[hour]` to the per-tick budget
  (`1.0` = baseline, `0` = quiet, `2` = busy).
- Optional: `weekday_multiplier` for weekend up-weighting.
- Frontend: 24-input slider grid with "weekday/evening" preset button.

### 5. Persona personalities
Currently all personas draw from the same uniform random content pools.

- Derive a stable per-persona "personality" from the id hash: loquacious vs
  quiet (comment weight), sociable vs reserved (follow weight), competitive
  vs casual (post frequency).
- Store alongside the skill bias in the `skills` map (or a richer
  `map[string]personaProfile`).
- Bias action selection and content pool choices per persona.

---

## Status / UX Polish

### 6. Per-action breakdown in run-now result
`runNow` returns only `performed` (a single count). Show the per-action
breakdown so the admin sees what a run did.

- `RunNow` / `performBatch` return a `map[string]int` alongside the total.
- Handler returns `{"performed": N, "counts": {"post": a, "like": b, ...}}`.
- Frontend: result banner shows the breakdown.

### 7. Last-error and tick-health surfacing
`last_error` is stored but only shown in the status panel. Add:

- A small "recent errors" list (last N errors from audit or a dedicated log).
- Tick health: `last_tick_at` vs `last_run_at` so operators can tell if the
  runner is alive but idle (disabled/outside active hours) vs stuck.

### 8. Active-window timezone helper improvements
Currently shows a local-time label. Add:

- A visual "active now" indicator (green dot when within the window).
- Next-active countdown when outside the window.

### 9. Banner lifecycle
`runResult`/`saveOk` can show simultaneously and don't auto-clear on every new
action. Tighten:

- Clear both on any new submit / error / dialog open.
- Distinct styling for info vs success vs error so they don't blend.

---

## Transparency / Filtering

### 10. Filter simulated content from public surfaces
Simulated cards/comments appear in public feeds, leaderboards, and stats with
no way to exclude them.

- Add an admin setting `include_in_public_stats` (default on) or a global
  toggle.
- Where relevant, add `AND NOT u.is_simulated` filters to public leaderboard /
  stats queries when the toggle is off.
- Document the tradeoff (fewer "live" entries vs honesty).

### 11. Public bot badge (ethical transparency)
Currently simulated accounts are only distinguishable in the admin panel.

- Add a visible "bot" / "simulated" badge on public profiles and cards when
  `is_simulated` is true.
- Surface `is_simulated` on `PublicProfile` (read-only).
- Frontend: badge component next to display name.

---

## Performance & Robustness

### 12. Batch provisioning outside the mutex
`EnsurePersonas` runs bcrypt (now MinCost) and N inserts under `s.mu`, blocking
the runner. For large `persona_count` increases this can stall ticks.

- Move provisioning out of `performBatch`'s critical section, or run it in a
  dedicated goroutine with its own smaller lock.
- Alternatively, pre-hash a batch of passwords once at startup.

### 13. `TABLESAMPLE` for very large tables
The count-offset selection is O(2) queries but the OFFSET still scans to the
offset row. For very large `score_cards` / `users` tables, consider
`TABLESAMPLE BERNOULLI` or a cached random-id pool.

### 14. Repo-level integration tests
The repository layer has no tests (convention is service-level mocks). Consider
adding a `repository/simulation_test.go` that runs against the CI Postgres
service container to catch SQL regressions (column lists, cascade behavior,
audit insertion).

---

## When picking up an item

1. Create the migration with `make migrate-create` (next sequence number).
2. Update `CLAUDE.md` migration count + the admin-endpoints section if routes
   change.
3. Add/extend the `simulationRepo` interface + `mockSimulationRepo` for any
   new repo method so service tests stay DB-free.
4. Run `cd backend && make lint && make test && make build`.
5. Run `cd frontend && npm run check && npm run lint && npm test && npm run build`.
