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
	ErrNotAdmin        = errors.New("not a league admin")
	ErrNotMember       = errors.New("not a league member")
	ErrInvalidConfig   = errors.New("invalid league config")
	ErrInvalidSeason   = errors.New("invalid season")
	ErrInvalidRound    = errors.New("invalid round")
	ErrInvalidJoinCode = errors.New("invalid join code")
	ErrPendingRequest  = errors.New("join request already pending")
	ErrAlreadyConfirmed = errors.New("already confirmed this score")
	ErrCannotConfirmOwn = errors.New("cannot confirm your own score")
	ErrReasonRequired   = errors.New("reason is required for rejection")
)

type LeagueService struct {
	leagues *repository.LeagueRepository
}

func NewLeagueService(leagues *repository.LeagueRepository) *LeagueService {
	return &LeagueService{leagues: leagues}
}

func (s *LeagueService) requireAdmin(ctx context.Context, leagueID, userID string) error {
	isAdmin, err := s.leagues.IsAdmin(ctx, leagueID, userID)
	if err != nil {
		return err
	}
	if !isAdmin {
		return ErrNotAdmin
	}
	return nil
}

func (s *LeagueService) Create(ctx context.Context, userID string, input *model.CreateLeagueInput) (*model.League, error) {
	if input.Name == "" {
		return nil, fmt.Errorf("%w: name is required", ErrInvalidLeague)
	}
	if input.Type != "" && input.Type != "public" && input.Type != "private" {
		return nil, fmt.Errorf("%w: type must be 'public' or 'private'", ErrInvalidLeague)
	}
	return s.leagues.Create(ctx, userID, input)
}

// RemoveMember removes a non-admin member from a league. Only league admins may call this.
func (s *LeagueService) RemoveMember(ctx context.Context, leagueID, adminID, memberID string) error {
	if adminID == memberID {
		return fmt.Errorf("%w: cannot remove yourself", ErrNotAdmin)
	}
	if err := s.requireAdmin(ctx, leagueID, adminID); err != nil {
		return err
	}
	return s.leagues.RemoveMember(ctx, leagueID, memberID)
}

// ListMyLeagues returns leagues the user is a member of, with their rank in each.
func (s *LeagueService) ListMyLeagues(ctx context.Context, userID string) ([]*model.MyLeagueSummary, error) {
	leagues, err := s.leagues.ListByUser(ctx, userID)
	if err != nil {
		return nil, err
	}

	for _, l := range leagues {
		standings, err := s.Standings(ctx, l.ID)
		if err != nil {
			// If standings fail, leave rank as 0 (unknown)
			continue
		}
		for _, st := range standings {
			if st.UserID == userID {
				l.UserRank = st.Rank
				break
			}
		}
	}

	return leagues, nil
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

// Join handles joining a league respecting the join policy.
// Returns (joined, pending, err).
func (s *LeagueService) Join(ctx context.Context, leagueID, userID, joinCode string) (bool, bool, error) {
	// Verify league exists
	_, err := s.leagues.GetByID(ctx, leagueID)
	if errors.Is(err, repository.ErrNotFound) {
		return false, false, ErrLeagueNotFound
	}
	if err != nil {
		return false, false, err
	}

	// Check if already a member
	isMember, err := s.leagues.IsMember(ctx, leagueID, userID)
	if err != nil {
		return false, false, err
	}
	if isMember {
		return false, false, ErrAlreadyMember
	}

	// Get config for join policy
	cfg, err := s.leagues.GetConfig(ctx, leagueID)
	if err != nil {
		return false, false, err
	}

	switch cfg.JoinPolicy {
	case "open":
		err = s.leagues.Join(ctx, leagueID, userID)
		if errors.Is(err, repository.ErrAlreadyMember) {
			return false, false, ErrAlreadyMember
		}
		if err != nil {
			return false, false, err
		}
		return true, false, nil

	case "invite_code":
		if joinCode == "" {
			return false, false, ErrInvalidJoinCode
		}
		err = s.leagues.JoinWithCode(ctx, leagueID, userID, joinCode)
		if errors.Is(err, repository.ErrNotFound) {
			return false, false, ErrInvalidJoinCode
		}
		if errors.Is(err, repository.ErrAlreadyMember) {
			return false, false, ErrAlreadyMember
		}
		if err != nil {
			return false, false, err
		}
		return true, false, nil

	case "approval":
		_, err = s.leagues.CreateJoinRequest(ctx, leagueID, userID)
		if errors.Is(err, repository.ErrConflict) {
			return false, false, ErrPendingRequest
		}
		if err != nil {
			return false, false, err
		}
		return false, true, nil

	default:
		return false, false, fmt.Errorf("%w: unknown join policy", ErrInvalidConfig)
	}
}

func (s *LeagueService) Standings(ctx context.Context, leagueID string) ([]*model.LeagueStanding, error) {
	_, err := s.leagues.GetByID(ctx, leagueID)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, ErrLeagueNotFound
	}
	if err != nil {
		return nil, err
	}

	cfg, err := s.leagues.GetConfig(ctx, leagueID)
	if err != nil && !errors.Is(err, repository.ErrNotFound) {
		return nil, err
	}

	scoringRule := "highest"
	if cfg != nil {
		scoringRule = cfg.ScoringRule
	}

	return s.leagues.Standings(ctx, leagueID, scoringRule)
}

// ---------------------------------------------------------------------------
// League config
// ---------------------------------------------------------------------------

func (s *LeagueService) GetConfig(ctx context.Context, leagueID string) (*model.LeagueConfig, error) {
	cfg, err := s.leagues.GetConfig(ctx, leagueID)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, ErrLeagueNotFound
	}
	return cfg, err
}

func (s *LeagueService) UpdateConfig(ctx context.Context, leagueID, userID string, input *model.UpdateLeagueConfigInput) (*model.LeagueConfig, error) {
	if err := s.requireAdmin(ctx, leagueID, userID); err != nil {
		return nil, err
	}

	if input.ScoringRule != nil && *input.ScoringRule != "highest" && *input.ScoringRule != "average" {
		return nil, fmt.Errorf("%w: scoring_rule must be 'highest' or 'average'", ErrInvalidConfig)
	}
	if input.JoinPolicy != nil && *input.JoinPolicy != "open" && *input.JoinPolicy != "invite_code" && *input.JoinPolicy != "approval" {
		return nil, fmt.Errorf("%w: join_policy must be 'open', 'invite_code', or 'approval'", ErrInvalidConfig)
	}
	if input.MaxSubmissionsPerRound != nil && *input.MaxSubmissionsPerRound < 1 {
		return nil, fmt.Errorf("%w: max_submissions_per_round must be at least 1", ErrInvalidConfig)
	}
	if input.RequiredConfirmations != nil && *input.RequiredConfirmations < 0 {
		return nil, fmt.Errorf("%w: required_confirmations must be >= 0", ErrInvalidConfig)
	}

	cfg, err := s.leagues.UpdateConfig(ctx, leagueID, input)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, ErrLeagueNotFound
	}
	return cfg, err
}

// ---------------------------------------------------------------------------
// Seasons & rounds
// ---------------------------------------------------------------------------

func (s *LeagueService) CreateSeason(ctx context.Context, leagueID, userID string, input *model.CreateSeasonInput) (*model.Season, error) {
	if err := s.requireAdmin(ctx, leagueID, userID); err != nil {
		return nil, err
	}
	if input.Name == "" {
		return nil, fmt.Errorf("%w: name is required", ErrInvalidSeason)
	}
	if input.StartsOn == "" {
		return nil, fmt.Errorf("%w: starts_on is required", ErrInvalidSeason)
	}
	return s.leagues.CreateSeason(ctx, leagueID, input)
}

func (s *LeagueService) ListSeasons(ctx context.Context, leagueID string) ([]*model.Season, error) {
	return s.leagues.ListSeasons(ctx, leagueID)
}

func (s *LeagueService) CreateRound(ctx context.Context, leagueID, userID, seasonID string, input *model.CreateRoundInput) (*model.Round, error) {
	if err := s.requireAdmin(ctx, leagueID, userID); err != nil {
		return nil, err
	}
	if input.Name == "" {
		return nil, fmt.Errorf("%w: name is required", ErrInvalidRound)
	}
	return s.leagues.CreateRound(ctx, seasonID, input)
}

func (s *LeagueService) ListRounds(ctx context.Context, seasonID string) ([]*model.Round, error) {
	return s.leagues.ListRounds(ctx, seasonID)
}

// ---------------------------------------------------------------------------
// Join requests
// ---------------------------------------------------------------------------

func (s *LeagueService) ListJoinRequests(ctx context.Context, leagueID, userID, status string) ([]*model.JoinRequest, error) {
	if err := s.requireAdmin(ctx, leagueID, userID); err != nil {
		return nil, err
	}
	return s.leagues.ListJoinRequests(ctx, leagueID, status)
}

func (s *LeagueService) DecideJoinRequest(ctx context.Context, leagueID, requestID, adminID, decision string) error {
	if err := s.requireAdmin(ctx, leagueID, adminID); err != nil {
		return err
	}
	if decision != "approved" && decision != "rejected" {
		return fmt.Errorf("%w: decision must be 'approved' or 'rejected'", ErrInvalidLeague)
	}
	err := s.leagues.DecideJoinRequest(ctx, requestID, adminID, decision)
	if errors.Is(err, repository.ErrNotFound) {
		return ErrLeagueNotFound
	}
	return err
}

func (s *LeagueService) RegenerateJoinCode(ctx context.Context, leagueID, userID string) (string, error) {
	if err := s.requireAdmin(ctx, leagueID, userID); err != nil {
		return "", err
	}
	return s.leagues.RegenerateJoinCode(ctx, leagueID)
}

// ---------------------------------------------------------------------------
// Image
// ---------------------------------------------------------------------------

func (s *LeagueService) UpdateImageURL(ctx context.Context, leagueID, userID, imageURL string) error {
	if err := s.requireAdmin(ctx, leagueID, userID); err != nil {
		return err
	}
	return s.leagues.UpdateImageURL(ctx, leagueID, imageURL)
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

func (s *LeagueService) ListMembers(ctx context.Context, leagueID string) ([]*model.LeagueMember, error) {
	return s.leagues.ListMembers(ctx, leagueID)
}

// ---------------------------------------------------------------------------
// Score verification
// ---------------------------------------------------------------------------

func (s *LeagueService) ConfirmScore(ctx context.Context, scoreCardID, leagueID, userID string) error {
	// Verify the user is a member of the league
	isMember, err := s.leagues.IsMember(ctx, leagueID, userID)
	if err != nil {
		return err
	}
	if !isMember {
		return ErrNotMember
	}

	// Verify not confirming own score
	ownerID, err := s.leagues.GetScoreCardOwner(ctx, scoreCardID)
	if errors.Is(err, repository.ErrNotFound) {
		return ErrLeagueNotFound
	}
	if err != nil {
		return err
	}
	if ownerID == userID {
		return ErrCannotConfirmOwn
	}

	// Insert confirmation
	_, err = s.leagues.ConfirmScore(ctx, scoreCardID, userID)
	if errors.Is(err, repository.ErrConflict) {
		return ErrAlreadyConfirmed
	}
	if err != nil {
		return err
	}

	// Check if confirmation threshold is met
	cfg, err := s.leagues.GetConfig(ctx, leagueID)
	if err != nil {
		return nil // confirmation recorded, config lookup failed but not critical
	}

	if cfg.RequireScoreVerification && cfg.RequiredConfirmations > 0 {
		count, err := s.leagues.GetConfirmationCount(ctx, scoreCardID)
		if err != nil {
			return nil // confirmation recorded, count check failed but not critical
		}
		if count >= int(cfg.RequiredConfirmations) {
			_ = s.leagues.UpdateScoreVerification(ctx, scoreCardID, "verified")
		}
	}

	return nil
}

func (s *LeagueService) AmendScore(ctx context.Context, scoreCardID, leagueID, adminID string, input *model.AmendScoreInput) error {
	if err := s.requireAdmin(ctx, leagueID, adminID); err != nil {
		return err
	}
	return s.leagues.AmendScore(ctx, scoreCardID, adminID, input)
}

func (s *LeagueService) RejectScore(ctx context.Context, scoreCardID, leagueID, adminID string, input *model.RejectScoreInput) error {
	if err := s.requireAdmin(ctx, leagueID, adminID); err != nil {
		return err
	}
	if input.Reason == "" {
		return ErrReasonRequired
	}
	return s.leagues.RejectScore(ctx, scoreCardID, adminID, input)
}

func (s *LeagueService) GetScoreAuditTrail(ctx context.Context, scoreCardID string) ([]*model.ScoreConfirmation, []*model.ScoreCardAction, error) {
	confs, err := s.leagues.ListConfirmations(ctx, scoreCardID)
	if err != nil {
		return nil, nil, err
	}
	actions, err := s.leagues.ListScoreActions(ctx, scoreCardID)
	if err != nil {
		return nil, nil, err
	}
	return confs, actions, nil
}
