# Selector gaps

The app currently has no `data-testid` attributes anywhere ([backend/frontend
inspection 2026-04-28]). Every selector below is currently keyed off role +
visible text or a placeholder, which makes the suite brittle to copy
changes. Adding the suggested `data-testid`s makes the e2e selectors stable.

## High-priority (used by the lifecycle spec)

| Where | Element | Suggested attribute |
|---|---|---|
| `frontend/src/pages/Leagues.tsx` (header) | "+ New" button that opens the create modal | `data-testid="leagues-create-button"` |
| `frontend/src/pages/Leagues.tsx` (modal) | Submit button "Create League" | `data-testid="league-create-submit"` |
| `frontend/src/components/leagues/EntityCard.tsx` | League card link | `data-testid="league-card-${id}"` |
| `frontend/src/pages/LeagueDetail.tsx` (~line 432) | Invite-code copy button | `data-testid="league-invite-code"` and expose the code value as `data-code="..."` so we don't have to parse the visible text |
| `frontend/src/pages/LeagueDetail.tsx` (~line 408) | Invite-code input | `data-testid="league-join-code-input"` |
| `frontend/src/pages/LeagueDetail.tsx` (~line 414) | Join button | `data-testid="league-join-button"` |
| `frontend/src/pages/LeagueDetail.tsx` (~line 384) | "Submit Score" link | `data-testid="league-submit-score"` |
| Standings table rows | Each row | `data-testid="standings-row-${userId}"` and within: `data-testid="standings-rank"` / `standings-name` / `standings-best` |
| `frontend/src/pages/ScoreEntry.tsx` | Rifle and Pellet selects | `data-testid="score-entry-rifle"` / `score-entry-pellet"` |
| `frontend/src/pages/ScoreEntry.tsx` | Submit button | `data-testid="score-entry-submit"` |
| `frontend/src/store/toast.ts` rendering | Success/error toasts | `data-testid="toast-success"` / `toast-error"` so duplicate-submit assertion is unambiguous |

## Missing UI (not just missing test-ids)

- **End / finalise league.** `frontend/src/pages/LeagueDetail.tsx` and
  `LeagueSettings.tsx` have no "End Season" or "Finalise" affordance. The
  lifecycle spec stops at "standings reflect submitted scores" because of this.
  The non-owner-cannot-end edge case is `test.fixme()` until the UI lands.
  → Decide: add `End Season` button to `LeagueSettings` (owner-only), wired to
  a new `POST /leagues/{id}/end` or season-close endpoint.
- **No public delete-league UI for owners.** Today the only delete path is the
  admin `DELETE /api/v1/admin/leagues/{id}` route. The spec uses that for
  cleanup, but there is no user-facing "Delete league" button. Decide whether
  owners should be able to delete their own leagues from
  `LeagueSettings.tsx`.

## Lower priority

- The "+ New" button on the leagues header relies on text "New" which also
  matches "New round" / "New season" buttons elsewhere — currently
  disambiguated by `.first()` and being on `/leagues`. A test-id eliminates
  the ordering dependency.
- `placeholder="Enter invite code"` is used to find the join input; English-
  string-locked.
