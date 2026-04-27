package model

import (
	"encoding/json"
	"time"
)

// Event states. Promotion is monotonic except that 'archived' is only reached
// from 'complete' (via the archive sweep) and never reverses.
const (
	EventStateDraft           = "draft"
	EventStateOpenForEntries  = "open_for_entries"
	EventStateLive            = "live"
	EventStateComplete        = "complete"
	EventStateArchived        = "archived"
)

// Event visibility values. 'unlisted' is a link-only mode: anyone with the
// slug can view, but it doesn't appear in public listings.
const (
	EventVisibilityPublic    = "public"
	EventVisibilityClubOnly  = "club_only"
	EventVisibilityUnlisted  = "unlisted"
)

// EventCourse describes the physical layout of a course (lanes, shots per
// target, special-position assignments). Persisted as JSONB so the schema
// can extend without migrations as new disciplines are introduced.
type EventCourse struct {
	Lanes                    int   `json:"lanes"`
	ShotsPerTarget           int   `json:"shots_per_target"`
	StandingTargets          []int `json:"standing_targets,omitempty"`
	KneelingTargets          []int `json:"kneeling_targets,omitempty"`
	StandingSupportedTargets []int `json:"standing_supported_targets,omitempty"`
	KneelingSupportedTargets []int `json:"kneeling_supported_targets,omitempty"`
}

// EventScoringRules holds points-per-result for the event's discipline.
// Stored as JSONB; the create form ships HFT/FT presets that populate this.
type EventScoringRules struct {
	// Mode names the scoring scheme: 'xo' (X=hit, O=miss; 1pt/X) or
	// '210' (2/1/0 face/kill/miss). Free-text so future disciplines can
	// add their own.
	Mode string `json:"mode"`
	// Points maps result tokens to points, e.g. {"X":1,"O":0} or
	// {"2":2,"1":1,"0":0}.
	Points map[string]int `json:"points,omitempty"`
}

// Event mirrors the events table.
type Event struct {
	ID            string             `json:"id"`
	Slug          string             `json:"slug"`
	Name          string             `json:"name"`
	Description   *string            `json:"description,omitempty"`
	Location      *string            `json:"location,omitempty"`
	StartsAt      *time.Time         `json:"starts_at,omitempty"`
	EndsAt        *time.Time         `json:"ends_at,omitempty"`
	ArchiveAt     *time.Time         `json:"archive_at,omitempty"`
	Discipline    string             `json:"discipline"`
	Course        EventCourse        `json:"course"`
	ScoringRules  EventScoringRules  `json:"scoring_rules"`
	CategoryIDs   []string           `json:"category_ids"`
	Visibility    string             `json:"visibility"`
	State         string             `json:"state"`
	OwnerUserID   string             `json:"owner_user_id"`
	ClubID        *string            `json:"club_id,omitempty"`
	CreatedAt     time.Time          `json:"created_at"`
	UpdatedAt     time.Time          `json:"updated_at"`
	// Computed at read time (not persisted).
	ParticipantCount int  `json:"participant_count"`
	IsOwner          bool `json:"is_owner,omitempty"`
	IsScorer         bool `json:"is_scorer,omitempty"`
}

// CreateEventInput is the payload for POST /api/v1/events.
type CreateEventInput struct {
	Name         string             `json:"name"`
	Description  *string            `json:"description"`
	Location     *string            `json:"location"`
	StartsAt     *time.Time         `json:"starts_at"`
	EndsAt       *time.Time         `json:"ends_at"`
	Discipline   string             `json:"discipline"`
	Course       EventCourse        `json:"course"`
	ScoringRules EventScoringRules  `json:"scoring_rules"`
	CategoryIDs  []string           `json:"category_ids"`
	Visibility   *string            `json:"visibility"`
	ClubID       *string            `json:"club_id"`
}

// UpdateEventInput is the partial-update payload for PATCH /api/v1/events/{slug}.
type UpdateEventInput struct {
	Name         *string            `json:"name"`
	Description  *string            `json:"description"`
	Location     *string            `json:"location"`
	StartsAt     *time.Time         `json:"starts_at"`
	EndsAt       *time.Time         `json:"ends_at"`
	Discipline   *string            `json:"discipline"`
	Course       *EventCourse       `json:"course"`
	ScoringRules *EventScoringRules `json:"scoring_rules"`
	CategoryIDs  *[]string          `json:"category_ids"`
	Visibility   *string            `json:"visibility"`
}

// EventParticipant. Exactly one of UserID and GuestName is set. DisplayName is
// COALESCE'd at read time so callers don't need to branch.
type EventParticipant struct {
	ID             string    `json:"id"`
	EventID        string    `json:"event_id"`
	UserID         *string   `json:"user_id,omitempty"`
	GuestName      *string   `json:"guest_name,omitempty"`
	DisplayName    string    `json:"display_name"`
	Team           *string   `json:"team,omitempty"`
	CategoryID     *string   `json:"category_id,omitempty"`
	WeaponClass    *string   `json:"weapon_class,omitempty"`
	WeaponLabel    *string   `json:"weapon_label,omitempty"`
	LaneAssignment *int      `json:"lane_assignment,omitempty"`
	ScorecardID    string    `json:"scorecard_id"`
	CreatedBy      string    `json:"created_by"`
	CreatedAt      time.Time `json:"created_at"`
}

// JoinEventInput is the payload for POST /api/v1/events/{slug}/participants.
type JoinEventInput struct {
	Team           *string `json:"team"`
	CategoryID     *string `json:"category_id"`
	WeaponClass    *string `json:"weapon_class"`
	WeaponLabel    *string `json:"weapon_label"`
	LaneAssignment *int    `json:"lane_assignment"`
}

// AddGuestInput is the payload for POST /api/v1/events/{slug}/guests.
type AddGuestInput struct {
	GuestName      string  `json:"guest_name"`
	Team           *string `json:"team"`
	CategoryID     *string `json:"category_id"`
	WeaponClass    *string `json:"weapon_class"`
	WeaponLabel    *string `json:"weapon_label"`
	LaneAssignment *int    `json:"lane_assignment"`
}

// EventScore is one shot result.
type EventScore struct {
	ID            string    `json:"id"`
	ParticipantID string    `json:"participant_id"`
	Lane          int       `json:"lane"`
	ShotNumber    int       `json:"shot_number"`
	Result        string    `json:"result"`
	Note          *string   `json:"note,omitempty"`
	RecordedAt    time.Time `json:"recorded_at"`
	RecordedBy    string    `json:"recorded_by"`
	ClientID      string    `json:"client_id"`
}

// RecordScoreItem is a single entry in a batch score upsert. The ClientID is
// generated on the device and acts as an idempotency key, so re-syncs from an
// offline outbox are safe.
type RecordScoreItem struct {
	ParticipantID string     `json:"participant_id"`
	Lane          int        `json:"lane"`
	ShotNumber    int        `json:"shot_number"`
	Result        string     `json:"result"`
	Note          *string    `json:"note,omitempty"`
	ClientID      string     `json:"client_id"`
	RecordedAt    *time.Time `json:"recorded_at,omitempty"`
}

// RecordScoresInput wraps a batch flushed from the offline outbox.
type RecordScoresInput struct {
	Scores []RecordScoreItem `json:"scores"`
}

// AddScorerInput is the payload for POST /api/v1/events/{slug}/scorers.
type AddScorerInput struct {
	UserID string `json:"user_id"`
}

// EventStandingRow is a single row in the live scoreboard. Aggregated server
// side from event_scores joined with participants and the event scoring rules.
type EventStandingRow struct {
	ParticipantID string  `json:"participant_id"`
	UserID        *string `json:"user_id,omitempty"`
	DisplayName   string  `json:"display_name"`
	Team          *string `json:"team,omitempty"`
	CategoryID    *string `json:"category_id,omitempty"`
	WeaponClass   *string `json:"weapon_class,omitempty"`
	Points        int     `json:"points"`
	HitCount      int     `json:"hit_count"`
	ShotsRecorded int     `json:"shots_recorded"`
	Position      int     `json:"position"`
}

// Activity metadata payloads for the four new event activity types.

type EventCreatedMeta struct {
	EventName  string `json:"event_name"`
	EventSlug  string `json:"event_slug"`
	ClubName   string `json:"club_name,omitempty"`
	Discipline string `json:"discipline,omitempty"`
}

type EventJoinedMeta struct {
	EventName string `json:"event_name"`
	EventSlug string `json:"event_slug"`
	ClubName  string `json:"club_name,omitempty"`
}

type EventWentLiveMeta struct {
	EventName string `json:"event_name"`
	EventSlug string `json:"event_slug"`
	ClubName  string `json:"club_name,omitempty"`
}

// EventCompletedMeta is fanned out per participant on completion. Position 0
// indicates "no result" (e.g. zero shots recorded).
type EventCompletedMeta struct {
	EventName     string `json:"event_name"`
	EventSlug     string `json:"event_slug"`
	ClubName      string `json:"club_name,omitempty"`
	Position      int    `json:"position"`
	Points        int    `json:"points"`
	HitCount      int    `json:"hit_count"`
	ShotsRecorded int    `json:"shots_recorded"`
	CategoryLabel string `json:"category_label,omitempty"`
}

// MarshalCourse / MarshalScoringRules are convenience helpers used by the
// repository when round-tripping JSONB columns.
func MarshalCourse(c EventCourse) ([]byte, error)         { return json.Marshal(c) }
func MarshalScoringRules(r EventScoringRules) ([]byte, error) { return json.Marshal(r) }
