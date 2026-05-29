# Testsmith Journal — sub12

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

## 2026-05-29 - Comment body validation and moderation gating untested

**Learning:** `CommentService.validateBody` limits comment bodies to 2000 *runes*
(Unicode code points), not bytes — but this was never asserted. A byte-counting
implementation would silently accept multi-byte payloads that exceed the displayed
character limit. Similarly, `CanModerateComment` and `FlagComment` have DB-free
short-circuit paths (admin role, anonymous caller, empty reason) that had no coverage,
meaning a refactor collapsing those guards would go undetected until runtime.

**Risk:** A byte-length regression in `validateBody` would store oversized comments,
potentially breaking UI rendering, feed pagination, or downstream storage quotas for
users writing in emoji-heavy or CJK text. A regression in the moderation guards could
allow anonymous users to attempt to flag comments or inadvertently grant non-admins
global moderation authority.

**Action:** Added `backend/internal/service/comment_test.go` with ten tests that require
no mocks (zero-value `CommentService` suffices): six covering `validateBody` exact-limit,
over-limit, whitespace trimming, and rune-vs-byte semantics; two covering the DB-free
short-circuits in `CanModerateComment`; two covering pre-DB reason validation in
`FlagComment`.
