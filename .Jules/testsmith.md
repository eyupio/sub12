# Testsmith Journal — sub12

## 2026-07-03 - Security-fix commits landing without a test for the new gate

**Learning:** The `538c65b` audit-fix commit closed a real bug (`GetPublicByID` let
strangers read/comment on `followers`-visibility score cards by routing comment
create/list through the new `GetForViewer` gate) but shipped with zero new test
covering that gate. `score_card_test.go` only exercised `GetForViewer` indirectly via
`GetForViewerWithAuthor`, and always as the card's owner — the non-owner/visibility/
private-profile branches that are the entire point of the fix were never asserted.
The same commit also added an authorization check to `GetScoreAuditTrail`, which is
unit-untestable as written (`LeagueService.leagues` is a concrete `*repository.LeagueRepository`,
not an interface), so it has no fast test either — only a live-DB integration test could
reach it, and none exists.

**Risk:** This is the second and third instance of the same pattern this project has
hit (see the 2026-06-19 and 2026-05-27 entries): a security fix pins the behavior in
prose (the commit message) but not in code. A later refactor of `GetForViewer` — e.g.
collapsing the draft/visibility/profile checks — would regress silently, and CI would
stay green.

**Action:** Added `TestGetForViewer_NonOwnerAccess` (table-driven, 7 cases covering
owner/stranger/anonymous × private/followers/draft/public × public/private profile) to
`score_card_test.go`. Separately: `LeagueService` and `CommentService` hold concrete
repository types instead of interfaces, unlike `ScoreCardService`. That makes their
authorization logic (`GetScoreAuditTrail` membership check, `CommentService.Create`
block/visibility checks) unreachable by fast unit tests. Worth flagging if either
service is touched again — extracting a narrow interface for the specific methods used,
following the `ScoreCardRepo`/`LeagueConfigRepo` pattern already in `score_card.go`,
would make the next security fix in those services testable without a live DB.

## 2026-05-27 - Reset link security contract untested

**Learning:** `AuthService.buildResetLink` has a security-critical design decision (token
in URL fragment rather than query string) that was entirely untested. No assertion existed
to catch a regression where `?token=` replaced `#token=`.

**Risk:** If the fragment placement is accidentally changed to a query parameter during a
refactor, password-reset tokens would be:
- Sent to the destination server in `Referer` headers
- Written to server access logs
- Retained in browser history

A one-time reset credential exposed this way could be replayed by an attacker. The window
is short (password reset TTL), but the leak path is silent and passive — no user action
required.

**Action:** Added `backend/internal/service/auth_reset_test.go` with three tests that
pin the security contract: token in fragment, not query; sensible default URL; stripping
of any pre-existing fragment to prevent double-# URLs.

## 2026-06-19 - Parallel submission path guards untested

**Learning:** `SubmitToLeague` re-implements five business rules (membership, max submissions, image required, no drafts, no double-submission) independently from `Create`. The existing tests only covered the `Create` path for league membership — `SubmitToLeague` had zero direct test coverage. Any of its five guards could be silently removed in a refactor.

**Risk:** A user could submit a draft card, attach a card to a second league round, or bypass the submission cap via the `SubmitToLeague` endpoint while `Create` tests remained green. The double-submission guard and draft guard in particular have no analogue in `Create`, so they are especially easy to forget.

**Action:** Added six tests in `score_card_test.go` — one per guard plus one happy path. Extended `mockLeagueRepo` with `submissionCount` and `mockScoreCardRepo` with `submitToLeagueCalled` so each test can assert the repo layer was never reached on rejection.

## 2026-06-05 - JWT algorithm substitution guard untested

**Learning:** Both `ValidateAccessToken` and `ValidateChallengeToken` contain an explicit
signing-method guard — they reject any token whose algorithm is not HMAC (`*jwt.SigningMethodHMAC`).
This guard existed in production code but had zero test coverage. No assertion verified
that tokens forged with RS256 (or any non-HMAC algorithm) are actually rejected.

**Risk:** JWT algorithm confusion is a well-known vulnerability class. Without a test pinning
this guard, a refactor that simplifies the key function (e.g., removing the method type-assert
and always returning `jwtSecret`) would silently weaken the boundary. An attacker who can
craft a well-formed RS256 JWT with an attacker-controlled key pair and a valid `sub` claim
would pass the signature check if the guard is absent and the library falls back to using
`jwtSecret` as the HMAC secret against an RSA-signed payload.

**Action:** Added `TestValidateAccessToken_RejectsAlgorithmSubstitution` and
`TestValidateChallengeToken_RejectsAlgorithmSubstitution` in `auth_2fa_test.go`. Each test
generates a fresh RSA-2048 key pair, mints a structurally valid RS256 token (with correct
claims and unexpired expiry), and asserts that the validator returns `ErrInvalidToken`.
