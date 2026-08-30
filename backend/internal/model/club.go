package model

import "time"

// ClubDisciplines is the canonical set of shooting disciplines a club can
// advertise. Kept server-side so the directory filter and the club editor
// agree on spelling — anything outside this set is rejected.
var ClubDisciplines = []string{
	"air rifle",
	"air pistol",
	"benchrest",
	"field target",
	"hunter field target",
	"rimfire",
	"smallbore",
	"fullbore",
	"target sprint",
	"silhouette",
	"plinking",
}

// ClubProfileListLimit caps how many entries a club may list for each of
// disciplines, distances and facilities.
const ClubProfileListLimit = 20

// JoinPolicies is the canonical set of ways a club or league can be joined.
// Clubs and leagues share the identical three-value enum, so this is the one
// place both check against instead of repeating the literal list.
var JoinPolicies = []string{"open", "invite_code", "approval"}

// IsValidJoinPolicy reports whether v is one of JoinPolicies.
func IsValidJoinPolicy(v string) bool {
	for _, p := range JoinPolicies {
		if v == p {
			return true
		}
	}
	return false
}

// ClubSummary is the minimal public-facing view of a club used to render a
// "members-only" banner without leaking members, standings or posts. It
// carries enough of the profile (where the club is, what it shoots) for a
// prospective member to decide whether to request access.
type ClubSummary struct {
	ID             string   `json:"id"`
	Name           string   `json:"name"`
	Description    *string  `json:"description,omitempty"`
	ImageURL       *string  `json:"image_url,omitempty"`
	Type           string   `json:"type"`
	JoinPolicy     string   `json:"join_policy"`
	PostVisibility string   `json:"post_visibility"`
	MemberCount    int      `json:"member_count"`
	City           *string  `json:"city,omitempty"`
	Region         *string  `json:"region,omitempty"`
	Country        *string  `json:"country,omitempty"`
	Disciplines    []string `json:"disciplines"`
}

type Club struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	// Slug is the human-readable identifier used in public share URLs.
	Slug           string  `json:"slug"`
	Description    *string `json:"description,omitempty"`
	ImageURL       *string `json:"image_url,omitempty"`
	JoinCode       string  `json:"join_code"`
	Type           string  `json:"type"`
	JoinPolicy     string  `json:"join_policy"`
	PostVisibility string  `json:"post_visibility"`
	DateFormat     string  `json:"date_format"`
	TimeFormat     string  `json:"time_format"`
	Timezone       string  `json:"timezone"`
	CreatedBy      string  `json:"created_by"`
	CreatedAt      string  `json:"created_at"`
	UpdatedAt      string  `json:"updated_at"`
	MemberCount    int     `json:"member_count"`
	LeagueCount    int     `json:"league_count"`
	// IsAdmin is the pre-moderator spelling of IsModerator, still emitted so
	// an app running an older bundle keeps unlocking its admin controls.
	IsAdmin  bool `json:"is_admin,omitempty"`
	IsMember bool `json:"is_member,omitempty"`
	// Viewer standing. IsModerator covers owners too; Permissions is the
	// viewer's effective grant (the whole catalogue for an owner).
	IsModerator bool     `json:"is_moderator,omitempty"`
	IsOwner     bool     `json:"is_owner,omitempty"`
	Permissions []string `json:"permissions,omitempty"`

	// Real-world profile. All optional — an online-only club leaves them unset.
	WebsiteURL      *string  `json:"website_url,omitempty"`
	ContactEmail    *string  `json:"contact_email,omitempty"`
	ContactPhone    *string  `json:"contact_phone,omitempty"`
	AddressLine1    *string  `json:"address_line1,omitempty"`
	AddressLine2    *string  `json:"address_line2,omitempty"`
	City            *string  `json:"city,omitempty"`
	Region          *string  `json:"region,omitempty"`
	Postcode        *string  `json:"postcode,omitempty"`
	Country         *string  `json:"country,omitempty"`
	Latitude        *float64 `json:"latitude,omitempty"`
	Longitude       *float64 `json:"longitude,omitempty"`
	Disciplines     []string `json:"disciplines"`
	Distances       []string `json:"distances"`
	Facilities      []string `json:"facilities"`
	MembershipInfo  *string  `json:"membership_info,omitempty"`
	VisitorPolicy   *string  `json:"visitor_policy,omitempty"`
	EstablishedYear *int     `json:"established_year,omitempty"`

	// DistanceKM is populated only when the directory was queried with a
	// viewer location.
	DistanceKM *float64 `json:"distance_km,omitempty"`
}

// ClubOpeningHours is one published session slot for a club. DayOfWeek is
// 0 = Monday through 6 = Sunday. A day with no rows is simply not published;
// a row with IsClosed records an explicit "closed" (so a club can say
// "Mondays: closed" rather than leaving it blank).
type ClubOpeningHours struct {
	ID        string  `json:"id"`
	ClubID    string  `json:"club_id"`
	DayOfWeek int     `json:"day_of_week"`
	OpensAt   *string `json:"opens_at,omitempty"`
	ClosesAt  *string `json:"closes_at,omitempty"`
	IsClosed  bool    `json:"is_closed"`
	Note      *string `json:"note,omitempty"`
}

// ClubOpeningHoursInput is one slot in a full-week replacement payload.
type ClubOpeningHoursInput struct {
	DayOfWeek int     `json:"day_of_week"`
	OpensAt   *string `json:"opens_at"`
	ClosesAt  *string `json:"closes_at"`
	IsClosed  bool    `json:"is_closed"`
	Note      *string `json:"note"`
}

// ClubDirectoryQuery filters the public club directory.
type ClubDirectoryQuery struct {
	Search     string
	Discipline string
	Latitude   *float64
	Longitude  *float64
	RadiusKM   *float64

	// IncludePrivate lifts the public/membership visibility gate. Only the
	// platform admin listing sets it.
	IncludePrivate bool
}

type ClubMember struct {
	UserID      string  `json:"user_id"`
	DisplayName string  `json:"display_name"`
	AvatarURL   *string `json:"avatar_url,omitempty"`
	// IsAdmin is the pre-moderator spelling of IsModerator, still emitted so
	// an app running an older bundle keeps rendering the badge.
	IsAdmin     bool     `json:"is_admin"`
	IsModerator bool     `json:"is_moderator"`
	IsOwner     bool     `json:"is_owner"`
	Permissions []string `json:"permissions"`
	JoinedAt    string   `json:"joined_at"`
}

type ClubStanding struct {
	Rank        int     `json:"rank"`
	UserID      string  `json:"user_id"`
	DisplayName string  `json:"display_name"`
	AvatarURL   *string `json:"avatar_url,omitempty"`
	BestScore   *int16  `json:"best_score,omitempty"`
	BestX       *int16  `json:"best_x,omitempty"`
	CardCount   int     `json:"card_count"`
}

type CreateClubInput struct {
	Name        string  `json:"name"`
	Description *string `json:"description,omitempty"`
	Type        *string `json:"type,omitempty"`        // "public" or "private" (defaults to "public")
	JoinPolicy  *string `json:"join_policy,omitempty"` // "open", "invite_code", or "approval" (defaults to "open")
}

// UpdateClubMemberInput carries a member role change: promote/demote via
// IsModerator (IsAdmin is the accepted legacy spelling), and the delegated
// capability grant via Permissions.
type UpdateClubMemberInput struct {
	IsAdmin     *bool     `json:"is_admin"`
	IsModerator *bool     `json:"is_moderator"`
	Permissions *[]string `json:"permissions"`
}

// Moderator resolves the promote/demote intent from either spelling.
func (in *UpdateClubMemberInput) Moderator() *bool {
	if in.IsModerator != nil {
		return in.IsModerator
	}
	return in.IsAdmin
}

type ClubJoinRequest struct {
	ID          string     `json:"id"`
	ClubID      string     `json:"club_id"`
	UserID      string     `json:"user_id"`
	DisplayName string     `json:"display_name,omitempty"`
	AvatarURL   *string    `json:"avatar_url,omitempty"`
	Status      string     `json:"status"`
	DecidedBy   *string    `json:"decided_by,omitempty"`
	DecidedAt   *time.Time `json:"decided_at,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
}
