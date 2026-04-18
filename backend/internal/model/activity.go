package model

import (
	"encoding/json"
	"time"
)

// ActivityType is the event type stored in the activities table.
type ActivityType = string

const (
	ActivityScorePosted              ActivityType = "score_posted"
	ActivityPersonalBest             ActivityType = "personal_best"
	ActivityJoinedLeague             ActivityType = "joined_league"
	ActivityCommented                ActivityType = "commented"
	ActivityJoinedClub               ActivityType = "joined_club"
	ActivityPelletTestPosted         ActivityType = "pellet_test_posted"
	ActivityLeagueRoundOpened        ActivityType = "league_round_opened"
	ActivityLeagueSeasonStarted      ActivityType = "league_season_started"
	ActivityAchievementEarned        ActivityType = "achievement_earned"
	ActivityFeatureRequestCreated    ActivityType = "feature_request_created"
	ActivityFeatureRequestImplemented ActivityType = "feature_request_implemented"
	ActivityPostCreated              ActivityType = "post_created"
)

// FeedFilter controls which slice of the activity feed to return.
type FeedFilter = string

const (
	FeedPublic FeedFilter = "public"
	FeedForYou FeedFilter = "for_you"
	FeedLeague FeedFilter = "league"
	FeedClub   FeedFilter = "club"
)

// FeedRequest holds validated parameters for a feed query.
type FeedRequest struct {
	ViewerID string
	Filter   FeedFilter
	LeagueID string // required when Filter == FeedLeague
	ClubID   string // required when Filter == FeedClub
	Limit    int
	Cursor   string
}

// Activity is a single event in the social feed.
type Activity struct {
	ID           string          `json:"id"`
	UserID       string          `json:"user_id"`
	DisplayName  string          `json:"display_name"`
	AvatarURL    *string         `json:"avatar_url,omitempty"`
	StarLevel    int             `json:"star_level"`
	Type         ActivityType    `json:"type"`
	TargetID     *string         `json:"target_id,omitempty"`
	TargetType   *string         `json:"target_type,omitempty"`
	Metadata     json.RawMessage `json:"metadata,omitempty"`
	LeagueID     *string         `json:"league_id,omitempty"`
	ClubID       *string         `json:"club_id,omitempty"`
	Visibility   string          `json:"visibility"`
	LikeCount    int             `json:"like_count"`
	IsLiked      bool            `json:"is_liked"`
	CommentCount int             `json:"comment_count"`
	CreatedAt    time.Time       `json:"created_at"`
}

// ScorePostedMeta is the JSONB metadata for ActivityScorePosted / ActivityPersonalBest events.
type ScorePostedMeta struct {
	TotalScore int16  `json:"total_score"`
	XCount     int16  `json:"x_count"`
	IsPB       bool   `json:"is_pb,omitempty"`
	LeagueName string `json:"league_name,omitempty"`
}

// JoinedClubMeta is the JSONB metadata for ActivityJoinedClub events.
type JoinedClubMeta struct {
	ClubName string `json:"club_name"`
}

// PelletTestPostedMeta is the JSONB metadata for ActivityPelletTestPosted events.
type PelletTestPostedMeta struct {
	BestGroupMM *float64 `json:"best_group_mm,omitempty"`
	AvgGroupMM  *float64 `json:"avg_group_mm,omitempty"`
	RifleName   string   `json:"rifle_name,omitempty"`
	PelletName  string   `json:"pellet_name,omitempty"`
}

// LeagueRoundOpenedMeta is the JSONB metadata for ActivityLeagueRoundOpened events.
type LeagueRoundOpenedMeta struct {
	LeagueName string `json:"league_name"`
	RoundName  string `json:"round_name"`
	SeasonName string `json:"season_name,omitempty"`
}

// LeagueSeasonStartedMeta is the JSONB metadata for ActivityLeagueSeasonStarted events.
type LeagueSeasonStartedMeta struct {
	LeagueName string `json:"league_name"`
	SeasonName string `json:"season_name"`
}

// AchievementEarnedMeta is the JSONB metadata for ActivityAchievementEarned events.
type AchievementEarnedMeta struct {
	AchievementID          string `json:"achievement_id"`
	AchievementName        string `json:"achievement_name"`
	AchievementIcon        string `json:"achievement_icon,omitempty"`
	AchievementDescription string `json:"achievement_description,omitempty"`
}

// FeatureRequestMeta is the JSONB metadata for ActivityFeatureRequestCreated and
// ActivityFeatureRequestImplemented events.
type FeatureRequestMeta struct {
	Title     string `json:"title"`
	Status    string `json:"status,omitempty"`
	ScopeType string `json:"scope_type,omitempty"`
}

// PostCreatedMeta is the JSONB metadata for ActivityPostCreated events. For
// share posts (attachments pointing to a score card or pellet test) the
// attachment fields let the feed link directly to the shared target.
type PostCreatedMeta struct {
	BodyPreview      string `json:"body_preview,omitempty"`
	AttachmentType   string `json:"attachment_type,omitempty"` // "score_card", "pellet_test", "image"
	AttachmentTargetID string `json:"attachment_target_id,omitempty"`
	LeagueName       string `json:"league_name,omitempty"`
	ClubName         string `json:"club_name,omitempty"`
}

// FeedResponse is the paginated response for GET /api/v1/feed.
type FeedResponse struct {
	Items  []*Activity `json:"items"`
	Cursor string      `json:"cursor,omitempty"` // ISO8601 timestamp of the last item for the next page
}
