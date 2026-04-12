package model

import "time"

// ── Session ─────────────────────────────────────────────────────────────────────

type PelletTestSession struct {
	ID                 string    `json:"id"`
	UserID             string    `json:"user_id"`
	RifleID            string    `json:"rifle_id"`
	PelletID           string    `json:"pellet_id"`
	TestDate           string    `json:"test_date"`
	DistanceM          float64   `json:"distance_m"`
	DistanceUnit       string    `json:"distance_unit"`
	Location           *string   `json:"location,omitempty"`
	WindMPH            *float64  `json:"wind_mph,omitempty"`
	TempCelsius        *float64  `json:"temp_celsius,omitempty"`
	HumidityPct        *float64  `json:"humidity_pct,omitempty"`
	Notes              *string   `json:"notes,omitempty"`
	AverageGroupSizeMM *float64  `json:"average_group_size_mm,omitempty"`
	BestGroupSizeMM    *float64  `json:"best_group_size_mm,omitempty"`
	GroupCount         int       `json:"group_count"`
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`

	// Joined data (populated on detail fetches)
	Groups []*PelletTestGroup `json:"groups,omitempty"`
	Images []*PelletTestImage `json:"images,omitempty"`
	Rifle  *Rifle             `json:"rifle,omitempty"`
	Pellet *Pellet            `json:"pellet,omitempty"`
}

type CreatePelletTestSessionInput struct {
	RifleID       string   `json:"rifle_id"`
	PelletID      string   `json:"pellet_id"`
	TestDate      string   `json:"test_date"`
	DistanceValue float64  `json:"distance_value"`
	DistanceUnit  string   `json:"distance_unit"`
	Location      *string  `json:"location"`
	WindMPH       *float64 `json:"wind_mph"`
	TempCelsius   *float64 `json:"temp_celsius"`
	HumidityPct   *float64 `json:"humidity_pct"`
	Notes         *string  `json:"notes"`
}

type UpdatePelletTestSessionInput struct {
	RifleID       *string  `json:"rifle_id"`
	PelletID      *string  `json:"pellet_id"`
	TestDate      *string  `json:"test_date"`
	DistanceValue *float64 `json:"distance_value"`
	DistanceUnit  *string  `json:"distance_unit"`
	Location      *string  `json:"location"`
	WindMPH       *float64 `json:"wind_mph"`
	TempCelsius   *float64 `json:"temp_celsius"`
	HumidityPct   *float64 `json:"humidity_pct"`
	Notes         *string  `json:"notes"`
}

// ── Group ───────────────────────────────────────────────────────────────────────

type PelletTestGroup struct {
	ID           string    `json:"id"`
	SessionID    string    `json:"session_id"`
	GroupNumber  int       `json:"group_number"`
	ShotCount    int       `json:"shot_count"`
	GroupSizeMM  float64   `json:"group_size_mm"`
	GroupSizeMOA *float64  `json:"group_size_moa,omitempty"`
	Notes        *string   `json:"notes,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type CreatePelletTestGroupInput struct {
	ShotCount   int      `json:"shot_count"`
	GroupSizeMM float64  `json:"group_size_mm"`
	GroupSizeMOA *float64 `json:"-"`
	Notes       *string  `json:"notes"`
}

type UpdatePelletTestGroupInput struct {
	ShotCount    *int     `json:"shot_count"`
	GroupSizeMM  *float64 `json:"group_size_mm"`
	GroupSizeMOA *float64 `json:"-"`
	Notes        *string  `json:"notes"`
}

// ── Image ───────────────────────────────────────────────────────────────────────

type PelletTestImage struct {
	ID        string    `json:"id"`
	SessionID string    `json:"session_id"`
	GroupID   *string   `json:"group_id,omitempty"`
	ImageID   string    `json:"image_id"`
	ImageURL  string    `json:"image_url"`
	Caption   *string   `json:"caption,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

// ── Summary (list view) ─────────────────────────────────────────────────────────

type PelletTestSessionSummary struct {
	ID                 string   `json:"id"`
	TestDate           string   `json:"test_date"`
	DistanceM          float64  `json:"distance_m"`
	DistanceUnit       string   `json:"distance_unit"`
	Location           *string  `json:"location,omitempty"`
	AverageGroupSizeMM *float64 `json:"average_group_size_mm,omitempty"`
	BestGroupSizeMM    *float64 `json:"best_group_size_mm,omitempty"`
	GroupCount         int      `json:"group_count"`
	RifleMake          string   `json:"rifle_make"`
	RifleModel         string   `json:"rifle_model"`
	PelletBrand        string   `json:"pellet_brand"`
	PelletModel        string   `json:"pellet_model"`
	CreatedAt          string   `json:"created_at"`
}

// ── Leaderboard ─────────────────────────────────────────────────────────────────

type PelletLeaderboardEntry struct {
	PelletID         string   `json:"pellet_id"`
	PelletBrand      string   `json:"pellet_brand"`
	PelletModel      string   `json:"pellet_model"`
	HeadSizeMM       *float64 `json:"head_size_mm,omitempty"`
	WeightGrains     *float64 `json:"weight_grains,omitempty"`
	BestGroupMM      float64  `json:"best_group_mm"`
	AvgGroupMM       float64  `json:"avg_group_mm"`
	TestCount        int      `json:"test_count"`
	TotalGroups      int      `json:"total_groups"`
	ConsistencyScore *float64 `json:"consistency_score,omitempty"`
	LastTested       string   `json:"last_tested"`
	Rank             int      `json:"rank"`
}

// ── Stats ───────────────────────────────────────────────────────────────────────

type PelletTestStats struct {
	TotalTests       int      `json:"total_tests"`
	TotalGroups      int      `json:"total_groups"`
	BestGroupMM      *float64 `json:"best_group_mm,omitempty"`
	AvgGroupMM       *float64 `json:"avg_group_mm,omitempty"`
	MostTestedPellet *string  `json:"most_tested_pellet,omitempty"`
}
