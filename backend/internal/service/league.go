package service

import (
	"context"
	"errors"
	"fmt"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)

var (
	ErrLeagueNotFound  = errors.New("league not found")
	ErrAlreadyMember   = errors.New("already a member of this league")
	ErrInvalidLeague   = errors.New("invalid league")
)

type LeagueService struct {
	leagues *repository.LeagueRepository
}

func NewLeagueService(leagues *repository.LeagueRepository) *LeagueService {
	return &LeagueService{leagues: leagues}
}

func (s *LeagueService) Create(ctx context.Context, userID string, input *model.CreateLeagueInput) (*model.League, error) {
	if input.Name == "" {
		return nil, fmt.Errorf("%w: name is required", ErrInvalidLeague)
	}
	return s.leagues.Create(ctx, userID, input)
}

func (s *LeagueService) GetByID(ctx context.Context, id string) (*model.League, error) {
	league, err := s.leagues.GetByID(ctx, id)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, ErrLeagueNotFound
	}
	return league, err
}

func (s *LeagueService) ListPublic(ctx context.Context) ([]*model.League, error) {
	return s.leagues.ListPublic(ctx)
}

func (s *LeagueService) Join(ctx context.Context, leagueID, userID string) error {
	err := s.leagues.Join(ctx, leagueID, userID)
	if errors.Is(err, repository.ErrNotFound) {
		return ErrLeagueNotFound
	}
	if errors.Is(err, repository.ErrAlreadyMember) {
		return ErrAlreadyMember
	}
	return err
}

func (s *LeagueService) Standings(ctx context.Context, leagueID string) ([]*model.LeagueStanding, error) {
	// Verify league exists first so we return 404 vs empty list
	_, err := s.leagues.GetByID(ctx, leagueID)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, ErrLeagueNotFound
	}
	if err != nil {
		return nil, err
	}
	return s.leagues.Standings(ctx, leagueID)
}
