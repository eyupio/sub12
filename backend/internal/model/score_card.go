package model

import "time"

type ScoreCard struct {
	ID            string    `json:"id"`
	UserID        string    `json:"user_id"`
	RifleID       *string   `json:"rifle_id,omitempty"`
	PelletID      *string   `json:"pellet_id,omitempty"`
	ShotAt        string    `json:"shot_at"` // YYYY-MM-DD
	Location      *string   `json:"location,omitempty"`
	WindMPH       *float64  `json:"wind_mph,omitempty"`
	TempCelsius   *float64  `json:"temp_celsius,omitempty"`
	DistanceM     *int      `json:"distance_m,omitempty"`
	Discipline    *string   `json:"discipline,omitempty"`
	Notes         *string   `json:"notes,omitempty"`
	ShotScores    []int16   `json:"shot_scores"`
	ShotXs        []bool    `json:"shot_xs"`
	TotalScore    int16     `json:"total_score"`
	XCount        int16     `json:"x_count"`
	CardImageURL  *string   `json:"card_image_url,omitempty"`
	Verification  string    `json:"verification"`
	Visibility    string    `json:"visibility"`
	LeagueRoundID *string   `json:"league_round_id,omitempty"`
	ClubID        *string   `json:"club_id,omitempty"`
	LikeCount     int       `json:"like_count"`
	CommentCount  int       `json:"comment_count"`
	IsLiked       bool      `json:"is_liked"`
	IsDraft       bool      `json:"is_draft"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// QuickCreateScoreCardInput is the minimal payload accepted by the
// quick-capture endpoint. Shot grid and full metadata are filled in later
// via the refine flow.
type QuickCreateScoreCardInput struct {
	RifleID       *string  `json:"rifle_id"`
	PelletID      *string  `json:"pellet_id"`
	ShotAt        *string  `json:"shot_at"` // YYYY-MM-DD, defaults to today
	Location      *string  `json:"location"`
	WindMPH       *float64 `json:"wind_mph"`
	TempCelsius   *float64 `json:"temp_celsius"`
	DistanceM     *int     `json:"distance_m"`
	Discipline    *string  `json:"discipline"`
	Notes         *string  `json:"notes"`
	LeagueRoundID *string  `json:"league_round_id"`
	ClubID        *string  `json:"club_id"`
	Visibility    *string  `json:"visibility"`
}

// ScoreCardAuthor is a compact, public-safe subset of the card owner's
// profile, embedded into the score-card GET response so shared views can
// render attribution (avatar, name, location, star level) in one fetch.
type ScoreCardAuthor struct {
	ID          string  `json:"id"`
	DisplayName string  `json:"display_name"`
	AvatarURL   *string `json:"avatar_url,omitempty"`
	Location    *string `json:"location,omitempty"`
	Bio         *string `json:"bio,omitempty"`
	StarLevel   int     `json:"star_level"`
}

// ScoreCardAchievement is an earned achievement surfaced alongside a shared
// score card so viewers can see the owner's accomplishments at a glance.
type ScoreCardAchievement struct {
	ID       string    `json:"id"`
	Name     string    `json:"name"`
	Icon     string    `json:"icon"`
	EarnedAt time.Time `json:"earned_at"`
}

// ScoreCardWithAuthor is the enriched response used by the public
// score-card GET endpoint. It keeps the full `ScoreCard` JSON shape intact
// and layers optional `author` / `achievements` attribution on top.
type ScoreCardWithAuthor struct {
	*ScoreCard
	Author       *ScoreCardAuthor        `json:"author,omitempty"`
	Achievements []*ScoreCardAchievement `json:"achievements,omitempty"`
	// IsPB indicates this card is the user's all-time-best total score
	// (strict inequality vs all prior non-draft cards). False when the user
	// has no prior cards.
	IsPB bool `json:"is_pb"`
	// PBDelta is total_score - previous best, set only when IsPB is true.
	PBDelta *int16 `json:"pb_delta,omitempty"`
	// RunningAvg is the mean total_score across all the user's prior
	// non-draft cards. Null when the user has no prior cards.
	RunningAvg *float64 `json:"running_avg,omitempty"`
}

type CreateScoreCardInput struct {
	RifleID       *string  `json:"rifle_id"`
	PelletID      *string  `json:"pellet_id"`
	ShotAt        string   `json:"shot_at"`
	Location      *string  `json:"location"`
	WindMPH       *float64 `json:"wind_mph"`
	TempCelsius   *float64 `json:"temp_celsius"`
	DistanceM     *int     `json:"distance_m"`
	Discipline    *string  `json:"discipline"`
	Notes         *string  `json:"notes"`
	ShotScores    []int16  `json:"shot_scores"`
	ShotXs        []bool   `json:"shot_xs"`
	LeagueRoundID *string  `json:"league_round_id"`
	ClubID        *string  `json:"club_id"`
	Visibility    *string  `json:"visibility"`
}

// UpdateScoreCardInput holds fields a user can change after submission.
type UpdateScoreCardInput struct {
	RifleID     *string  `json:"rifle_id"`
	PelletID    *string  `json:"pellet_id"`
	ShotAt      string   `json:"shot_at"`
	Location    *string  `json:"location"`
	WindMPH     *float64 `json:"wind_mph"`
	TempCelsius *float64 `json:"temp_celsius"`
	DistanceM   *int     `json:"distance_m"`
	Discipline  *string  `json:"discipline"`
	Notes       *string  `json:"notes"`
	ShotScores  []int16  `json:"shot_scores"`
	ShotXs      []bool   `json:"shot_xs"`
	Visibility  *string  `json:"visibility"`
}

// Comment is a user comment on any content type (score_card, post, etc.).
type Comment struct {
	ID          string    `json:"id"`
	TargetID    string    `json:"target_id"`
	TargetType  string    `json:"target_type"`
	ParentID    *string   `json:"parent_id,omitempty"`
	UserID      string    `json:"user_id"`
	DisplayName string    `json:"display_name"`
	AvatarURL   *string   `json:"avatar_url,omitempty"`
	Body        string    `json:"body"`
	LikeCount   int       `json:"like_count"`
	ReplyCount  int       `json:"reply_count"`
	IsLiked     bool      `json:"is_liked"`
	IsFlagged   bool      `json:"is_flagged,omitempty"`
	FlagReason  *string   `json:"flag_reason,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type CreateCommentInput struct {
	Body     string  `json:"body"`
	ParentID *string `json:"parent_id,omitempty"`
}

type UpdateCommentInput struct {
	Body string `json:"body"`
}

// ScoreCardSummary is a lighter struct used in list responses.
type ScoreCardSummary struct {
	ID            string    `json:"id"`
	ShotAt        string    `json:"shot_at"`
	TotalScore    int16     `json:"total_score"`
	XCount        int16     `json:"x_count"`
	Location      *string   `json:"location,omitempty"`
	Verification  string    `json:"verification"`
	LeagueRoundID *string   `json:"league_round_id,omitempty"`
	LeagueID      *string   `json:"league_id,omitempty"`
	LeagueName    *string   `json:"league_name,omitempty"`
	ClubID        *string   `json:"club_id,omitempty"`
	CardImageURL  *string   `json:"card_image_url,omitempty"`
	IsDraft       bool      `json:"is_draft"`
	CreatedAt     time.Time `json:"created_at"`
}

// LeagueScore is a score card summary enriched with the submitter's display name,
// used when listing all scores for a league.
type LeagueScore struct {
	ID           string    `json:"id"`
	UserID       string    `json:"user_id"`
	DisplayName  string    `json:"display_name"`
	ShotAt       string    `json:"shot_at"`
	TotalScore   int16     `json:"total_score"`
	XCount       int16     `json:"x_count"`
	Verification string    `json:"verification"`
	CreatedAt    time.Time `json:"created_at"`
}
