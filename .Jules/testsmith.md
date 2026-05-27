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
