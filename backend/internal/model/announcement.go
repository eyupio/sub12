package model

import (
	"strings"
	"time"
)

// Announcement scopes. Each one names both who may send and who receives:
// the platform (admins → every real account), a league or club (its owner and
// the moderators granted PermSendAnnouncements → its members), or an event
// (its owner → everyone entered).
const (
	AnnouncementScopePlatform = "platform"
	AnnouncementScopeLeague   = "league"
	AnnouncementScopeClub     = "club"
	AnnouncementScopeEvent    = "event"
)

const (
	// AnnouncementTitleMaxLen keeps the title inside a notification row and a
	// push title without truncation mangling it.
	AnnouncementTitleMaxLen = 120
	AnnouncementBodyMaxLen  = 4000
	// AnnouncementPreviewLen is how much of the body travels in the
	// notification metadata, so the bell reads as a message rather than a
	// pointer. The full text is fetched from the announcement itself.
	AnnouncementPreviewLen = 200
)

// Announcement is one broadcast message and the record of its reach.
type Announcement struct {
	ID    string `json:"id"`
	Scope string `json:"scope"`

	LeagueID *string `json:"league_id,omitempty"`
	ClubID   *string `json:"club_id,omitempty"`
	EventID  *string `json:"event_id,omitempty"`
	// ScopeName is the league, club or event's name, resolved on read so a
	// listing never renders a raw ID. Empty for platform announcements.
	ScopeName string `json:"scope_name,omitempty"`
	// EventSlug is how an event announcement links back to its event.
	EventSlug string `json:"event_slug,omitempty"`

	CreatedBy       string  `json:"created_by"`
	AuthorName      string  `json:"author_display_name,omitempty"`
	AuthorAvatarURL *string `json:"author_avatar_url,omitempty"`

	Title          string    `json:"title"`
	Body           string    `json:"body"`
	RecipientCount int       `json:"recipient_count"`
	EmailSent      bool      `json:"email_sent"`
	CreatedAt      time.Time `json:"created_at"`
}

// CreateAnnouncementInput is the compose payload. SendEmail is the sender's
// own decision, defaulting off: an announcement always lands in-app, and
// reaching people who aren't in the app is a deliberate extra step. The
// recipient's announcement_email preference still applies on top.
type CreateAnnouncementInput struct {
	Title     string `json:"title"`
	Body      string `json:"body"`
	SendEmail bool   `json:"send_email"`
}

// Normalise trims the input in place and reports the first validation
// failure, or an empty string when the input is usable.
func (in *CreateAnnouncementInput) Normalise() string {
	in.Title = strings.TrimSpace(in.Title)
	in.Body = strings.TrimSpace(in.Body)
	switch {
	case in.Title == "":
		return "title is required"
	case len([]rune(in.Title)) > AnnouncementTitleMaxLen:
		return "title is too long"
	case in.Body == "":
		return "body is required"
	case len([]rune(in.Body)) > AnnouncementBodyMaxLen:
		return "body is too long"
	}
	return ""
}

// BodyPreview is the leading slice of the body carried in notification
// metadata, cut on a rune boundary and ellipsised when it had to be shortened.
func (a *Announcement) BodyPreview() string {
	runes := []rune(a.Body)
	if len(runes) <= AnnouncementPreviewLen {
		return a.Body
	}
	return strings.TrimRight(string(runes[:AnnouncementPreviewLen]), " ") + "…"
}
