package service

// Free-text length caps, in runes.
//
// Postgres TEXT is unbounded and never pushes back, so every user-supplied
// string that reaches one needs a service-layer ceiling. The handler's 1 MiB
// decodeJSON limit is not that ceiling: it bounds one request, not what the
// row costs on every subsequent read, and several of these rows are re-served
// to a wide audience — a league's description goes out with the unauthenticated
// league directory, an event's with its listing, a rifle's or pellet's with the
// gear showcase. Runes rather than bytes so a non-ASCII entry is not punished
// against an ASCII one. See .jules/sentinel.md for the shape of this class of
// defect and the caps already applied to reports, profiles and support tickets.
const (
	maxEntityNameLen  = 120
	maxDescriptionLen = 2000
	maxFreeNotesLen   = 2000
	maxShortDetailLen = 200
	maxDecisionReason = 500
)

// overLength reports whether field exceeds max runes. A nil field is absent
// rather than empty and always passes, so this composes with the codebase's
// "omit to keep, empty string to clear" convention.
func overLength(field *string, max int) bool {
	return field != nil && len([]rune(*field)) > max
}
