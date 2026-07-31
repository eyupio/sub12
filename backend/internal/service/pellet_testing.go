package service

import (
	"context"
	"errors"
	"fmt"
	"math"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)

var ErrInvalidPelletTest = errors.New("invalid pellet test")
var ErrInvalidMeasurement = errors.New("invalid measurement")

// yardsToMeters is the exact conversion factor (1 yd = 0.9144 m per NIST).
const yardsToMeters = 0.9144

type PelletTestService struct {
	repo         *repository.PelletTestRepository
	users        UserProfileReader   // nil skips owner-privacy checks
	activity     *ActivityService    // nil disables feed ingestion
	achievements *AchievementService // nil disables achievement evaluation
	simFilter    SimulatedContentFilter // nil = include simulated in public leaderboard
}

func NewPelletTestService(repo *repository.PelletTestRepository, activity *ActivityService, achievements *AchievementService) *PelletTestService {
	return &PelletTestService{repo: repo, activity: activity, achievements: achievements}
}

// SetUserReader wires a user lookup so GetForViewer can enforce the owner's
// profile_visibility when deciding whether to expose a public session.
func (s *PelletTestService) SetUserReader(users UserProfileReader) {
	s.users = users
}

// SetSimulatedContentFilter wires the simulation public-content toggle so the
// public pellet leaderboard can exclude simulated users' test sessions.
func (s *PelletTestService) SetSimulatedContentFilter(f SimulatedContentFilter) {
	s.simFilter = f
}

// ── Session ─────────────────────────────────────────────────────────────────────

func (s *PelletTestService) Create(ctx context.Context, userID string, in *model.CreatePelletTestSessionInput) (*model.PelletTestSession, error) {
	if in.RifleID == "" || in.PelletID == "" {
		return nil, fmt.Errorf("%w: rifle and pellet are required", ErrInvalidPelletTest)
	}
	if in.TestDate == "" {
		return nil, fmt.Errorf("%w: test date is required", ErrInvalidPelletTest)
	}
	if in.DistanceUnit == "" {
		in.DistanceUnit = "meters"
	}
	if in.DistanceUnit != "meters" && in.DistanceUnit != "yards" {
		return nil, fmt.Errorf("%w: distance unit must be meters or yards", ErrInvalidPelletTest)
	}
	if in.DistanceValue < 0 {
		return nil, fmt.Errorf("%w: distance must be zero or greater", ErrInvalidPelletTest)
	}

	distanceM := in.DistanceValue
	if in.DistanceUnit == "yards" {
		distanceM = in.DistanceValue * yardsToMeters
	}

	session, err := s.repo.Create(ctx, userID, in, distanceM)
	if err != nil {
		return nil, err
	}
	if s.activity != nil && session.IsPublic {
		tid, tt := session.ID, "pellet_test"
		meta := model.PelletTestPostedMeta{
			BestGroupMM: session.BestGroupSizeMM,
			AvgGroupMM:  session.AverageGroupSizeMM,
		}
		go s.activity.Ingest(context.Background(), userID, model.ActivityPelletTestPosted, &tid, &tt, meta, nil, nil, "public")
	}
	if s.achievements != nil {
		go s.achievements.EvaluateForPelletTest(context.Background(), userID)
	}
	return session, nil
}

func (s *PelletTestService) GetByID(ctx context.Context, id, userID string) (*model.PelletTestSession, error) {
	return s.repo.GetByID(ctx, id, userID)
}

// GetForViewer returns a session when either the viewer owns it or the
// session is public and the owner's profile is not private. Anonymous callers
// pass viewerID="". Returns repository.ErrNotFound when the viewer isn't
// allowed to see the session.
func (s *PelletTestService) GetForViewer(ctx context.Context, id, viewerID string) (*model.PelletTestSession, error) {
	session, err := s.repo.GetPublicByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if viewerID != "" && viewerID == session.UserID {
		return session, nil
	}
	// Drafts are owner-only; hide them from any viewer who doesn't own the session.
	if session.IsDraft {
		return nil, repository.ErrNotFound
	}
	if !session.IsPublic {
		return nil, repository.ErrNotFound
	}
	if s.users != nil {
		owner, err := s.users.GetByID(ctx, session.UserID)
		if err != nil {
			return nil, err
		}
		if owner.ProfileVisibility == "private" {
			return nil, repository.ErrNotFound
		}
	}
	return session, nil
}

func (s *PelletTestService) List(ctx context.Context, userID string, limit, offset int, scope string) ([]*model.PelletTestSessionSummary, error) {
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}
	if scope != "drafts" && scope != "all" {
		scope = ""
	}
	return s.repo.ListByUser(ctx, userID, limit, offset, scope)
}

// GetDraftCount returns how many quick-capture pellet-test drafts the user
// has yet to refine.
func (s *PelletTestService) GetDraftCount(ctx context.Context, userID string) (int, error) {
	return s.repo.GetDraftCount(ctx, userID)
}

// QuickCreate persists a quick-capture bench-rest draft with minimal data.
// Distance defaults to 0 so the user can skip it in the field; they'll enter
// it at refine time. Activity and achievement side-effects fire only on
// graduation.
func (s *PelletTestService) QuickCreate(ctx context.Context, userID string, in *model.QuickCreatePelletTestInput) (*model.PelletTestSession, error) {
	if in.RifleID == "" || in.PelletID == "" {
		return nil, fmt.Errorf("%w: rifle and pellet are required", ErrInvalidPelletTest)
	}
	unit := "meters"
	if in.DistanceUnit != nil && *in.DistanceUnit != "" {
		unit = *in.DistanceUnit
	}
	if unit != "meters" && unit != "yards" {
		return nil, fmt.Errorf("%w: distance unit must be meters or yards", ErrInvalidPelletTest)
	}
	var distanceM float64
	if in.DistanceValue != nil && *in.DistanceValue >= 0 {
		distanceM = *in.DistanceValue
		if unit == "yards" {
			distanceM = distanceM * yardsToMeters
		}
	}
	return s.repo.CreateDraft(ctx, userID, in, distanceM)
}

// Graduate flips a pellet-test draft to a full session. Fires the activity
// feed ingest and achievement evaluation that were suppressed during
// quick-capture. The caller should first PATCH distance / groups / etc.
func (s *PelletTestService) Graduate(ctx context.Context, id, userID string) (*model.PelletTestSession, error) {
	existing, err := s.repo.GetByID(ctx, id, userID)
	if err != nil {
		return nil, err
	}
	if !existing.IsDraft {
		return existing, nil
	}
	session, err := s.repo.Graduate(ctx, id, userID)
	if err != nil {
		return nil, err
	}
	if s.activity != nil && session.IsPublic {
		tid, tt := session.ID, "pellet_test"
		meta := model.PelletTestPostedMeta{
			BestGroupMM: session.BestGroupSizeMM,
			AvgGroupMM:  session.AverageGroupSizeMM,
		}
		go s.activity.Ingest(context.Background(), userID, model.ActivityPelletTestPosted, &tid, &tt, meta, nil, nil, "public")
	}
	if s.achievements != nil {
		go s.achievements.EvaluateForPelletTest(context.Background(), userID)
	}
	return session, nil
}

func (s *PelletTestService) Update(ctx context.Context, id, userID string, in *model.UpdatePelletTestSessionInput) (*model.PelletTestSession, error) {
	var distanceM *float64
	if in.DistanceValue != nil {
		unit := "meters"
		if in.DistanceUnit != nil {
			unit = *in.DistanceUnit
		}
		if unit != "meters" && unit != "yards" {
			return nil, fmt.Errorf("%w: distance unit must be meters or yards", ErrInvalidPelletTest)
		}
		if *in.DistanceValue <= 0 {
			return nil, fmt.Errorf("%w: distance must be greater than zero", ErrInvalidPelletTest)
		}
		d := *in.DistanceValue
		if unit == "yards" {
			d = d * yardsToMeters
		}
		distanceM = &d
	}

	session, err := s.repo.Update(ctx, id, userID, in, distanceM)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, repository.ErrNotFound
		}
		return nil, err
	}
	return session, nil
}

func (s *PelletTestService) Delete(ctx context.Context, id, userID string) error {
	return s.repo.Delete(ctx, id, userID)
}

// ── Groups ──────────────────────────────────────────────────────────────────────

func calcMOA(groupSizeMM, distanceM float64) float64 {
	if distanceM <= 0 {
		return 0
	}
	return (groupSizeMM / (distanceM * 1000)) * (180 / math.Pi) * 60
}

func (s *PelletTestService) CreateGroup(ctx context.Context, sessionID, userID string, in *model.CreatePelletTestGroupInput) (*model.PelletTestGroup, error) {
	if in.GroupSizeMM <= 0 {
		return nil, fmt.Errorf("%w: group size must be greater than zero", ErrInvalidPelletTest)
	}
	if in.ShotCount <= 0 {
		return nil, fmt.Errorf("%w: shot count must be greater than zero", ErrInvalidPelletTest)
	}

	// Fetch session to get distance for MOA calculation
	session, err := s.repo.GetByID(ctx, sessionID, userID)
	if err != nil {
		return nil, err
	}

	moa := calcMOA(in.GroupSizeMM, session.DistanceM)
	in.GroupSizeMOA = &moa

	return s.repo.CreateGroup(ctx, sessionID, userID, in)
}

func (s *PelletTestService) UpdateGroup(ctx context.Context, groupID, sessionID, userID string, in *model.UpdatePelletTestGroupInput) (*model.PelletTestGroup, error) {
	if in.GroupSizeMM != nil && *in.GroupSizeMM <= 0 {
		return nil, fmt.Errorf("%w: group size must be greater than zero", ErrInvalidPelletTest)
	}
	if in.ShotCount != nil && *in.ShotCount <= 0 {
		return nil, fmt.Errorf("%w: shot count must be greater than zero", ErrInvalidPelletTest)
	}

	// If group size is being updated, recompute MOA
	if in.GroupSizeMM != nil {
		session, err := s.repo.GetByID(ctx, sessionID, userID)
		if err != nil {
			return nil, err
		}
		moa := calcMOA(*in.GroupSizeMM, session.DistanceM)
		in.GroupSizeMOA = &moa
	}

	group, err := s.repo.UpdateGroup(ctx, groupID, sessionID, userID, in)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, repository.ErrNotFound
		}
		return nil, err
	}
	return group, nil
}

func (s *PelletTestService) DeleteGroup(ctx context.Context, groupID, sessionID, userID string) error {
	return s.repo.DeleteGroup(ctx, groupID, sessionID, userID)
}

// ── Images ──────────────────────────────────────────────────────────────────────

func (s *PelletTestService) CreateImage(ctx context.Context, sessionID, userID, imageID string, groupID *string, caption *string) (*model.PelletTestImage, error) {
	return s.repo.CreateImage(ctx, sessionID, userID, imageID, groupID, caption)
}

func (s *PelletTestService) DeleteImage(ctx context.Context, imageID, sessionID, userID string) error {
	return s.repo.DeleteImage(ctx, imageID, sessionID, userID)
}

// ── Leaderboard & Stats ─────────────────────────────────────────────────────────

func (s *PelletTestService) GetLeaderboard(ctx context.Context, userID, rifleID string) ([]*model.PelletLeaderboardEntry, error) {
	if rifleID == "" {
		return nil, fmt.Errorf("%w: rifle_id is required", ErrInvalidPelletTest)
	}
	return s.repo.GetLeaderboard(ctx, userID, rifleID)
}

func (s *PelletTestService) GetStats(ctx context.Context, userID string) (*model.PelletTestStats, error) {
	return s.repo.GetStats(ctx, userID)
}

// ── Measurements ────────────────────────────────────────────────────────────────

func (s *PelletTestService) CreateMeasurement(ctx context.Context, sessionID, userID, imageID string, in *model.CreatePelletTestMeasurementInput) (*model.PelletTestMeasurement, error) {
	if in.PixelsPerMM <= 0 {
		return nil, fmt.Errorf("%w: pixels_per_mm must be positive", ErrInvalidMeasurement)
	}
	if in.ReferenceDiameterMM <= 0 {
		return nil, fmt.Errorf("%w: reference_diameter_mm must be positive", ErrInvalidMeasurement)
	}

	// Compute measured size from bounding box if bbox is provided
	if in.BboxWidth != nil && in.BboxHeight != nil {
		diag := math.Sqrt((*in.BboxWidth)*(*in.BboxWidth) + (*in.BboxHeight)*(*in.BboxHeight))
		sizeMM := diag / in.PixelsPerMM
		in.MeasuredSizeMM = &sizeMM

		distanceM, err := s.distanceForMeasurement(ctx, sessionID, userID, in.DistanceM)
		if err != nil {
			return nil, err
		}
		moa := calcMOA(sizeMM, distanceM)
		in.MeasuredSizeMOA = &moa
	}

	m, err := s.repo.CreateMeasurement(ctx, sessionID, userID, imageID, in)
	if err != nil {
		return nil, err
	}
	if m.GroupID != nil && *m.GroupID != "" {
		if err := s.repo.SyncGroupFromMeasurements(ctx, *m.GroupID, sessionID); err != nil {
			return nil, err
		}
	}
	return m, nil
}

// distanceForMeasurement prefers the per-measurement override when set, falling
// back to the session's configured distance.
func (s *PelletTestService) distanceForMeasurement(ctx context.Context, sessionID, userID string, override *float64) (float64, error) {
	if override != nil && *override > 0 {
		return *override, nil
	}
	session, err := s.repo.GetByID(ctx, sessionID, userID)
	if err != nil {
		return 0, err
	}
	return session.DistanceM, nil
}

func (s *PelletTestService) GetMeasurements(ctx context.Context, sessionID, imageID, userID string) ([]*model.PelletTestMeasurement, error) {
	if _, err := s.repo.GetByID(ctx, sessionID, userID); err != nil {
		return nil, err
	}
	return s.repo.GetMeasurementsByImage(ctx, sessionID, imageID)
}

func (s *PelletTestService) UpdateMeasurement(ctx context.Context, measurementID, sessionID, userID string, in *model.UpdatePelletTestMeasurementInput) (*model.PelletTestMeasurement, error) {
	// Recompute measured size if bbox updated
	if in.BboxWidth != nil && in.BboxHeight != nil {
		// Need the measurement's pixels_per_mm — fetch the existing measurement
		// directly by ID (not by image, which we don't have here and which
		// previously made this lookup always return zero rows).
		found, err := s.repo.GetMeasurementByID(ctx, measurementID, sessionID)
		if err != nil {
			return nil, err
		}

		diag := math.Sqrt((*in.BboxWidth)*(*in.BboxWidth) + (*in.BboxHeight)*(*in.BboxHeight))
		sizeMM := diag / found.PixelsPerMM
		in.MeasuredSizeMM = &sizeMM

		distanceM, err := s.distanceForMeasurement(ctx, sessionID, userID, in.DistanceM)
		if err != nil {
			return nil, err
		}
		moa := calcMOA(sizeMM, distanceM)
		in.MeasuredSizeMOA = &moa
	}

	m, err := s.repo.UpdateMeasurement(ctx, measurementID, sessionID, userID, in)
	if err != nil {
		return nil, err
	}
	if m.GroupID != nil && *m.GroupID != "" {
		if err := s.repo.SyncGroupFromMeasurements(ctx, *m.GroupID, sessionID); err != nil {
			return nil, err
		}
	}
	return m, nil
}

type SessionScoring struct {
	Measurements []*model.PelletTestMeasurement `json:"measurements"`
	Detections   []*model.PelletTestDetection   `json:"detections"`
}

func (s *PelletTestService) GetSessionScoring(ctx context.Context, sessionID, userID string) (*SessionScoring, error) {
	if _, err := s.repo.GetByID(ctx, sessionID, userID); err != nil {
		return nil, err
	}
	measurements, err := s.repo.GetMeasurementsBySession(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	detections, err := s.repo.ListDetectionsBySession(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	if measurements == nil {
		measurements = []*model.PelletTestMeasurement{}
	}
	if detections == nil {
		detections = []*model.PelletTestDetection{}
	}
	return &SessionScoring{Measurements: measurements, Detections: detections}, nil
}

func (s *PelletTestService) ReplaceDetections(ctx context.Context, measurementID, sessionID, userID string, in *model.CreateDetectionsBatchInput) ([]*model.PelletTestDetection, error) {
	if _, err := s.repo.GetByID(ctx, sessionID, userID); err != nil {
		return nil, err
	}

	detections, err := s.repo.ReplaceDetectionsForMeasurement(ctx, measurementID, sessionID, in.Detections)
	if err != nil {
		return nil, err
	}

	autoGroupMM, autoGroupMOA, avgConfidence := s.computeAutoGroupSize(ctx, sessionID, userID, detections)
	method := in.DetectionMethod
	if method == "" {
		method = "manual"
	}
	if err := s.repo.UpdateMeasurementDetectionMeta(ctx, measurementID, method, len(detections), autoGroupMM, autoGroupMOA, avgConfidence); err != nil {
		return nil, err
	}
	if err := s.syncGroupForMeasurement(ctx, measurementID, sessionID); err != nil {
		return nil, err
	}
	return detections, nil
}

func (s *PelletTestService) DeleteMeasurement(ctx context.Context, measurementID, sessionID, userID string) error {
	m, lookupErr := s.repo.GetMeasurementByID(ctx, measurementID, sessionID)
	if err := s.repo.DeleteMeasurement(ctx, measurementID, sessionID, userID); err != nil {
		return err
	}
	if lookupErr == nil && m.GroupID != nil && *m.GroupID != "" {
		if err := s.repo.SyncGroupFromMeasurements(ctx, *m.GroupID, sessionID); err != nil {
			return err
		}
	}
	return nil
}

// syncGroupForMeasurement looks up the measurement's group_id (if any) and
// rebuilds the group's recorded size from its current measurement state.
func (s *PelletTestService) syncGroupForMeasurement(ctx context.Context, measurementID, sessionID string) error {
	m, err := s.repo.GetMeasurementByID(ctx, measurementID, sessionID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil
		}
		return err
	}
	if m.GroupID == nil || *m.GroupID == "" {
		return nil
	}
	return s.repo.SyncGroupFromMeasurements(ctx, *m.GroupID, sessionID)
}

// ── Comparison ──────────────────────────────────────────────────────────────────

func (s *PelletTestService) GetComparison(ctx context.Context, userID, rifleID, pelletAID, pelletBID string) (*model.PelletComparisonData, error) {
	if rifleID == "" || pelletAID == "" || pelletBID == "" {
		return nil, fmt.Errorf("%w: rifle_id, pellet_a, and pellet_b are required", ErrInvalidPelletTest)
	}

	sideA, err := s.repo.GetComparisonSide(ctx, userID, rifleID, pelletAID)
	if err != nil {
		return nil, fmt.Errorf("pellet A: %w", err)
	}

	sideB, err := s.repo.GetComparisonSide(ctx, userID, rifleID, pelletBID)
	if err != nil {
		return nil, fmt.Errorf("pellet B: %w", err)
	}

	return &model.PelletComparisonData{
		RifleID: rifleID,
		PelletA: sideA,
		PelletB: sideB,
	}, nil
}

// ── Timeline ────────────────────────────────────────────────────────────────────

func (s *PelletTestService) GetGroupTimeline(ctx context.Context, userID, rifleID string) ([]*model.GroupTimelinePoint, error) {
	return s.repo.GetGroupTimeline(ctx, userID, rifleID)
}

// ── Detections (PT-3) ───────────────────────────────────────────────────────────

func (s *PelletTestService) CreateDetections(ctx context.Context, measurementID, sessionID, userID string, in *model.CreateDetectionsBatchInput) ([]*model.PelletTestDetection, error) {
	if len(in.Detections) == 0 {
		return nil, fmt.Errorf("%w: at least one detection is required", ErrInvalidMeasurement)
	}

	// Verify session ownership
	_, err := s.repo.GetByID(ctx, sessionID, userID)
	if err != nil {
		return nil, err
	}

	detections, err := s.repo.CreateDetectionsBatch(ctx, measurementID, sessionID, in.Detections)
	if err != nil {
		return nil, err
	}

	// Compute auto group size from detections (max distance between any two hole centers)
	autoGroupMM, autoGroupMOA, avgConfidence := s.computeAutoGroupSize(ctx, sessionID, userID, detections)

	holeCount := len(detections)
	method := in.DetectionMethod
	if method == "" {
		method = "auto"
	}

	if err := s.repo.UpdateMeasurementDetectionMeta(ctx, measurementID, method, holeCount, autoGroupMM, autoGroupMOA, avgConfidence); err != nil {
		return nil, err
	}
	if err := s.syncGroupForMeasurement(ctx, measurementID, sessionID); err != nil {
		return nil, err
	}

	return detections, nil
}

func (s *PelletTestService) computeAutoGroupSize(ctx context.Context, sessionID, userID string, detections []*model.PelletTestDetection) (*float64, *float64, *float64) {
	if len(detections) < 2 {
		return nil, nil, nil
	}

	// Get measurement's pixels_per_mm from session
	session, err := s.repo.GetByID(ctx, sessionID, userID)
	if err != nil {
		return nil, nil, nil
	}

	// Find max distance between any two centers (CTC max spread = group size)
	var maxDist float64
	var totalConf float64
	for i, a := range detections {
		totalConf += a.Confidence
		for j := i + 1; j < len(detections); j++ {
			b := detections[j]
			dx := a.CenterX - b.CenterX
			dy := a.CenterY - b.CenterY
			dist := math.Sqrt(dx*dx + dy*dy)
			if dist > maxDist {
				maxDist = dist
			}
		}
	}

	avgConf := totalConf / float64(len(detections))

	// pixelsPerMM isn't passed into this method, but every detection's DiameterMM
	// was already derived client-side from the calibrated scale, so we back out
	// the same scale from the first detection's radius/diameter ratio and use it
	// to convert the pixel-space max spread into a CTC (center-to-center) group
	// size in mm — spread plus one pellet diameter, since CTC measures rim-to-rim
	// across the two outermost holes.
	if detections[0].DiameterMM != nil && detections[0].RadiusPixels > 0 {
		pixelsPerMM := (detections[0].RadiusPixels * 2) / *detections[0].DiameterMM
		groupMM := maxDist/pixelsPerMM + *detections[0].DiameterMM
		groupMOA := calcMOA(groupMM, session.DistanceM)
		return &groupMM, &groupMOA, &avgConf
	}

	return nil, nil, &avgConf
}

func (s *PelletTestService) ListDetections(ctx context.Context, sessionID, measurementID, userID string) ([]*model.PelletTestDetection, error) {
	if _, err := s.repo.GetByID(ctx, sessionID, userID); err != nil {
		return nil, err
	}
	return s.repo.ListDetections(ctx, measurementID)
}

func (s *PelletTestService) UpdateDetection(ctx context.Context, detectionID, sessionID, userID string, in *model.UpdateDetectionInput) (*model.PelletTestDetection, error) {
	return s.repo.UpdateDetection(ctx, detectionID, sessionID, userID, in)
}

func (s *PelletTestService) DeleteDetection(ctx context.Context, detectionID, sessionID, userID string) error {
	return s.repo.DeleteDetection(ctx, detectionID, sessionID, userID)
}

// ── Annotated Image ─────────────────────────────────────────────────────────────

func (s *PelletTestService) SetAnnotatedImage(ctx context.Context, measurementID, sessionID, userID, imageID string) error {
	// Verify ownership
	_, err := s.repo.GetByID(ctx, sessionID, userID)
	if err != nil {
		return err
	}
	return s.repo.SetAnnotatedImage(ctx, measurementID, imageID)
}

// ── Public Leaderboard ──────────────────────────────────────────────────────────

func (s *PelletTestService) GetPublicLeaderboard(ctx context.Context, limit, offset int) ([]*model.PublicLeaderboardEntry, error) {
	if limit <= 0 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}
	excludeSimulated := s.simFilter != nil && s.simFilter.ExcludeSimulatedFromPublic()
	return s.repo.GetPublicLeaderboard(ctx, limit, offset, excludeSimulated)
}

// ── Batch Report ────────────────────────────────────────────────────────────────

func (s *PelletTestService) GetBatchReport(ctx context.Context, userID string, pelletID *string) ([]*model.BatchReportEntry, error) {
	return s.repo.GetBatchReport(ctx, userID, pelletID)
}

// ── Confidence Badge ────────────────────────────────────────────────────────────

func (s *PelletTestService) GetConfidenceBadge(ctx context.Context, userID, rifleID, pelletID string) (*model.ConfidenceBadge, error) {
	if rifleID == "" || pelletID == "" {
		return nil, fmt.Errorf("%w: rifle_id and pellet_id are required", ErrInvalidPelletTest)
	}

	testCount, consistency, err := s.repo.GetConfidenceData(ctx, userID, rifleID, pelletID)
	if err != nil {
		return nil, err
	}

	level := "single"
	if testCount >= 5 && consistency != nil && *consistency < 1.0 {
		level = "proven"
	} else if testCount >= 2 {
		level = "emerging"
	}

	return &model.ConfidenceBadge{
		Level:            level,
		TestCount:        testCount,
		ConsistencyScore: consistency,
	}, nil
}

// ── Export ───────────────────────────────────────────────────────────────────────

func (s *PelletTestService) GetComboAnalytics(ctx context.Context, userID string, rifleID *string) ([]*model.ComboPerformanceSummary, error) {
	return s.repo.GetComboAnalytics(ctx, userID, rifleID)
}

func (s *PelletTestService) ExportSession(ctx context.Context, id, userID string) (*model.PelletTestExport, error) {
	session, err := s.repo.GetByID(ctx, id, userID)
	if err != nil {
		return nil, err
	}

	export := &model.PelletTestExport{
		Session: session,
		Groups:  session.Groups,
	}

	// Add confidence badge if we have rifle + pellet info
	badge, err := s.GetConfidenceBadge(ctx, userID, session.RifleID, session.PelletID)
	if err == nil {
		export.ConfBadge = badge
	}

	return export, nil
}
