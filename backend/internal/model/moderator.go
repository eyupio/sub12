package model

// Moderators are members a league or club owner has promoted to help run it.
// They are deliberately not called admins: "admin" is the platform-wide role
// (users.role = 'admin'), and a moderator's reach stops at the one league or
// club they were promoted in.
//
// What a moderator may actually do is delegated by the owner, one capability
// at a time. The owner — leagues.created_by / clubs.created_by — always holds
// every capability and is never gated by the grant list.
const (
	// PermManageMembers covers join requests and removing members.
	PermManageMembers = "manage_members"
	// PermManageModerators covers promoting, demoting, and re-granting other
	// moderators' capabilities. It cannot grant a capability the granter does
	// not hold, so it never becomes a back door to owner-level control.
	PermManageModerators = "manage_moderators"
	// PermManageSettings covers the group's own record: name, description,
	// privacy, image, join code and (leagues) the scoring config.
	PermManageSettings = "manage_settings"
	// PermManageSeasons covers creating league seasons and rounds.
	PermManageSeasons = "manage_seasons"
	// PermVerifyScores covers verifying, amending, rejecting and reopening
	// submitted league cards.
	PermVerifyScores = "verify_scores"
	// PermModerateContent covers the reports queue and hiding, flagging or
	// deleting posts and comments inside the group.
	PermModerateContent = "moderate_content"
	// PermManageSupport covers the group's support tickets and its slice of
	// the feature board.
	PermManageSupport = "manage_support"
	// PermManageLeagues covers creating and running leagues under a club.
	PermManageLeagues = "manage_leagues"
	// PermManageEvents covers hosting club events.
	PermManageEvents = "manage_events"
	// PermSendAnnouncements covers broadcasting a written message to every
	// member. It reaches more people than any other capability and cannot be
	// taken back once sent, so it is never granted by default.
	PermSendAnnouncements = "send_announcements"
)

// ModeratorPermission describes one delegated capability for the settings UI.
type ModeratorPermission struct {
	Key         string `json:"key"`
	Label       string `json:"label"`
	Description string `json:"description"`
	// Default marks the capabilities granted automatically on promotion.
	Default bool `json:"default"`
}

// LeagueModeratorPermissions is the catalogue a league owner can delegate.
var LeagueModeratorPermissions = []ModeratorPermission{
	{PermManageMembers, "Manage members", "Approve or reject join requests and remove members.", true},
	{PermVerifyScores, "Verify scores", "Verify, amend, reject and reopen submitted cards.", true},
	{PermModerateContent, "Moderate content", "Handle reports and hide, flag or delete posts and comments.", true},
	{PermManageSeasons, "Manage seasons", "Create seasons and rounds.", false},
	{PermSendAnnouncements, "Send announcements", "Broadcast a message to every league member.", false},
	{PermManageSettings, "Manage settings", "Edit league details, scoring config, image and join code.", false},
	{PermManageSupport, "Handle support", "Work the league's support tickets and feature board.", false},
	{PermManageModerators, "Manage moderators", "Promote and demote moderators and change what they can do.", false},
}

// ClubModeratorPermissions is the catalogue a club owner can delegate.
var ClubModeratorPermissions = []ModeratorPermission{
	{PermManageMembers, "Manage members", "Approve or reject join requests and remove members.", true},
	{PermModerateContent, "Moderate content", "Handle reports and hide, flag or delete posts and comments.", true},
	{PermManageEvents, "Manage events", "Host and run club events.", false},
	{PermManageLeagues, "Manage leagues", "Create and run leagues under the club.", false},
	{PermSendAnnouncements, "Send announcements", "Broadcast a message to every club member.", false},
	{PermManageSettings, "Manage settings", "Edit the club profile, opening hours, image and join code.", false},
	{PermManageSupport, "Handle support", "Work the club's support tickets and feature board.", false},
	{PermManageModerators, "Manage moderators", "Promote and demote moderators and change what they can do.", false},
}

// NormaliseModeratorPermissions filters a requested grant down to the keys the
// catalogue recognises, de-duplicating and preserving catalogue order so two
// equivalent grants always store the same array.
func NormaliseModeratorPermissions(catalogue []ModeratorPermission, requested []string) []string {
	wanted := make(map[string]struct{}, len(requested))
	for _, p := range requested {
		wanted[p] = struct{}{}
	}
	out := make([]string, 0, len(catalogue))
	for _, p := range catalogue {
		if _, ok := wanted[p.Key]; ok {
			out = append(out, p.Key)
		}
	}
	return out
}

// DefaultModeratorPermissions is the grant a newly promoted moderator starts
// with — the day-to-day duties, none of the capabilities that could reshape or
// unmake the group.
func DefaultModeratorPermissions(catalogue []ModeratorPermission) []string {
	out := make([]string, 0, len(catalogue))
	for _, p := range catalogue {
		if p.Default {
			out = append(out, p.Key)
		}
	}
	return out
}

// AllModeratorPermissions is every key in a catalogue, used to describe what
// the owner holds.
func AllModeratorPermissions(catalogue []ModeratorPermission) []string {
	out := make([]string, 0, len(catalogue))
	for _, p := range catalogue {
		out = append(out, p.Key)
	}
	return out
}

// MemberRole is a caller's standing in one league or club: whether they are a
// member at all, whether they were promoted, and what the owner let them do.
// Permissions is the *effective* set — for an owner it is the whole catalogue.
type MemberRole struct {
	IsMember    bool     `json:"is_member"`
	IsModerator bool     `json:"is_moderator"`
	IsOwner     bool     `json:"is_owner"`
	Permissions []string `json:"permissions"`
}

// Can reports whether the role carries a capability. Owners always can.
func (r *MemberRole) Can(permission string) bool {
	if r == nil {
		return false
	}
	if r.IsOwner {
		return true
	}
	if !r.IsModerator {
		return false
	}
	for _, p := range r.Permissions {
		if p == permission {
			return true
		}
	}
	return false
}
