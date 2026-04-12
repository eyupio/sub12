package service

import (
	"context"
	"errors"
	"fmt"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)

var (
	ErrClubNotFound      = errors.New("club not found")
	ErrClubAlreadyMember = errors.New("already a member of this club")
	ErrClubNotAdmin      = errors.New("admin access required")
	ErrInvalidClub       = errors.New("club name is required")
)

type ClubService struct {
	repo *repository.ClubRepository
}

func NewClubService(repo *repository.ClubRepository) *ClubService {
	return &ClubService{repo: repo}
}

func (s *ClubService) Create(ctx context.Context, userID string, input *model.CreateClubInput) (*model.Club, error) {
	if input.Name == "" {
		return nil, ErrInvalidClub
	}
	return s.repo.Create(ctx, userID, input)
}

func (s *ClubService) GetByID(ctx context.Context, clubID, viewerID string) (*model.Club, error) {
	club, err := s.repo.GetByID(ctx, clubID, viewerID)
	if err != nil {
		return nil, fmt.Errorf("club not found: %w", ErrClubNotFound)
	}
	return club, nil
}

func (s *ClubService) List(ctx context.Context) ([]*model.Club, error) {
	return s.repo.List(ctx)
}

func (s *ClubService) ListByUser(ctx context.Context, userID string) ([]*model.Club, error) {
	return s.repo.ListByUser(ctx, userID)
}

func (s *ClubService) Join(ctx context.Context, clubID, userID string) error {
	member, err := s.repo.IsMember(ctx, clubID, userID)
	if err != nil {
		return err
	}
	if member {
		return ErrClubAlreadyMember
	}
	return s.repo.Join(ctx, clubID, userID)
}

func (s *ClubService) ListMembers(ctx context.Context, clubID string) ([]*model.ClubMember, error) {
	return s.repo.ListMembers(ctx, clubID)
}

func (s *ClubService) GetStandings(ctx context.Context, clubID string) ([]*model.ClubStanding, error) {
	return s.repo.GetStandings(ctx, clubID)
}

func (s *ClubService) RemoveMember(ctx context.Context, clubID, requesterID, targetID string) error {
	isAdmin, err := s.repo.IsAdmin(ctx, clubID, requesterID)
	if err != nil {
		return err
	}
	if !isAdmin {
		return ErrClubNotAdmin
	}
	return s.repo.RemoveMember(ctx, clubID, targetID)
}

func (s *ClubService) UpdateImageURL(ctx context.Context, clubID, requesterID, url string) error {
	isAdmin, err := s.repo.IsAdmin(ctx, clubID, requesterID)
	if err != nil {
		return err
	}
	if !isAdmin {
		return ErrClubNotAdmin
	}
	return s.repo.UpdateImageURL(ctx, clubID, url)
}
