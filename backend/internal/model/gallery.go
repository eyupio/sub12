package model

import "time"

// Gallery item kinds. Each names the entity the uploaded image belongs to.
const (
	GalleryKindScoreCard  = "score_card"
	GalleryKindRifle      = "rifle"
	GalleryKindPellet     = "pellet"
	GalleryKindPelletTest = "pellet_test"
)

// GalleryItem is one uploaded image together with the context it belongs to:
// the owning entity, and — for score cards — where the card has been submitted
// (league round, club, event). The gallery page renders these directly, so the
// names are resolved here rather than leaving the client to chase IDs.
type GalleryItem struct {
	Kind          string `json:"kind"`
	ID            string `json:"id"` // owning entity id: score card, rifle, pellet, or pellet-test image
	ImageURL      string `json:"image_url"`
	ImageRotation int    `json:"image_rotation,omitempty"`
	Title         string `json:"title"`
	Caption       *string `json:"caption,omitempty"`

	// Score-card fields.
	ShotAt       *string `json:"shot_at,omitempty"`
	TotalScore   *int16  `json:"total_score,omitempty"`
	XCount       *int16  `json:"x_count,omitempty"`
	IsDraft      *bool   `json:"is_draft,omitempty"`
	Verification *string `json:"verification,omitempty"`
	RifleName    *string `json:"rifle_name,omitempty"`
	PelletName   *string `json:"pellet_name,omitempty"`

	// Submission context (score cards only).
	LeagueRoundID      *string `json:"league_round_id,omitempty"`
	LeagueID           *string `json:"league_id,omitempty"`
	LeagueName         *string `json:"league_name,omitempty"`
	RoundName          *string `json:"round_name,omitempty"`
	ClubID             *string `json:"club_id,omitempty"`
	ClubName           *string `json:"club_name,omitempty"`
	EventParticipantID *string `json:"event_participant_id,omitempty"`
	EventSlug          *string `json:"event_slug,omitempty"`
	EventName          *string `json:"event_name,omitempty"`

	// Pellet-test fields.
	SessionID   *string  `json:"session_id,omitempty"`
	GroupSizeMM *float64 `json:"group_size_mm,omitempty"`

	CreatedAt time.Time `json:"created_at"`
}
