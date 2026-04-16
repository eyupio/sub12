package service

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)

var (
	ErrClubNotFound      = errors.New("club not found")
	ErrClubAlreadyMember = errors.New("already a member of this club")
	ErrClubNotAdmin      = errors.New("admin access required")
	ErrClubNotMember     = errors.New("not a member of this club")
	ErrClubLastAdmin     = errors.New("cannot leave as the last admin; promote another member first")
	ErrInvalidClub       = errors.New("club name is required")
)

type ClubService struct {
	repo     *repository.ClubRepository
	activity *ActivityService // nil disables feed ingestion
}

func NewClubService(repo *repository.ClubRepository, activity *ActivityService) *ClubService {
	return &ClubService{repo: repo, activity: activity}
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

func (s *ClubService) List(ctx context.Context, viewerID string) ([]*model.Club, error) {
	return s.repo.List(ctx, viewerID)
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
	if err := s.repo.Join(ctx, clubID, userID); err != nil {
		return err
	}
	if s.activity != nil {
		club, _ := s.repo.GetByID(ctx, clubID, "")
		clubName := ""
		if club != nil {
			clubName = club.Name
		}
		cid, tt := clubID, "club"
		meta := model.JoinedClubMeta{ClubName: clubName}
		go s.activity.Ingest(context.Background(), userID, model.ActivityJoinedClub, &cid, &tt, meta, nil, &cid, "public")
	}
	return nil
}

func (s *ClubService) IsMember(ctx context.Context, clubID, userID string) (bool, error) {
	return s.repo.IsMember(ctx, clubID, userID)
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

// UpdateClub allows a club admin to update name/description.
func (s *ClubService) UpdateClub(ctx context.Context, clubID, requesterID string, in *model.UpdateClubInput) (*model.Club, error) {
	isAdmin, err := s.repo.IsAdmin(ctx, clubID, requesterID)
	if err != nil {
		return nil, err
	}
	if !isAdmin {
		return nil, ErrClubNotAdmin
	}
	if in.Name != nil && strings.TrimSpace(*in.Name) == "" {
		return nil, ErrInvalidClub
	}
	club, err := s.repo.AdminUpdate(ctx, clubID, in)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrClubNotFound, err)
	}
	return club, nil
}

// LeaveClub allows a member to remove themselves from a club.
func (s *ClubService) LeaveClub(ctx context.Context, clubID, userID string) error {
	isMember, err := s.repo.IsMember(ctx, clubID, userID)
	if err != nil {
		return err
	}
	if !isMember {
		return ErrClubNotMember
	}
	isAdmin, err := s.repo.IsAdmin(ctx, clubID, userID)
	if err != nil {
		return err
	}
	if isAdmin {
		count, err := s.repo.CountAdmins(ctx, clubID)
		if err != nil {
			return err
		}
		if count <= 1 {
			return ErrClubLastAdmin
		}
	}
	return s.repo.RemoveMember(ctx, clubID, userID)
}

// UpdateMemberRole allows a club admin to promote or demote another member.
func (s *ClubService) UpdateMemberRole(ctx context.Context, clubID, requesterID, targetID string, isAdmin bool) error {
	reqIsAdmin, err := s.repo.IsAdmin(ctx, clubID, requesterID)
	if err != nil {
		return err
	}
	if !reqIsAdmin {
		return ErrClubNotAdmin
	}
	// Prevent demoting the last admin
	if !isAdmin {
		count, err := s.repo.CountAdmins(ctx, clubID)
		if err != nil {
			return err
		}
		if count <= 1 {
			targetIsAdmin, err := s.repo.IsAdmin(ctx, clubID, targetID)
			if err != nil {
				return err
			}
			if targetIsAdmin {
				return ErrClubLastAdmin
			}
		}
	}
	return s.repo.UpdateMemberRole(ctx, clubID, targetID, isAdmin)
}

// AdminUpdateClub applies a partial update to any club without ownership checks.
func (s *ClubService) AdminUpdateClub(ctx context.Context, id string, in *model.UpdateClubInput) (*model.Club, error) {
	if in.Name != nil && strings.TrimSpace(*in.Name) == "" {
		return nil, ErrInvalidClub
	}
	club, err := s.repo.AdminUpdate(ctx, id, in)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrClubNotFound, err)
	}
	return club, nil
}

// AdminDeleteClub removes a club without ownership checks.
func (s *ClubService) AdminDeleteClub(ctx context.Context, id string) error {
	return s.repo.AdminDelete(ctx, id)
}

// AdminRemoveMember removes a club member without checking club admin status.
func (s *ClubService) AdminRemoveMember(ctx context.Context, clubID, userID string) error {
	return s.repo.RemoveMember(ctx, clubID, userID)
}
