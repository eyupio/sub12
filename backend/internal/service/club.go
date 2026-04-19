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
	ErrClubNotFound       = errors.New("club not found")
	ErrClubAlreadyMember  = errors.New("already a member of this club")
	ErrClubNotAdmin       = errors.New("admin access required")
	ErrClubNotMember      = errors.New("not a member of this club")
	ErrClubLastAdmin      = errors.New("cannot leave as the last admin; promote another member first")
	ErrInvalidClub        = errors.New("club name is required")
	ErrClubInvalidType    = errors.New("type must be 'public' or 'private'")
	ErrClubInvalidPolicy  = errors.New("join_policy must be 'open', 'invite_code', or 'approval'")
	ErrClubPendingRequest = errors.New("join request already pending")
	ErrClubInvalidCode    = errors.New("invalid join code")
	ErrClubInvalidDecide  = errors.New("decision must be 'approved' or 'rejected'")
)

type ClubService struct {
	repo         *repository.ClubRepository
	activity     *ActivityService    // nil disables feed ingestion
	achievements *AchievementService // nil disables achievement evaluation
}

func NewClubService(repo *repository.ClubRepository, activity *ActivityService, achievements *AchievementService) *ClubService {
	return &ClubService{repo: repo, activity: activity, achievements: achievements}
}

func (s *ClubService) Create(ctx context.Context, userID string, input *model.CreateClubInput) (*model.Club, error) {
	if input.Name == "" {
		return nil, ErrInvalidClub
	}
	if input.Type != nil && *input.Type != "public" && *input.Type != "private" {
		return nil, ErrClubInvalidType
	}
	if input.JoinPolicy != nil && *input.JoinPolicy != "open" && *input.JoinPolicy != "invite_code" && *input.JoinPolicy != "approval" {
		return nil, ErrClubInvalidPolicy
	}
	return s.repo.Create(ctx, userID, input)
}

// GetByID returns a club when the viewer is allowed to see it. Private clubs
// are visible only to members; non-members receive ErrClubNotFound.
func (s *ClubService) GetByID(ctx context.Context, clubID, viewerID string) (*model.Club, error) {
	club, err := s.repo.GetByID(ctx, clubID, viewerID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrClubNotFound
		}
		return nil, err
	}
	if club.Type == "private" && !club.IsMember {
		return nil, ErrClubNotFound
	}
	return club, nil
}

func (s *ClubService) List(ctx context.Context, viewerID string) ([]*model.Club, error) {
	return s.repo.List(ctx, viewerID)
}

// SummaryByID returns a minimal public summary of any club, including private
// ones. Used to render a members-only banner with a join CTA without
// exposing members, standings or posts.
func (s *ClubService) SummaryByID(ctx context.Context, clubID string) (*model.ClubSummary, error) {
	club, err := s.repo.GetByID(ctx, clubID, "")
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrClubNotFound
		}
		return nil, err
	}
	return &model.ClubSummary{
		ID:             club.ID,
		Name:           club.Name,
		Description:    club.Description,
		ImageURL:       club.ImageURL,
		Type:           club.Type,
		JoinPolicy:     club.JoinPolicy,
		PostVisibility: club.PostVisibility,
		MemberCount:    club.MemberCount,
	}, nil
}

func (s *ClubService) ListByUser(ctx context.Context, userID string) ([]*model.Club, error) {
	return s.repo.ListByUser(ctx, userID)
}

// Join routes through the club's join policy.
// Returns (joined, pending, err).
func (s *ClubService) Join(ctx context.Context, clubID, userID, joinCode string) (bool, bool, error) {
	club, err := s.repo.GetByID(ctx, clubID, "")
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return false, false, ErrClubNotFound
		}
		return false, false, err
	}

	member, err := s.repo.IsMember(ctx, clubID, userID)
	if err != nil {
		return false, false, err
	}
	if member {
		return false, false, ErrClubAlreadyMember
	}

	switch club.JoinPolicy {
	case "open":
		// fall through to instant join below
	case "invite_code":
		if joinCode == "" || joinCode != club.JoinCode {
			return false, false, ErrClubInvalidCode
		}
	case "approval":
		_, err := s.repo.CreateJoinRequest(ctx, clubID, userID)
		if errors.Is(err, repository.ErrConflict) {
			return false, false, ErrClubPendingRequest
		}
		if err != nil {
			return false, false, err
		}
		return false, true, nil
	default:
		return false, false, fmt.Errorf("unknown club join policy")
	}

	if err := s.repo.Join(ctx, clubID, userID); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return false, false, ErrClubNotFound
		}
		if errors.Is(err, repository.ErrAlreadyMember) {
			return false, false, ErrClubAlreadyMember
		}
		return false, false, err
	}
	if s.activity != nil {
		cid, tt := clubID, "club"
		meta := model.JoinedClubMeta{ClubName: club.Name}
		go s.activity.Ingest(context.Background(), userID, model.ActivityJoinedClub, &cid, &tt, meta, nil, &cid, "public")
	}
	if s.achievements != nil {
		go s.achievements.EvaluateForClubJoin(context.Background(), userID)
	}
	return true, false, nil
}

func (s *ClubService) IsMember(ctx context.Context, clubID, userID string) (bool, error) {
	return s.repo.IsMember(ctx, clubID, userID)
}

// ListMembers returns club members. Private clubs are gated to members only.
func (s *ClubService) ListMembers(ctx context.Context, clubID, viewerID string) ([]*model.ClubMember, error) {
	if err := s.ensureClubAccess(ctx, clubID, viewerID); err != nil {
		return nil, err
	}
	return s.repo.ListMembers(ctx, clubID)
}

// GetStandings returns club standings. Private clubs are gated to members only.
func (s *ClubService) GetStandings(ctx context.Context, clubID, viewerID string) ([]*model.ClubStanding, error) {
	if err := s.ensureClubAccess(ctx, clubID, viewerID); err != nil {
		return nil, err
	}
	return s.repo.GetStandings(ctx, clubID)
}

// ensureClubAccess enforces that viewers can see content from private clubs
// only when they are members.
func (s *ClubService) ensureClubAccess(ctx context.Context, clubID, viewerID string) error {
	club, err := s.repo.GetByID(ctx, clubID, "")
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrClubNotFound
		}
		return err
	}
	if club.Type != "private" {
		return nil
	}
	if viewerID == "" {
		return ErrClubNotFound
	}
	isMember, err := s.repo.IsMember(ctx, clubID, viewerID)
	if err != nil {
		return err
	}
	if !isMember {
		return ErrClubNotFound
	}
	return nil
}

// ListJoinRequests returns pending (or filtered) join requests for admins.
func (s *ClubService) ListJoinRequests(ctx context.Context, clubID, requesterID, status string) ([]*model.ClubJoinRequest, error) {
	isAdmin, err := s.repo.IsAdmin(ctx, clubID, requesterID)
	if err != nil {
		return nil, err
	}
	if !isAdmin {
		return nil, ErrClubNotAdmin
	}
	return s.repo.ListJoinRequests(ctx, clubID, status)
}

// DecideJoinRequest accepts or rejects a join request; on approval the
// requester is added as a member.
func (s *ClubService) DecideJoinRequest(ctx context.Context, clubID, requestID, adminID, decision string) error {
	if decision != "approved" && decision != "rejected" {
		return ErrClubInvalidDecide
	}
	isAdmin, err := s.repo.IsAdmin(ctx, clubID, adminID)
	if err != nil {
		return err
	}
	if !isAdmin {
		return ErrClubNotAdmin
	}
	req, err := s.repo.DecideJoinRequest(ctx, requestID, adminID, decision)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrClubNotFound
		}
		return err
	}
	if req.ClubID != clubID {
		// Request belongs to a different club; treat as not-found.
		return ErrClubNotFound
	}
	if decision == "approved" {
		if err := s.repo.Join(ctx, clubID, req.UserID); err != nil {
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
			go s.activity.Ingest(context.Background(), req.UserID, model.ActivityJoinedClub, &cid, &tt, meta, nil, &cid, "public")
		}
		if s.achievements != nil {
			go s.achievements.EvaluateForClubJoin(context.Background(), req.UserID)
		}
	}
	return nil
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
	if in.PostVisibility != nil && *in.PostVisibility != "members" && *in.PostVisibility != "public" {
		return nil, ErrInvalidClub
	}
	if in.DateFormat != nil && !IsValidDateFormat(*in.DateFormat) {
		return nil, ErrInvalidClub
	}
	if in.TimeFormat != nil && !IsValidTimeFormat(*in.TimeFormat) {
		return nil, ErrInvalidClub
	}
	if in.Timezone != nil && !IsValidTimezone(*in.Timezone) {
		return nil, ErrInvalidClub
	}
	club, err := s.repo.AdminUpdate(ctx, clubID, in)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrClubNotFound, err)
	}
	return club, nil
}

// RegenerateJoinCode rotates the club's invite code. Admins only.
func (s *ClubService) RegenerateJoinCode(ctx context.Context, clubID, requesterID string) (string, error) {
	isAdmin, err := s.repo.IsAdmin(ctx, clubID, requesterID)
	if err != nil {
		return "", err
	}
	if !isAdmin {
		return "", ErrClubNotAdmin
	}
	code, err := s.repo.RegenerateJoinCode(ctx, clubID)
	if errors.Is(err, repository.ErrNotFound) {
		return "", ErrClubNotFound
	}
	return code, err
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
	if in.PostVisibility != nil && *in.PostVisibility != "members" && *in.PostVisibility != "public" {
		return nil, ErrInvalidClub
	}
	if in.DateFormat != nil && !IsValidDateFormat(*in.DateFormat) {
		return nil, ErrInvalidClub
	}
	if in.TimeFormat != nil && !IsValidTimeFormat(*in.TimeFormat) {
		return nil, ErrInvalidClub
	}
	if in.Timezone != nil && !IsValidTimezone(*in.Timezone) {
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

// AdminListMembers lists members for a club without the private-club viewer gate.
func (s *ClubService) AdminListMembers(ctx context.Context, clubID string) ([]*model.ClubMember, error) {
	return s.repo.ListMembers(ctx, clubID)
}
