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
