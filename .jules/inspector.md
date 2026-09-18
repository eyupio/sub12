## 2026-09-18 - LeagueSettings' Capability-Gating Fix Was Never Ported to ClubSettings

**Finding:** CLAUDE.md's "Moderator roles" section documents, in detail, a fix
already shipped in `LeagueSettings.tsx`: every settings section threads a
`canManage` prop (`can(viewerRole, PERM.manageSettings)`), disables its inputs
and hides its Save button when the viewer lacks `manage_settings`, and shows a
`CapabilityNote` explaining which permission is missing and who grants it —
because rendering the form live for any moderator meant a delegated one could
type into it and get "Failed to save league" back with no explanation. The
backend enforces the identical `PermManageSettings` check for every club
mutation (`UpdateClub`, `UpdateImageURL`, `ReplaceOpeningHours`,
`RegenerateJoinCode` in `service/club.go`), but `ClubSettings.tsx` — the exact
structural sibling, built the same way, fetching the same
`getModeratorPermissions` response — never threaded `canManage` through any of
its eight sections (Image, General, Location & Contact, Opening Hours,
Disciplines, Membership, Privacy, Regional). `permissionData` was fetched at
the page level and used only for `MembersSection`'s `canDelegate` and the
announcement composer's `canSend` — every other section rendered fully live
and editable for **any** club moderator, reproducing the exact bug the League
side was already fixed for. A club moderator promoted with only
`manage_members` (the default promotion grant explicitly excludes
`manage_settings`) could edit the club's name, address, opening hours, image,
disciplines, privacy and regional defaults and have every save silently 403,
with a bare "Failed to save" toast and no indication a permission was missing.

**Learning:** When CLAUDE.md documents a fix as "this exact bug, already
fixed here", always check every other file built to the same pattern — a
league/club (or any other) pair of structurally-parallel settings pages is a
prime place for a fix to have landed on only one twin. `grep -n "canManage"`
across sibling files is a fast litmus test: `LeagueSettings.tsx` had ~15 hits,
`ClubSettings.tsx` had zero, despite both fetching `getModeratorPermissions`
and rendering the identical section shape.
**Prevention:** Search for a permission-gating pattern's twin whenever a
CLAUDE.md doc singles out one page as the place a UX bug was fixed — the
prose describing the fix is usually written generally enough ("A control the
viewer's grant doesn't cover is drawn read-only") to sound like a project-wide
rule, but the code may only have been changed in the one file the bug report
named.

## 2026-08-28 - A Documented, Unfixed Bug Sat in testsmith.md for Six Weeks

**Finding:** `.jules/testsmith.md`'s 2026-07-17 entry named an exact, unguarded
divide-by-zero at `pellet_testing.go:589` (`computeAutoGroupSize`): the guard
`detections[0].DiameterMM != nil && detections[0].RadiusPixels > 0` accepts a
non-nil pointer to a *zero* calibration diameter, and Go float division by
zero gives `+Inf`, which then makes `maxDist/pixelsPerMM` collapse to `0` —
so a malformed detection payload (bad client-side calibration, or a
deliberately hostile `diameter_mm: 0` in the batch-detections POST body)
silently persists a "perfect" 0mm group instead of erroring or falling back
to `nil`. That's a data-integrity bug on exactly the kind of "zero" edge case
this mission brief calls out, on a POST endpoint (`CreateDetections`/
`ReplaceDetections`) with no server-side validation that `diameter_mm > 0`.
testsmith deliberately scoped it out ("fixing the zero-diameter guard is out
of scope for a test-only pass") and left it as a named follow-up with a line
number. Nobody picked it up in the six weeks and ~9 merged PRs between then
and this session — it was still exactly where testsmith left it, unchanged.
**Learning:** A journal entry that says "found X, did not fix, here's the
line" is a live TODO list this repo doesn't have anywhere else (no TODO/FIXME
comments exist in the codebase — confirmed by grep). It will not surface on
its own; nothing greps `.jules/*.md` for "did not fix" as part of any lint or
CI step. It only gets picked up if a later agent happens to read that specific
journal and the bug is still reproducible at the line number given.
**Prevention:** Before starting a fresh audit, `grep -rn "did not fix\|out of
scope\|follow-up\|scoped it out" .jules/*.md` across *all* the journals (not
just inspector.md) — testsmith's, bolt's, sentinel's, etc. all occasionally
name a concrete unfixed defect with enough detail to verify and fix directly,
which is often faster and higher-confidence than a fresh audit from scratch.
This session's fix: `groupSizeFromDetections` (extracted from
`computeAutoGroupSize` so the pure math is unit-testable without the DB call
that previously blocked it) now requires `*DiameterMM > 0`, not just `!= nil`.

## 2026-08-21 - A Bare Calendar Date Parsed With `new Date(string)` Is a Recurring Timezone Trap
**Finding:** `frontend/src/utils/date.ts` already has a documented fix for one specific pitfall: `new Date("2026-04-13")` (a bare `YYYY-MM-DD` string, the shape every SQL `date` column comes back as after the backend's `::text` cast — see `starts_on`/`ends_on` on leagues, seasons and rounds) is parsed by the JS spec as **UTC midnight**, not local midnight. For a viewer west of UTC that lands several hours into the *previous* local day. `toDate()` in that file fixes it by hand-splitting the string into a local `new Date(y, m-1, d)` instead, with a comment explaining exactly why. But that fix is local to `formatDate`/`formatDateShort`/etc. — it was never applied to `Dashboard.tsx`'s own `computeInsights`, which independently did `new Date(l.ends_on).getTime()` (twice) to build the "league closes soon" nudge and its "N days remaining" count. The bug is silent and CI-invisible: the whole frontend test suite runs in a UTC container, where a bare-date UTC parse and a bare-date local parse are numerically identical, so nothing failed. For a real user in a negative-UTC-offset timezone, the countdown reads low by up to a day and a league can either drop out of the "closing soon" insight a day early or (documented as reproduced with `TZ=Etc/GMT+12`) get flagged as closing within 7 days when it is genuinely 8 local days out.
**Action:** Before writing (or reviewing) *any* `new Date(someString)` in this frontend where `someString` is a bare `YYYY-MM-DD` — grep the surrounding code for what produced the string; if it's a `starts_on`/`ends_on`/similar `*_on` field, it came straight off a Postgres `date` column and is exactly this trap — reuse `toDate` from `utils/date.ts` (now exported) rather than re-deriving the fix. `grep -rn "new Date(" frontend/src --include=*.tsx --include=*.ts` and check each hit's argument against the `date::text`-cast fields in `backend/internal/repository/*.go` (`grep -n "::text" backend/internal/repository/*.go` finds the source columns) is the fast way to sweep for more instances of this same defect class elsewhere in the app — I did not do a full sweep this session, only fixed the one already reported by the audit; `formatRelative`'s own `new Date(iso)` in the same file is fine because push/notification/activity timestamps come back as full RFC3339 instants, not bare dates, so this is a per-field judgement call, not a blanket rule against `new Date(string)`.
**Testability note:** A regression test for this class needs the runtime's *own* timezone to differ from UTC to have any chance of failing on the buggy code, because the buggy and fixed parses coincide whenever the host is already UTC (which CI is). Node (unlike browsers) honours a runtime write to `process.env.TZ` for every `Date` constructed afterwards — `vi.stubEnv`/direct assignment + `vi.setSystemTime` from vitest's fake timers combine to give a portable, deterministic test (see `frontend/src/pages/__tests__/dashboardInsights.test.ts`) without needing a real non-UTC CI runner.

## 2026-07-24 - Per-Section Settings Mutations Missing the Cross-Cutting List-Cache Key
**Finding:** `LeagueSettings.tsx` splits editing into independent sub-components (`LeagueImageSection`, `GeneralInfoSection`, `RulesSection`, `PrivacySection`, `RegionalSection`, `JoinPolicySection`, `MembersSection`), each with its own `useMutation`. Three of them (image upload, name/description, and season `starts_on`/`ends_on` via Rules) mutate fields that are also denormalized into `MyLeagueSummary` (`backend/internal/model/league.go`), the shape returned by `leagueApi.listMine()` and cached under the `['my-leagues']` query key consumed by `Dashboard.tsx` and `Leagues.tsx`. All three `onSuccess` handlers only invalidated `['leagues', leagueId]` / `['leagues', leagueId, 'config']` / `['leagues']` — never `['my-leagues']` — so with the app's 5-minute global `staleTime` a freshly renamed league, a newly uploaded league image, or (worst) an edited season end date kept showing the old value on the Dashboard's "My Leagues" card, including the derived "days left" countdown and active/inactive filtering that reads `starts_on`/`ends_on` directly. This is the exact same defect class as the immediately preceding commit (`64bedba`, "Fix stale score-cards cache after saving/editing a score card") — a narrow per-entity invalidation that misses a separately-keyed list/summary query reading the same underlying fields.
**Action:** When a page splits a single logical entity's editing UI into several sibling components each with their own mutation, grep for every OTHER query key across the frontend that embeds the entity's mutable fields (e.g. `grep -rn "MyLeagueSummary\|listMine" backend frontend/src/api` to find sibling projections of the same table). Every mutation that changes a field appearing in that projection needs to invalidate the projection's query key too, not just the detail-view key. `['leagues']` prefix invalidation does NOT cover `['my-leagues']` — react-query's invalidation is prefix-matched, so differently-named top-level keys are invisible to each other even when they source the same table/fields. Search `grep -rn "queryKey: \['<x>" frontend/src/pages` for every reader before deciding a mutation's invalidation set is complete.

## 2026-08-07 - A FIFO Save-Queue Serializes Network Calls but Not the Create-vs-Patch Decision
**Finding:** `usePelletDraftAutosave.ts` (backing `PelletTestWizard.tsx`) queues saves via `queueRef.current.then(() => work())` "so rapid step transitions don't fire overlapping PATCHes" — but the queued `work()` closures decided create-vs-patch by reading `state.draftId`, the `useState` value closed over at the *render* the caller's function reference was obtained from, not a live value. Two calls issued from the same render (e.g. a double-tap on the wizard's "Continue" button on the Equipment step — its `nextDisabled` never included `autosave.isSaving`, so the button stayed clickable mid-save) both saw `state.draftId === null` even though the queue correctly ran them one after another, because neither call re-evaluated `state` after the first one's `setState` landed — that `setState` only affects a *future* render's closure, not the frozen one both calls already held. Both branches took the `quickCreate` path, producing two pellet-test draft sessions instead of one create + one patch, with the earlier one silently orphaned (`onCreated` fires twice, the second `draftId` wins).
**Learning:** A promise-chain queue only serializes *when* queued work runs, not *what* it decides to do — each queued closure still reads whatever component state it captured at the moment it was created, and in React that's frozen per-render. If a queued decision needs to see the outcome of an earlier queued item in the same queue, it must read a `ref` mutated synchronously at the point of that outcome (here, `draftIdRef.current = session.id` set immediately after `quickCreate` resolves, read by the next item via `draftIdRef.current` instead of `state.draftId`), not the `useState` value.
**Prevention:** Any hook that queues async work keyed on "does entity X already exist" (autosave/draft-creation patterns are the recurring shape here — `usePelletDraftAutosave` was the second one written, `useMeasurementSync` is worth checking too) must gate the create/update branch on a `ref`, never on `useState`, if two calls can be queued back-to-back from the same render. Cross-check: does the button that triggers the queued action get disabled by the hook's own `isSaving` flag? `PelletTestWizard.tsx`'s `nextDisabled` omitted `autosave.isSaving`, which is what let a double-tap actually reach the hook twice.
