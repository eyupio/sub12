package model

import "time"

const (
	InvitationStatusPending  = "pending"
	InvitationStatusAccepted = "accepted"
	InvitationStatusDeclined = "declined"
	InvitationStatusExpired  = "expired"
)

// EventInvitation mirrors the event_invitations table.
type EventInvitation struct {
	ID            string     `json:"id"`
	EventID       string     `json:"event_id"`
	InviterUserID string     `json:"inviter_user_id"`
	InviteeUserID string     `json:"invitee_user_id"`
	Token         string     `json:"token"`
	Status        string     `json:"status"`
	ExpiresAt     time.Time  `json:"expires_at"`
	CreatedAt     time.Time  `json:"created_at"`
	DecidedAt     *time.Time `json:"decided_at,omitempty"`
}

// EventInvitationListItem extends EventInvitation with the invitee's display
// name + avatar so the owner-facing list can render without a second query.
type EventInvitationListItem struct {
	EventInvitation
	InviteeDisplayName string  `json:"invitee_display_name"`
	InviteeAvatarURL   *string `json:"invitee_avatar_url,omitempty"`
}

// CreateEventInvitationsInput is the batch-create payload.
type CreateEventInvitationsInput struct {
	InviteeUserIDs []string `json:"invitee_user_ids"`
}

// PotentialInviteeSource enumerates the audience tabs in the wizard's invite
// step. 'club' is only valid when the event has a club_id.
const (
	PotentialInviteeSourceClub      = "club"
	PotentialInviteeSourceFollowers = "followers"
	PotentialInviteeSourceFollowing = "following"
	PotentialInviteeSourceSearch    = "search"
)

// PotentialInvitee is one row in the invite-step picker.
type PotentialInvitee struct {
	UserID            string  `json:"user_id"`
	DisplayName       string  `json:"display_name"`
	AvatarURL         *string `json:"avatar_url,omitempty"`
	IsAlreadyInvited  bool    `json:"is_already_invited"`
	IsAlreadyParticipant bool `json:"is_already_participant"`
}

// EventInvitationView is the shape returned by GET /events/invitations/{token}
// to render the accept page. The event summary is a public-safe subset.
type EventInvitationView struct {
	Invitation EventInvitation       `json:"invitation"`
	Event      EventInvitationEvent  `json:"event"`
	Inviter    EventInvitationActor  `json:"inviter"`
	Invitee    EventInvitationActor  `json:"invitee"`
}

type EventInvitationEvent struct {
	ID         string     `json:"id"`
	Slug       string     `json:"slug"`
	Name       string     `json:"name"`
	Discipline string     `json:"discipline"`
	StartsAt   *time.Time `json:"starts_at,omitempty"`
	Location   *string    `json:"location,omitempty"`
	State      string     `json:"state"`
	ClubID     *string    `json:"club_id,omitempty"`
}

type EventInvitationActor struct {
	UserID      string  `json:"user_id"`
	DisplayName string  `json:"display_name"`
	AvatarURL   *string `json:"avatar_url,omitempty"`
}
