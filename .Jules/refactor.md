## 2026-05-27 - Magic Numbers in Domain-Specific Achievement Thresholds
Learning: Numeric thresholds that are meaningful only within a specific domain (here: shooting-sport scoring rules) appeared as bare literals (100, 200, 250 for scores; 5, 10, 15 for X-counts) with no explanation. A reader unfamiliar with the sport had no way to understand why these values were chosen or how they relate to one another.
Risk: Future maintainers may change a threshold without realising its domain significance (e.g. "perfect" means the mathematical maximum, not an arbitrary round number), leading to misaligned achievements or inconsistent tier spacing.
Action: Extract sport-specific thresholds into named package-level constants accompanied by a docblock that explains the underlying scoring rules. Group related constants together so the relationships between tiers are visible at a glance.

## 2026-06-19 - Duplicated Response-Parsing Logic in Security-Sensitive HTTP Client
Learning: The error-body parsing block (read text, try JSON.parse, fall back to raw text) appeared identically in both `request()` and `requestMultipart()` in `client.ts`. These two functions also share the 401-retry flow, the proactive-refresh-on-reload flow, and the 204-handling branch — all duplicated inline.
Risk: The HTTP client is the single path through which all auth tokens flow and all session-expiry redirects happen. Any divergence between the two functions (e.g. a future change to the backend error envelope applied to one but not the other) can produce inconsistent UX or missed error messages for multipart requests specifically, which are harder to test manually.
Action: Extract shared response-handling logic into named helpers. The first step was `parseErrorMessage`; the 401-retry and proactive-refresh blocks are the next candidates if the duplication proves to be a maintenance burden in practice.

## 2026-06-26 - Duplicated Permission Checks Across Switch Cases Create Silent Drift Risk
Learning: The `Like` service's switch statement contained three identical 9-line blocks that each checked whether a content owner had blocked the viewer. Same pattern seen in the comment service's switch. Each copy returns a different error sentinel (ErrLikeTargetNotFound vs ErrCommentDenied), which prevents a cross-service helper but still leaves per-service duplication inside a single function.
Risk: Permission logic that must remain consistent across all content types (score cards, posts, activities) can diverge silently if a case branch is updated but others are not. A change to block-check semantics (e.g. mutual blocking, soft-block variants) applied to one branch but missed in another creates an inconsistent authorization surface per content type.
Action: Extract a private service method (`ownerHasBlocked`) that centralises the repository call and the self-block short-circuit. This gives permission logic a single update point within the service and makes each switch case's intent readable at a glance.

## 2026-05-29 - Duplicated Auth Boilerplate Creates Security Drift Risk
Learning: ValidateAccessToken and ValidateChallengeToken each contained an identical inline jwt.Keyfunc literal that rejects non-HMAC tokens and returns the HMAC secret. Two independent copies of security-critical code that must always behave identically.
Risk: Any future change to the accepted signing algorithm (e.g. adding RS256 or rotating the key derivation) applied to one copy but missed on the other would create an asymmetric authentication surface — one token type would accept a weaker algorithm the other rejects.
Action: Extract shared auth boilerplate into a named service method so all token validation paths draw from a single implementation.
