package model

import "time"

// ── Session ─────────────────────────────────────────────────────────────────────

type PelletTestSession struct {
	ID                     string    `json:"id"`
	UserID                 string    `json:"user_id"`
	RifleID                string    `json:"rifle_id"`
	PelletID               string    `json:"pellet_id"`
	TestDate               string    `json:"test_date"`
	DistanceM              float64   `json:"distance_m"`
	DistanceUnit           string    `json:"distance_unit"`
	Location               *string   `json:"location,omitempty"`
	WindMPH                *float64  `json:"wind_mph,omitempty"`
	TempCelsius            *float64  `json:"temp_celsius,omitempty"`
	HumidityPct            *float64  `json:"humidity_pct,omitempty"`
	Notes                  *string   `json:"notes,omitempty"`
	VelocityFPS            *float64  `json:"velocity_fps,omitempty"`
	VelocitySD             *float64  `json:"velocity_sd,omitempty"`
	ExtremeSpreadFPS       *float64  `json:"extreme_spread_fps,omitempty"`
	BenchSetup             *string   `json:"bench_setup,omitempty"`
	ScopeDetails           *string   `json:"scope_details,omitempty"`
	BarometricPressureMbar *float64  `json:"barometric_pressure_mbar,omitempty"`
	AverageGroupSizeMM     *float64  `json:"average_group_size_mm,omitempty"`
	BestGroupSizeMM        *float64  `json:"best_group_size_mm,omitempty"`
	GroupCount             int       `json:"group_count"`
	IsPublic               bool      `json:"is_public"`
	CreatedAt              time.Time `json:"created_at"`
	UpdatedAt              time.Time `json:"updated_at"`

	// Joined data (populated on detail fetches)
	Groups []*PelletTestGroup `json:"groups,omitempty"`
	Images []*PelletTestImage `json:"images,omitempty"`
	Rifle  *Rifle             `json:"rifle,omitempty"`
	Pellet *Pellet            `json:"pellet,omitempty"`
}

type CreatePelletTestSessionInput struct {
	RifleID                string   `json:"rifle_id"`
	PelletID               string   `json:"pellet_id"`
	TestDate               string   `json:"test_date"`
	DistanceValue          float64  `json:"distance_value"`
	DistanceUnit           string   `json:"distance_unit"`
	Location               *string  `json:"location"`
	WindMPH                *float64 `json:"wind_mph"`
	TempCelsius            *float64 `json:"temp_celsius"`
	HumidityPct            *float64 `json:"humidity_pct"`
	Notes                  *string  `json:"notes"`
	VelocityFPS            *float64 `json:"velocity_fps"`
	VelocitySD             *float64 `json:"velocity_sd"`
	ExtremeSpreadFPS       *float64 `json:"extreme_spread_fps"`
	BenchSetup             *string  `json:"bench_setup"`
	ScopeDetails           *string  `json:"scope_details"`
	BarometricPressureMbar *float64 `json:"barometric_pressure_mbar"`
}

type UpdatePelletTestSessionInput struct {
	RifleID                *string  `json:"rifle_id"`
	PelletID               *string  `json:"pellet_id"`
	TestDate               *string  `json:"test_date"`
	DistanceValue          *float64 `json:"distance_value"`
	DistanceUnit           *string  `json:"distance_unit"`
	Location               *string  `json:"location"`
	WindMPH                *float64 `json:"wind_mph"`
	TempCelsius            *float64 `json:"temp_celsius"`
	HumidityPct            *float64 `json:"humidity_pct"`
	Notes                  *string  `json:"notes"`
	VelocityFPS            *float64 `json:"velocity_fps"`
	VelocitySD             *float64 `json:"velocity_sd"`
	ExtremeSpreadFPS       *float64 `json:"extreme_spread_fps"`
	BenchSetup             *string  `json:"bench_setup"`
	ScopeDetails           *string  `json:"scope_details"`
	BarometricPressureMbar *float64 `json:"barometric_pressure_mbar"`
	IsPublic               *bool    `json:"is_public"`
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
	ShotCount    int      `json:"shot_count"`
	GroupSizeMM  float64  `json:"group_size_mm"`
	GroupSizeMOA *float64 `json:"-"`
	Notes        *string  `json:"notes"`
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

// ── Measurement ─────────────────────────────────────────────────────────────────

type PelletTestMeasurement struct {
	ID                  string    `json:"id"`
	ImageID             string    `json:"image_id"`
	SessionID           string    `json:"session_id"`
	GroupID             *string   `json:"group_id,omitempty"`
	CalibrationType     string    `json:"calibration_type"`
	TargetPreset        *string   `json:"target_preset,omitempty"`
	ReferenceRingName   *string   `json:"reference_ring_name,omitempty"`
	ReferenceDiameterMM float64   `json:"reference_diameter_mm"`
	ReferencePixels     float64   `json:"reference_pixels"`
	PixelsPerMM         float64   `json:"pixels_per_mm"`
	RefCenterX          float64   `json:"ref_center_x"`
	RefCenterY          float64   `json:"ref_center_y"`
	RefRadiusPixels     float64   `json:"ref_radius_pixels"`
	BboxX               *float64  `json:"bbox_x,omitempty"`
	BboxY               *float64  `json:"bbox_y,omitempty"`
	BboxWidth           *float64  `json:"bbox_width,omitempty"`
	BboxHeight          *float64  `json:"bbox_height,omitempty"`
	MeasuredSizeMM      *float64  `json:"measured_size_mm,omitempty"`
	MeasuredSizeMOA     *float64  `json:"measured_size_moa,omitempty"`
	DetectionMethod     string    `json:"detection_method"`
	AnnotatedImageID    *string   `json:"annotated_image_id,omitempty"`
	DetectedHoleCount   int       `json:"detected_hole_count"`
	AutoGroupSizeMM     *float64  `json:"auto_group_size_mm,omitempty"`
	AutoGroupSizeMOA    *float64  `json:"auto_group_size_moa,omitempty"`
	DetectionConfidence *float64  `json:"detection_confidence,omitempty"`
	CreatedAt           time.Time `json:"created_at"`
	UpdatedAt           time.Time `json:"updated_at"`
}

type CreatePelletTestMeasurementInput struct {
	GroupID             *string  `json:"group_id"`
	CalibrationType     string   `json:"calibration_type"`
	TargetPreset        *string  `json:"target_preset"`
	ReferenceRingName   *string  `json:"reference_ring_name"`
	ReferenceDiameterMM float64  `json:"reference_diameter_mm"`
	ReferencePixels     float64  `json:"reference_pixels"`
	PixelsPerMM         float64  `json:"pixels_per_mm"`
	RefCenterX          float64  `json:"ref_center_x"`
	RefCenterY          float64  `json:"ref_center_y"`
	RefRadiusPixels     float64  `json:"ref_radius_pixels"`
	BboxX               *float64 `json:"bbox_x"`
	BboxY               *float64 `json:"bbox_y"`
	BboxWidth           *float64 `json:"bbox_width"`
	BboxHeight          *float64 `json:"bbox_height"`
	MeasuredSizeMM      *float64 `json:"-"`
	MeasuredSizeMOA     *float64 `json:"-"`
}

type UpdatePelletTestMeasurementInput struct {
	GroupID         *string  `json:"group_id"`
	BboxX           *float64 `json:"bbox_x"`
	BboxY           *float64 `json:"bbox_y"`
	BboxWidth       *float64 `json:"bbox_width"`
	BboxHeight      *float64 `json:"bbox_height"`
	MeasuredSizeMM  *float64 `json:"-"`
	MeasuredSizeMOA *float64 `json:"-"`
}

// ── Comparison & Timeline ───────────────────────────────────────────────────────

type PelletComparisonData struct {
	RifleID string                `json:"rifle_id"`
	PelletA *PelletComparisonSide `json:"pellet_a"`
	PelletB *PelletComparisonSide `json:"pellet_b"`
}

type PelletComparisonSide struct {
	PelletID    string             `json:"pellet_id"`
	PelletBrand string             `json:"pellet_brand"`
	PelletModel string             `json:"pellet_model"`
	TestCount   int                `json:"test_count"`
	TotalGroups int                `json:"total_groups"`
	BestGroupMM *float64           `json:"best_group_mm,omitempty"`
	AvgGroupMM  *float64           `json:"avg_group_mm,omitempty"`
	AvgVelocity *float64           `json:"avg_velocity_fps,omitempty"`
	AvgSD       *float64           `json:"avg_velocity_sd,omitempty"`
	Consistency *float64           `json:"consistency_score,omitempty"`
	Groups      []*PelletTestGroup `json:"groups"`
}

type GroupTimelinePoint struct {
	TestDate     string   `json:"test_date"`
	PelletID     string   `json:"pellet_id"`
	PelletBrand  string   `json:"pellet_brand"`
	PelletModel  string   `json:"pellet_model"`
	GroupSizeMM  float64  `json:"group_size_mm"`
	GroupSizeMOA *float64 `json:"group_size_moa,omitempty"`
	DistanceM    float64  `json:"distance_m"`
}

// ── Detection (PT-3) ────────────────────────────────────────────────────────────

type PelletTestDetection struct {
	ID            string    `json:"id"`
	MeasurementID string    `json:"measurement_id"`
	SessionID     string    `json:"session_id"`
	CenterX       float64   `json:"center_x"`
	CenterY       float64   `json:"center_y"`
	RadiusPixels  float64   `json:"radius_pixels"`
	DiameterMM    *float64  `json:"diameter_mm,omitempty"`
	Confidence    float64   `json:"confidence"`
	IsConfirmed   bool      `json:"is_confirmed"`
	IsRejected    bool      `json:"is_rejected"`
	CreatedAt     time.Time `json:"created_at"`
}

type CreateDetectionInput struct {
	CenterX      float64  `json:"center_x"`
	CenterY      float64  `json:"center_y"`
	RadiusPixels float64  `json:"radius_pixels"`
	DiameterMM   *float64 `json:"diameter_mm"`
	Confidence   float64  `json:"confidence"`
}

type CreateDetectionsBatchInput struct {
	DetectionMethod string                 `json:"detection_method"`
	Detections      []CreateDetectionInput `json:"detections"`
}

type UpdateDetectionInput struct {
	CenterX      *float64 `json:"center_x"`
	CenterY      *float64 `json:"center_y"`
	RadiusPixels *float64 `json:"radius_pixels"`
	IsConfirmed  *bool    `json:"is_confirmed"`
	IsRejected   *bool    `json:"is_rejected"`
}

// ── Confidence Badge ────────────────────────────────────────────────────────────

// ConfidenceLevel: "single" (1 test), "emerging" (2–4 tests), "proven" (5+ tests, low SD)
type ConfidenceBadge struct {
	Level            string   `json:"level"`
	TestCount        int      `json:"test_count"`
	ConsistencyScore *float64 `json:"consistency_score,omitempty"`
}

// ── Public Leaderboard ──────────────────────────────────────────────────────────

type PublicLeaderboardEntry struct {
	PelletBrand  string   `json:"pellet_brand"`
	PelletModel  string   `json:"pellet_model"`
	HeadSizeMM   *float64 `json:"head_size_mm,omitempty"`
	WeightGrains *float64 `json:"weight_grains,omitempty"`
	BestGroupMM  float64  `json:"best_group_mm"`
	AvgGroupMM   float64  `json:"avg_group_mm"`
	UserCount    int      `json:"user_count"`
	TestCount    int      `json:"test_count"`
	TotalGroups  int      `json:"total_groups"`
	Rank         int      `json:"rank"`
}

// ── Batch Report ────────────────────────────────────────────────────────────────

type BatchReportEntry struct {
	BatchCode   string   `json:"batch_code"`
	PelletBrand string   `json:"pellet_brand"`
	PelletModel string   `json:"pellet_model"`
	TestCount   int      `json:"test_count"`
	TotalGroups int      `json:"total_groups"`
	BestGroupMM *float64 `json:"best_group_mm,omitempty"`
	AvgGroupMM  *float64 `json:"avg_group_mm,omitempty"`
	Consistency *float64 `json:"consistency_score,omitempty"`
	LastTested  string   `json:"last_tested"`
}

// ── Export ───────────────────────────────────────────────────────────────────────

type PelletTestExport struct {
	Session   *PelletTestSession `json:"session"`
	Groups    []*PelletTestGroup `json:"groups"`
	ConfBadge *ConfidenceBadge   `json:"confidence_badge,omitempty"`
}
