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

type PelletTestService struct {
	repo *repository.PelletTestRepository
}

func NewPelletTestService(repo *repository.PelletTestRepository) *PelletTestService {
	return &PelletTestService{repo: repo}
}

// ── Session ─────────────────────────────────────────────────────────────────────

func (s *PelletTestService) Create(ctx context.Context, userID string, in *model.CreatePelletTestSessionInput) (*model.PelletTestSession, error) {
	if in.RifleID == "" || in.PelletID == "" {
		return nil, fmt.Errorf("%w: rifle and pellet are required", ErrInvalidPelletTest)
	}
	if in.TestDate == "" {
		return nil, fmt.Errorf("%w: test date is required", ErrInvalidPelletTest)
	}
	if in.DistanceValue <= 0 {
		return nil, fmt.Errorf("%w: distance must be greater than zero", ErrInvalidPelletTest)
	}
	if in.DistanceUnit != "meters" && in.DistanceUnit != "yards" {
		return nil, fmt.Errorf("%w: distance unit must be meters or yards", ErrInvalidPelletTest)
	}

	distanceM := in.DistanceValue
	if in.DistanceUnit == "yards" {
		distanceM = in.DistanceValue * 0.9144
	}

	return s.repo.Create(ctx, userID, in, distanceM)
}

func (s *PelletTestService) GetByID(ctx context.Context, id, userID string) (*model.PelletTestSession, error) {
	return s.repo.GetByID(ctx, id, userID)
}

func (s *PelletTestService) List(ctx context.Context, userID string, limit, offset int) ([]*model.PelletTestSessionSummary, error) {
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}
	return s.repo.ListByUser(ctx, userID, limit, offset)
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
			d = d * 0.9144
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
