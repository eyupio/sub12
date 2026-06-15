## 2026-05-27 - Magic Numbers in Domain-Specific Achievement Thresholds
Learning: Numeric thresholds that are meaningful only within a specific domain (here: shooting-sport scoring rules) appeared as bare literals (100, 200, 250 for scores; 5, 10, 15 for X-counts) with no explanation. A reader unfamiliar with the sport had no way to understand why these values were chosen or how they relate to one another.
Risk: Future maintainers may change a threshold without realising its domain significance (e.g. "perfect" means the mathematical maximum, not an arbitrary round number), leading to misaligned achievements or inconsistent tier spacing.
Action: Extract sport-specific thresholds into named package-level constants accompanied by a docblock that explains the underlying scoring rules. Group related constants together so the relationships between tiers are visible at a glance.

## 2026-05-29 - Duplicated Auth Boilerplate Creates Security Drift Risk
Learning: ValidateAccessToken and ValidateChallengeToken each contained an identical inline jwt.Keyfunc literal that rejects non-HMAC tokens and returns the HMAC secret. Two independent copies of security-critical code that must always behave identically.
Risk: Any future change to the accepted signing algorithm (e.g. adding RS256 or rotating the key derivation) applied to one copy but missed on the other would create an asymmetric authentication surface — one token type would accept a weaker algorithm the other rejects.
Action: Extract shared auth boilerplate into a named service method so all token validation paths draw from a single implementation.
