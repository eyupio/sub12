package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/rs/zerolog/log"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)

var (
	ErrLeagueNotFound = errors.New("league not found")
	ErrAlreadyMember  = errors.New("already a member of this league")
	ErrInvalidLeague  = errors.New("invalid league")
	ErrNotAdmin       = errors.New("league moderator access required")
	// ErrNotPermitted is returned when the caller is a moderator but the owner
	// did not delegate the capability the action needs. It wraps ErrNotAdmin so
	// every caller that already refuses non-moderators refuses this too.
	ErrNotPermitted = fmt.Errorf("%w: the owner has not delegated this capability to you", ErrNotAdmin)
	// ErrCannotEditOwner guards the one role nobody may reassign.
	ErrCannotEditOwner = fmt.Errorf("%w: the owner's role cannot be changed", ErrNotAdmin)
	// ErrNotModerator is returned when a capability grant targets somebody who
	// has not been promoted.
	ErrNotModerator  = errors.New("that member is not a moderator")
	ErrNotMember     = errors.New("not a league member")
	ErrInvalidConfig = errors.New("invalid league config")
	ErrInvalidSeason = errors.New("invalid season")
	ErrInvalidRound  = errors.New("invalid round")
	// ErrSeasonInUse and ErrRoundInUse refuse a delete that would quietly strip
	// submitted cards out of the league — score_cards.league_round_id is
	// ON DELETE SET NULL, so the cards would survive but the standings would
	// not. Archiving the season is the way to retire one that has been shot.
	ErrSeasonInUse      = errors.New("this season has cards submitted to it; archive it instead of deleting it")
	ErrRoundInUse       = errors.New("this round has cards submitted to it and cannot be deleted")
	ErrSeasonNotFound   = errors.New("season not found")
	ErrRoundNotFound    = errors.New("round not found")
	ErrInvalidJoinCode  = errors.New("invalid join code")
	ErrPendingRequest   = errors.New("join request already pending")
	ErrAlreadyConfirmed = errors.New("already confirmed this score")
	ErrCannotConfirmOwn = errors.New("cannot confirm your own score")
	ErrReasonRequired   = errors.New("reason is required for rejection")
	ErrNotClubMember    = errors.New("club membership required")
	ErrLeagueLastAdmin  = errors.New("cannot leave as the last moderator; promote another member first")
	ErrLeagueOnlyAdmin  = errors.New("cannot demote the last moderator; promote another member first")
	ErrUnauthenticated  = errors.New("authentication required")
	ErrInvalidAmend     = errors.New("invalid amendment")

	ErrVerificationDisabled = errors.New("this league does not use peer verification")
	ErrScoreRejected        = errors.New("this score has been rejected by a moderator")
	ErrScoreNotRejected     = errors.New("only a rejected score can be reopened")
	ErrScoreNotPending      = errors.New("only a pending score can be verified")
	ErrScoreIsDraft         = errors.New("draft cards cannot be actioned")
	ErrInvalidScoreFilter   = errors.New("verification filter must be pending, verified, or rejected")
)

type LeagueService struct {
	leagues       *repository.LeagueRepository
	clubs         *repository.ClubRepository
	activity      *ActivityService     // nil disables feed ingestion
	notifications *NotificationService // nil disables notification fan-out
}

func NewLeagueService(leagues *repository.LeagueRepository, clubs *repository.ClubRepository, activity *ActivityService) *LeagueService {
	return &LeagueService{leagues: leagues, clubs: clubs, activity: activity}
}

// SetNotifications wires notification fan-out for verification outcomes.
// Optional — nil disables it.
func (s *LeagueService) SetNotifications(n *NotificationService) {
	s.notifications = n
}

// notifyScoreOutcome tells the card owner about a verification outcome
// (verified / rejected / amended). Best-effort; Fanout never returns errors.
func (s *LeagueService) notifyScoreOutcome(ctx context.Context, scoreCardID, actorID, notifType string, metadata map[string]any) {
	if s.notifications == nil {
		return
	}
	ownerID, _, err := s.leagues.GetScoreCardOwner(ctx, scoreCardID)
	if err != nil {
		return
	}
	var leagueID *string
	if league, err := s.leagues.GetLeagueByScoreCardID(ctx, scoreCardID); err == nil {
		leagueID = &league.ID
	}
	tid, tt := scoreCardID, "score_card"
	s.notifications.Fanout(ctx, NotifEvent{
		RecipientID: ownerID,
		ActorID:     actorID,
		Type:        notifType,
		TargetID:    &tid,
		TargetType:  &tt,
		LeagueID:    leagueID,
		Metadata:    metadata,
	})
}

// leagueName resolves a league's display name for notification copy. Empty on
// any lookup failure — the copy falls back to "your league" rather than
// dropping the notification.
func (s *LeagueService) leagueName(ctx context.Context, leagueID string) string {
	league, err := s.leagues.GetByID(ctx, leagueID)
	if err != nil || league == nil {
		return ""
	}
	return league.Name
}

// notifyLeagueModerators fans an event out to everyone who runs the league —
// the moderators and the owner, who holds every capability implicitly and so
// is not necessarily carried in league_members.is_admin.
func (s *LeagueService) notifyLeagueModerators(ctx context.Context, leagueID, actorID, notifType string, metadata map[string]any) {
	if s.notifications == nil {
		return
	}
	recipients := map[string]struct{}{}
	if ids, err := s.leagues.ListAdminIDs(ctx, leagueID); err == nil {
		for _, id := range ids {
			recipients[id] = struct{}{}
		}
	}
	if league, err := s.leagues.GetByID(ctx, leagueID); err == nil && league != nil {
		recipients[league.CreatedBy] = struct{}{}
	}
	delete(recipients, actorID)
	lid, tt := leagueID, "league"
	for rid := range recipients {
		s.notifications.Fanout(ctx, NotifEvent{
			RecipientID: rid,
			ActorID:     actorID,
			Type:        notifType,
			TargetID:    &lid,
			TargetType:  &tt,
			LeagueID:    &lid,
			Metadata:    metadata,
		})
	}
}

// notifyLeagueMembers fans an event out to the whole roster, minus the actor.
// One row per member is too much work to keep the caller waiting on, so it runs
// on a background context — the request that triggered it is long gone by the
// time a large league finishes.
func (s *LeagueService) notifyLeagueMembers(leagueID, actorID, notifType string, metadata map[string]any) {
	if s.notifications == nil {
		return
	}
	go func() {
		defer func() {
			if r := recover(); r != nil {
				log.Error().Interface("panic", r).Str("type", notifType).Msg("league: notification fan-out panicked")
			}
		}()
		ctx := context.Background()
		members, err := s.leagues.ListMembers(ctx, leagueID)
		if err != nil {
			return
		}
		lid, tt := leagueID, "league"
		for _, m := range members {
			if m.UserID == actorID {
				continue
			}
			s.notifications.Fanout(ctx, NotifEvent{
				RecipientID: m.UserID,
				ActorID:     actorID,
				Type:        notifType,
				TargetID:    &lid,
				TargetType:  &tt,
				LeagueID:    &lid,
				Metadata:    metadata,
			})
		}
	}()
}

// notifyLeagueMember tells one member about something addressed to them.
func (s *LeagueService) notifyLeagueMember(ctx context.Context, leagueID, actorID, recipientID, notifType string, metadata map[string]any) {
	if s.notifications == nil {
		return
	}
	lid, tt := leagueID, "league"
	s.notifications.Fanout(ctx, NotifEvent{
		RecipientID: recipientID,
		ActorID:     actorID,
		Type:        notifType,
		TargetID:    &lid,
		TargetType:  &tt,
		LeagueID:    &lid,
		Metadata:    metadata,
	})
}

// GetMemberRole reports the caller's standing in a league — owner, moderator
// or plain member — together with the capabilities the owner delegated.
func (s *LeagueService) GetMemberRole(ctx context.Context, leagueID, userID string) (*model.MemberRole, error) {
	return s.leagues.GetMemberRole(ctx, leagueID, userID)
}

// IsModerator reports whether the user runs the league, without regard to
// which capabilities they hold.
func (s *LeagueService) IsModerator(ctx context.Context, leagueID, userID string) (bool, error) {
	return s.leagues.IsModerator(ctx, leagueID, userID)
}

// Can reports whether the user may exercise one delegated capability. Owners
// always can.
func (s *LeagueService) Can(ctx context.Context, leagueID, userID, permission string) (bool, error) {
	role, err := s.leagues.GetMemberRole(ctx, leagueID, userID)
	if err != nil {
		return false, err
	}
	return role.Can(permission), nil
}

// require gates an action on a delegated capability. A non-moderator is told
// they are not a moderator; a moderator missing the grant is told the owner
// did not delegate it, so the two cases stay distinguishable in the UI.
func (s *LeagueService) require(ctx context.Context, leagueID, userID, permission string) error {
	role, err := s.leagues.GetMemberRole(ctx, leagueID, userID)
	if err != nil {
		return err
	}
	if !role.IsModerator {
		return ErrNotAdmin
	}
	if !role.Can(permission) {
		return ErrNotPermitted
	}
	return nil
}

// requireForScoreCard is require() for actions addressed by score card rather
// than by league, resolving the owning league in the same query.
func (s *LeagueService) requireForScoreCard(ctx context.Context, scoreCardID, userID, permission string) error {
	role, _, err := s.leagues.GetMemberRoleForScoreCard(ctx, scoreCardID, userID)
	if errors.Is(err, repository.ErrNotFound) {
		return ErrLeagueNotFound
	}
	if err != nil {
		return err
	}
	if !role.IsModerator {
		return ErrNotAdmin
	}
	if !role.Can(permission) {
		return ErrNotPermitted
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
	if input.ScoringRule != nil && *input.ScoringRule != "highest" && *input.ScoringRule != "average" {
		return nil, fmt.Errorf("%w: scoring_rule must be 'highest' or 'average'", ErrInvalidLeague)
	}
	if input.JoinPolicy != nil && !model.IsValidJoinPolicy(*input.JoinPolicy) {
		return nil, fmt.Errorf("%w: join_policy must be 'open', 'invite_code', or 'approval'", ErrInvalidLeague)
	}
	// If creating under a club, the caller needs the club's league capability.
	if input.ClubID != nil && *input.ClubID != "" {
		role, err := s.clubs.GetMemberRole(ctx, *input.ClubID, userID)
		if err != nil {
			return nil, err
		}
		if !role.Can(model.PermManageLeagues) {
			return nil, fmt.Errorf("%w: you cannot create leagues under this club", ErrNotAdmin)
		}
		// Club leagues default to private
		if input.Type == "" {
			input.Type = "private"
		}
	}
	return s.leagues.Create(ctx, userID, input)
}

// ListByClub returns leagues hosted by a given club.
func (s *LeagueService) ListByClub(ctx context.Context, clubID string) ([]*model.League, error) {
	return s.leagues.ListByClub(ctx, clubID)
}

// RemoveMember removes a plain member from a league. Requires the member
// management capability.
func (s *LeagueService) RemoveMember(ctx context.Context, leagueID, adminID, memberID string) error {
	if adminID == memberID {
		return fmt.Errorf("%w: cannot remove yourself", ErrNotAdmin)
	}
	if err := s.require(ctx, leagueID, adminID, model.PermManageMembers); err != nil {
		return err
	}
	return s.leagues.RemoveMember(ctx, leagueID, memberID)
}

// UpdateMemberRole promotes a member to moderator, demotes one, and/or
// re-grants what a moderator may do. Requires the moderator-management
// capability, which the owner holds implicitly.
//
// The owner's own role is not editable — they are the league's root of
// authority — and the last remaining moderator cannot be demoted, or the
// league would be left with nobody able to run it.
func (s *LeagueService) UpdateMemberRole(ctx context.Context, leagueID, requesterID, targetID string, in *model.UpdateLeagueMemberInput) error {
	if err := s.require(ctx, leagueID, requesterID, model.PermManageModerators); err != nil {
		return err
	}
	targetRole, err := s.leagues.GetMemberRole(ctx, leagueID, targetID)
	if err != nil {
		return err
	}
	if targetRole.IsOwner {
		return ErrCannotEditOwner
	}

	moderator := in.Moderator()
	demoting := moderator != nil && !*moderator
	if demoting {
		err := s.leagues.DemoteMemberGuarded(ctx, leagueID, targetID)
		if errors.Is(err, repository.ErrLeagueLastAdmin) {
			return ErrLeagueOnlyAdmin
		}
		if errors.Is(err, repository.ErrNotFound) {
			return ErrNotMember
		}
		if err != nil {
			return err
		}
		s.notifyLeagueMember(ctx, leagueID, requesterID, targetID, model.NotificationTypeLeagueRoleChanged, map[string]any{
			"league_name":  s.leagueName(ctx, leagueID),
			"is_moderator": false,
		})
		return nil
	}

	// Promotion, or a re-grant on somebody already promoted. Either way the
	// grant is whatever was asked for, defaulting to the day-to-day set on a
	// fresh promotion and to the existing grant on a bare re-promotion.
	permissions := targetRole.Permissions
	if !targetRole.IsModerator {
		permissions = model.DefaultModeratorPermissions(model.LeagueModeratorPermissions)
	}
	if in.Permissions != nil {
		permissions, err = s.delegatable(ctx, leagueID, requesterID, *in.Permissions)
		if err != nil {
			return err
		}
	}

	if moderator == nil && !targetRole.IsModerator {
		// A grant with nothing to grant it to.
		return ErrNotModerator
	}
	err = s.leagues.PromoteMember(ctx, leagueID, targetID, permissions)
	if errors.Is(err, repository.ErrNotFound) {
		return ErrNotMember
	}
	if err != nil {
		return err
	}
	// A bare re-grant on somebody already running the league is not a role
	// change; only the promotion itself is worth telling them about.
	if !targetRole.IsModerator {
		s.notifyLeagueMember(ctx, leagueID, requesterID, targetID, model.NotificationTypeLeagueRoleChanged, map[string]any{
			"league_name":  s.leagueName(ctx, leagueID),
			"is_moderator": true,
		})
	}
	return nil
}

// delegatable narrows a requested grant to the recognised capabilities the
// granter holds themselves, so a moderator with manage_moderators can share
// their own reach but never manufacture more of it. Owners hold everything, so
// for them this only filters unknown keys.
func (s *LeagueService) delegatable(ctx context.Context, leagueID, granterID string, requested []string) ([]string, error) {
	granter, err := s.leagues.GetMemberRole(ctx, leagueID, granterID)
	if err != nil {
		return nil, err
	}
	wanted := model.NormaliseModeratorPermissions(model.LeagueModeratorPermissions, requested)
	out := make([]string, 0, len(wanted))
	for _, p := range wanted {
		if granter.Can(p) {
			out = append(out, p)
		}
	}
	return out, nil
}

// LeaveLeague allows a member to remove themselves. The last moderator must
// promote another member first.
func (s *LeagueService) LeaveLeague(ctx context.Context, leagueID, userID string) error {
	isMember, err := s.leagues.IsMember(ctx, leagueID, userID)
	if err != nil {
		return err
	}
	if !isMember {
		return ErrNotMember
	}
	isModerator, err := s.leagues.IsModerator(ctx, leagueID, userID)
	if err != nil {
		return err
	}
	if isModerator {
		count, err := s.leagues.CountAdmins(ctx, leagueID)
		if err != nil {
			return err
		}
		if count <= 1 {
			return ErrLeagueLastAdmin
		}
	}
	return s.leagues.LeaveLeague(ctx, leagueID, userID)
}

// ListMyLeagues returns leagues the user is a member of, with their rank in each.
func (s *LeagueService) ListMyLeagues(ctx context.Context, userID string) ([]*model.MyLeagueSummary, error) {
	leagues, err := s.leagues.ListByUser(ctx, userID)
	if err != nil {
		return nil, err
	}
	if len(leagues) == 0 {
		return leagues, nil
	}

	ids := make([]string, len(leagues))
	for i, l := range leagues {
		ids[i] = l.ID
	}
	ranks, err := s.leagues.GetUserRanksForLeagues(ctx, userID, ids)
	if err != nil {
		// Leave ranks as 0 (unknown) but surface the error in logs so
		// intermittent DB failures do not silently degrade the UI.
		log.Warn().Err(err).Str("user_id", userID).Msg("ListMyLeagues: rank lookup failed")
		return leagues, nil
	}
	for _, l := range leagues {
		if r, ok := ranks[l.ID]; ok {
			l.UserRank = r
		}
	}
	return leagues, nil
}

func (s *LeagueService) GetByID(ctx context.Context, id, viewerID, viewerRole string) (*model.League, error) {
	league, err := s.leagues.GetByID(ctx, id)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, ErrLeagueNotFound
	}
	if err != nil {
		return nil, err
	}

	isAdmin := viewerRole == "admin"

	// Club-scoped leagues require club membership; site admins bypass.
	if league.ClubID != nil && *league.ClubID != "" {
		if isAdmin {
			return league, nil
		}
		if viewerID == "" {
			return nil, ErrUnauthenticated
		}
		isClubMember, err := s.clubs.IsMember(ctx, *league.ClubID, viewerID)
		if err != nil {
			return nil, err
		}
		if !isClubMember {
			return nil, ErrLeagueNotFound
		}
		return league, nil
	}

	// Non-club private leagues require league membership to view; site admins bypass.
	if league.Type == "private" && !isAdmin {
		if viewerID == "" {
			return nil, ErrUnauthenticated
		}
		isMember, err := s.leagues.IsMember(ctx, id, viewerID)
		if err != nil {
			return nil, err
		}
		if !isMember {
			return nil, ErrLeagueNotFound
		}
	}
	return league, nil
}

func (s *LeagueService) ListPublic(ctx context.Context) ([]*model.League, error) {
	return s.leagues.ListPublic(ctx)
}

// LookupByJoinCode resolves a league from a join code (case-insensitive,
// whitespace-trimmed). An empty/blank code returns (nil, nil). When no league
// matches, returns (nil, nil) so callers can render an empty result without
// special-casing not-found.
func (s *LeagueService) LookupByJoinCode(ctx context.Context, code string) (*model.League, error) {
	code = strings.TrimSpace(code)
	if code == "" {
		return nil, nil
	}
	league, err := s.leagues.GetByJoinCode(ctx, code)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return league, nil
}

// Join handles joining a league respecting the join policy.
// Returns (joined, pending, err).
func (s *LeagueService) Join(ctx context.Context, leagueID, userID, joinCode string) (bool, bool, error) {
	// Verify league exists
	league, err := s.leagues.GetByID(ctx, leagueID)
	if errors.Is(err, repository.ErrNotFound) {
		return false, false, ErrLeagueNotFound
	}
	if err != nil {
		return false, false, err
	}

	// Club leagues require club membership to join
	if league.ClubID != nil && *league.ClubID != "" {
		isClubMember, err := s.clubs.IsMember(ctx, *league.ClubID, userID)
		if err != nil {
			return false, false, err
		}
		if !isClubMember {
			return false, false, ErrNotClubMember
		}
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
		if s.activity != nil {
			lid, tt := leagueID, "league"
			go s.activity.Ingest(context.Background(), userID, model.ActivityJoinedLeague, &lid, &tt, nil, &lid, nil, "public")
		}
		return true, false, nil

	case "invite_code":
		joinCode = strings.TrimSpace(joinCode)
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
		if s.activity != nil {
			lid, tt := leagueID, "league"
			go s.activity.Ingest(context.Background(), userID, model.ActivityJoinedLeague, &lid, &tt, nil, &lid, nil, "public")
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
		s.notifyLeagueModerators(ctx, leagueID, userID, model.NotificationTypeLeagueJoinRequest, map[string]any{
			"league_name": league.Name,
		})
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
	if err := s.require(ctx, leagueID, userID, model.PermManageSettings); err != nil {
		return nil, err
	}

	if input.ScoringRule != nil && *input.ScoringRule != "highest" && *input.ScoringRule != "average" {
		return nil, fmt.Errorf("%w: scoring_rule must be 'highest' or 'average'", ErrInvalidConfig)
	}
	if input.JoinPolicy != nil && !model.IsValidJoinPolicy(*input.JoinPolicy) {
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
	if err != nil {
		return nil, err
	}

	// A league running without verification must not strand cards in
	// 'pending' — nothing else could ever flip them, and the standings only
	// count verified cards. Release any backlog whenever the config lands in
	// (or stays in) the verification-off state.
	if !cfg.RequireScoreVerification {
		if n, relErr := s.leagues.VerifyPendingForLeague(ctx, leagueID); relErr != nil {
			log.Warn().Err(relErr).Str("league_id", leagueID).Msg("league: release pending cards after config change failed")
		} else if n > 0 {
			log.Info().Int64("cards", n).Str("league_id", leagueID).Msg("league: auto-verified pending cards after verification disabled")
		}
	}
	return cfg, nil
}

// ---------------------------------------------------------------------------
// Seasons & rounds
// ---------------------------------------------------------------------------

// validateSeasonWindow checks a season's resolved dates. Shared by create and
// update so a patch that moves only one end of the window is judged against
// the value already stored at the other end.
func validateSeasonWindow(startsOn string, endsOn *string) error {
	if startsOn == "" {
		return fmt.Errorf("%w: starts_on is required", ErrInvalidSeason)
	}
	if endsOn == nil || *endsOn == "" {
		return nil
	}
	start, errStart := time.Parse("2006-01-02", startsOn)
	end, errEnd := time.Parse("2006-01-02", *endsOn)
	if errStart == nil && errEnd == nil && end.Before(start) {
		return fmt.Errorf("%w: ends_on must be on or after starts_on", ErrInvalidSeason)
	}
	return nil
}

// roundTimeLayouts covers both spellings a round window arrives in: RFC3339
// from the client, and PostgreSQL's own rendering when one end of the window
// is the value already stored (a patch that moves only the other end).
var roundTimeLayouts = []string{
	time.RFC3339,
	"2006-01-02 15:04:05.999999-07",
	"2006-01-02 15:04:05.999999-07:00",
}

func parseRoundTime(value string) (time.Time, bool) {
	for _, layout := range roundTimeLayouts {
		if t, err := time.Parse(layout, value); err == nil {
			return t, true
		}
	}
	return time.Time{}, false
}

// validateRoundWindow is validateSeasonWindow for a round's open/close pair.
// Either end may be absent — a round with no dates is permanently open.
func validateRoundWindow(opensAt, closesAt *string) error {
	if opensAt == nil || *opensAt == "" || closesAt == nil || *closesAt == "" {
		return nil
	}
	opens, okOpens := parseRoundTime(*opensAt)
	closes, okCloses := parseRoundTime(*closesAt)
	if okOpens && okCloses && closes.Before(opens) {
		return fmt.Errorf("%w: closes_at must be on or after opens_at", ErrInvalidRound)
	}
	return nil
}

func (s *LeagueService) CreateSeason(ctx context.Context, leagueID, userID string, input *model.CreateSeasonInput) (*model.Season, error) {
	if err := s.require(ctx, leagueID, userID, model.PermManageSeasons); err != nil {
		return nil, err
	}
	if input.Name == "" {
		return nil, fmt.Errorf("%w: name is required", ErrInvalidSeason)
	}
	if err := validateSeasonWindow(input.StartsOn, input.EndsOn); err != nil {
		return nil, err
	}
	season, err := s.leagues.CreateSeason(ctx, leagueID, input)
	if err != nil {
		return nil, err
	}
	if s.activity != nil {
		league, _ := s.leagues.GetByID(ctx, leagueID)
		leagueName := ""
		if league != nil {
			leagueName = league.Name
		}
		tid, tt := season.ID, "season"
		meta := model.LeagueSeasonStartedMeta{LeagueName: leagueName, SeasonName: season.Name}
		go s.activity.Ingest(context.Background(), userID, model.ActivityLeagueSeasonStarted, &tid, &tt, meta, &leagueID, nil, "public")
	}
	return season, nil
}

// ListSeasons returns a league's seasons. Access mirrors the league itself, so
// season names of a private or club league are not readable by outsiders.
func (s *LeagueService) ListSeasons(ctx context.Context, leagueID, viewerID, viewerRole string) ([]*model.Season, error) {
	if _, err := s.GetByID(ctx, leagueID, viewerID, viewerRole); err != nil {
		return nil, err
	}
	return s.leagues.ListSeasons(ctx, leagueID)
}

// season resolves a season and confirms it belongs to the path league. A
// season of another league is reported as missing rather than forbidden: the
// caller is a moderator here, and telling them a stranger's season exists is
// not theirs to know.
func (s *LeagueService) season(ctx context.Context, leagueID, seasonID string) (*model.Season, error) {
	current, err := s.leagues.GetSeason(ctx, seasonID)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, ErrSeasonNotFound
	}
	if err != nil {
		return nil, err
	}
	if current.LeagueID != leagueID {
		return nil, ErrSeasonNotFound
	}
	return current, nil
}

// UpdateSeason renames, re-dates, archives or restores a season.
func (s *LeagueService) UpdateSeason(ctx context.Context, leagueID, userID, seasonID string, input *model.UpdateSeasonInput) (*model.Season, error) {
	if err := s.require(ctx, leagueID, userID, model.PermManageSeasons); err != nil {
		return nil, err
	}
	current, err := s.season(ctx, leagueID, seasonID)
	if err != nil {
		return nil, err
	}
	if input.Name != nil && *input.Name == "" {
		return nil, fmt.Errorf("%w: name is required", ErrInvalidSeason)
	}
	startsOn := current.StartsOn
	if input.StartsOn != nil {
		startsOn = *input.StartsOn
	}
	endsOn := current.EndsOn
	if input.EndsOn != nil {
		endsOn = input.EndsOn
	}
	if err := validateSeasonWindow(startsOn, endsOn); err != nil {
		return nil, err
	}
	season, err := s.leagues.UpdateSeason(ctx, seasonID, input)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, ErrSeasonNotFound
	}
	return season, err
}

// DeleteSeason removes an unused season and its rounds. A season anybody has
// shot is refused — archiving keeps the history the standings are built from.
func (s *LeagueService) DeleteSeason(ctx context.Context, leagueID, userID, seasonID string) error {
	if err := s.require(ctx, leagueID, userID, model.PermManageSeasons); err != nil {
		return err
	}
	if _, err := s.season(ctx, leagueID, seasonID); err != nil {
		return err
	}
	cards, err := s.leagues.CountSeasonCards(ctx, seasonID)
	if err != nil {
		return err
	}
	if cards > 0 {
		return ErrSeasonInUse
	}
	if err := s.leagues.DeleteSeason(ctx, seasonID); errors.Is(err, repository.ErrNotFound) {
		return ErrSeasonNotFound
	} else if err != nil {
		return err
	}
	return nil
}

func (s *LeagueService) CreateRound(ctx context.Context, leagueID, userID, seasonID string, input *model.CreateRoundInput) (*model.Round, error) {
	if err := s.require(ctx, leagueID, userID, model.PermManageSeasons); err != nil {
		return nil, err
	}
	if input.Name == "" {
		return nil, fmt.Errorf("%w: name is required", ErrInvalidRound)
	}
	if err := validateRoundWindow(input.OpensAt, input.ClosesAt); err != nil {
		return nil, err
	}
	// The admin check above is scoped to the path league; make sure the season
	// actually belongs to it, or an admin of any league could attach rounds to
	// another league's season.
	belongs, err := s.leagues.SeasonBelongsToLeague(ctx, seasonID, leagueID)
	if err != nil {
		return nil, err
	}
	if !belongs {
		return nil, fmt.Errorf("%w: season does not belong to this league", ErrInvalidSeason)
	}
	round, err := s.leagues.CreateRound(ctx, seasonID, input)
	if err != nil {
		return nil, err
	}
	leagueName := s.leagueName(ctx, leagueID)
	if s.activity != nil {
		tid, tt := round.ID, "round"
		meta := model.LeagueRoundOpenedMeta{LeagueName: leagueName, RoundName: round.Name}
		go s.activity.Ingest(context.Background(), userID, model.ActivityLeagueRoundOpened, &tid, &tt, meta, &leagueID, nil, "public")
	}
	s.notifyLeagueMembers(leagueID, userID, model.NotificationTypeLeagueRoundOpened, map[string]any{
		"league_name": leagueName,
		"round_name":  round.Name,
	})
	return round, nil
}

// round resolves a round and confirms it belongs to the path league, for the
// same reason season() does.
func (s *LeagueService) round(ctx context.Context, leagueID, roundID string) (*model.Round, error) {
	belongs, err := s.leagues.RoundBelongsToLeague(ctx, roundID, leagueID)
	if err != nil {
		return nil, err
	}
	if !belongs {
		return nil, ErrRoundNotFound
	}
	current, err := s.leagues.GetRound(ctx, roundID)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, ErrRoundNotFound
	}
	return current, err
}

// UpdateRound renames a round or moves its open/close window — which is how a
// round is closed early, held open longer, or made permanently open again.
func (s *LeagueService) UpdateRound(ctx context.Context, leagueID, userID, roundID string, input *model.UpdateRoundInput) (*model.Round, error) {
	if err := s.require(ctx, leagueID, userID, model.PermManageSeasons); err != nil {
		return nil, err
	}
	current, err := s.round(ctx, leagueID, roundID)
	if err != nil {
		return nil, err
	}
	if input.Name != nil && *input.Name == "" {
		return nil, fmt.Errorf("%w: name is required", ErrInvalidRound)
	}
	opensAt := current.OpensAt
	if input.OpensAt != nil {
		opensAt = input.OpensAt
	}
	closesAt := current.ClosesAt
	if input.ClosesAt != nil {
		closesAt = input.ClosesAt
	}
	if err := validateRoundWindow(opensAt, closesAt); err != nil {
		return nil, err
	}
	round, err := s.leagues.UpdateRound(ctx, roundID, input)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, ErrRoundNotFound
	}
	return round, err
}

// DeleteRound removes a round nobody has submitted to. One that has cards in
// it is refused — closing it takes it out of use without detaching them.
func (s *LeagueService) DeleteRound(ctx context.Context, leagueID, userID, roundID string) error {
	if err := s.require(ctx, leagueID, userID, model.PermManageSeasons); err != nil {
		return err
	}
	if _, err := s.round(ctx, leagueID, roundID); err != nil {
		return err
	}
	cards, err := s.leagues.CountRoundCards(ctx, roundID)
	if err != nil {
		return err
	}
	if cards > 0 {
		return ErrRoundInUse
	}
	if err := s.leagues.DeleteRound(ctx, roundID); errors.Is(err, repository.ErrNotFound) {
		return ErrRoundNotFound
	} else if err != nil {
		return err
	}
	return nil
}

// ListRounds returns a season's rounds, gated on access to the parent league.
func (s *LeagueService) ListRounds(ctx context.Context, leagueID, seasonID, viewerID, viewerRole string) ([]*model.Round, error) {
	if _, err := s.GetByID(ctx, leagueID, viewerID, viewerRole); err != nil {
		return nil, err
	}
	return s.leagues.ListRounds(ctx, seasonID)
}

// EnsureDefaultRound guarantees that the league has at least one round,
// lazily creating a default season+round if none exists. Any league member
// may call this so that submitting a score does not require admin help to
// bootstrap an empty league.
func (s *LeagueService) EnsureDefaultRound(ctx context.Context, leagueID, userID string) (*model.ActiveRound, error) {
	_, err := s.leagues.GetByID(ctx, leagueID)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, ErrLeagueNotFound
	}
	if err != nil {
		return nil, err
	}
	isMember, err := s.leagues.IsMember(ctx, leagueID, userID)
	if err != nil {
		return nil, err
	}
	if !isMember {
		return nil, ErrNotMember
	}
	return s.leagues.GetOrCreateDefaultRound(ctx, leagueID)
}

// ListScores returns score cards submitted to a league, newest first.
// When verification is non-empty, results are filtered by that status.
// Non-members only see verified cards — the moderation queue (pending and
// rejected submissions) is league business, not a public surface.
func (s *LeagueService) ListScores(ctx context.Context, leagueID, viewerID string, limit, offset int, verification string) ([]*model.LeagueScore, error) {
	switch verification {
	case "", "pending", "verified", "rejected":
	default:
		return nil, ErrInvalidScoreFilter
	}
	_, err := s.leagues.GetByID(ctx, leagueID)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, ErrLeagueNotFound
	}
	if err != nil {
		return nil, err
	}
	member := false
	if viewerID != "" {
		member, err = s.leagues.IsMember(ctx, leagueID, viewerID)
		if err != nil {
			return nil, err
		}
	}
	if !member {
		verification = "verified"
	}
	return s.leagues.ListScores(ctx, leagueID, limit, offset, verification)
}

// CountScores returns the per-verification-status tally of submitted cards.
// Non-members only learn the verified count; pending/rejected tallies are
// zeroed for them.
func (s *LeagueService) CountScores(ctx context.Context, leagueID, viewerID string) (*model.LeagueScoreCounts, error) {
	_, err := s.leagues.GetByID(ctx, leagueID)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, ErrLeagueNotFound
	}
	if err != nil {
		return nil, err
	}
	counts, err := s.leagues.CountScores(ctx, leagueID)
	if err != nil {
		return nil, err
	}
	member := false
	if viewerID != "" {
		member, err = s.leagues.IsMember(ctx, leagueID, viewerID)
		if err != nil {
			return nil, err
		}
	}
	if !member {
		counts.All = counts.Verified
		counts.Pending = 0
		counts.Rejected = 0
	}
	return counts, nil
}

// GetLeagueForScoreCard resolves the league that a score card belongs to.
func (s *LeagueService) GetLeagueForScoreCard(ctx context.Context, scoreCardID string) (*model.ScoreCardLeague, error) {
	league, err := s.leagues.GetLeagueByScoreCardID(ctx, scoreCardID)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, ErrLeagueNotFound
	}
	return league, err
}

// ---------------------------------------------------------------------------
// Join requests
// ---------------------------------------------------------------------------

func (s *LeagueService) ListJoinRequests(ctx context.Context, leagueID, userID, status string) ([]*model.JoinRequest, error) {
	if err := s.require(ctx, leagueID, userID, model.PermManageMembers); err != nil {
		return nil, err
	}
	return s.leagues.ListJoinRequests(ctx, leagueID, status)
}

func (s *LeagueService) DecideJoinRequest(ctx context.Context, leagueID, requestID, adminID, decision string) error {
	if err := s.require(ctx, leagueID, adminID, model.PermManageMembers); err != nil {
		return err
	}
	if decision != "approved" && decision != "rejected" {
		return fmt.Errorf("%w: decision must be 'approved' or 'rejected'", ErrInvalidLeague)
	}
	requesterID, err := s.leagues.DecideJoinRequest(ctx, leagueID, requestID, adminID, decision)
	if errors.Is(err, repository.ErrNotFound) {
		return ErrLeagueNotFound
	}
	if err != nil {
		return err
	}
	meta := map[string]any{"league_name": s.leagueName(ctx, leagueID)}
	if decision == "approved" {
		s.notifyLeagueMember(ctx, leagueID, adminID, requesterID, model.NotificationTypeLeagueJoinApproved, meta)
	} else {
		s.notifyLeagueMember(ctx, leagueID, adminID, requesterID, model.NotificationTypeLeagueJoinRejected, meta)
	}
	return nil
}

func (s *LeagueService) RegenerateJoinCode(ctx context.Context, leagueID, userID string) (string, error) {
	if err := s.require(ctx, leagueID, userID, model.PermManageSettings); err != nil {
		return "", err
	}
	return s.leagues.RegenerateJoinCode(ctx, leagueID)
}

// UpdateLeague applies a partial update to owner-editable league fields.
// Requires the caller to be a league admin.
func (s *LeagueService) UpdateLeague(ctx context.Context, leagueID, userID string, in *model.UpdateLeagueBasicsInput) (*model.League, error) {
	if err := s.require(ctx, leagueID, userID, model.PermManageSettings); err != nil {
		return nil, err
	}
	if in.Name != nil {
		trimmed := strings.TrimSpace(*in.Name)
		if trimmed == "" {
			return nil, fmt.Errorf("%w: name cannot be blank", ErrInvalidLeague)
		}
		in.Name = &trimmed
	}
	if in.Type != nil && *in.Type != "public" && *in.Type != "private" {
		return nil, fmt.Errorf("%w: type must be 'public' or 'private'", ErrInvalidLeague)
	}
	if in.PostVisibility != nil && *in.PostVisibility != "members" && *in.PostVisibility != "public" {
		return nil, fmt.Errorf("%w: post_visibility must be 'members' or 'public'", ErrInvalidLeague)
	}
	if in.DateFormat != nil && !IsValidDateFormat(*in.DateFormat) {
		return nil, fmt.Errorf("%w: date_format must be one of %s", ErrInvalidLeague, validDateFormatsList())
	}
	if in.TimeFormat != nil && !IsValidTimeFormat(*in.TimeFormat) {
		return nil, fmt.Errorf("%w: time_format must be '24h' or '12h'", ErrInvalidLeague)
	}
	if in.Timezone != nil && !IsValidTimezone(*in.Timezone) {
		return nil, fmt.Errorf("%w: timezone must be a valid IANA name", ErrInvalidLeague)
	}
	l, err := s.leagues.UpdateBasics(ctx, leagueID, in)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, ErrLeagueNotFound
	}
	return l, err
}

// ---------------------------------------------------------------------------
// Image
// ---------------------------------------------------------------------------

func (s *LeagueService) UpdateImageURL(ctx context.Context, leagueID, userID, imageURL string) error {
	if err := s.require(ctx, leagueID, userID, model.PermManageSettings); err != nil {
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

// ListMembersForViewer is ListMembers with the delegation map redacted for
// anyone who does not help run the league. Who the moderators are is public;
// which capabilities each was granted is the owner's business.
func (s *LeagueService) ListMembersForViewer(ctx context.Context, leagueID, viewerID string) ([]*model.LeagueMember, error) {
	members, err := s.leagues.ListMembers(ctx, leagueID)
	if err != nil {
		return nil, err
	}
	isModerator, err := s.leagues.IsModerator(ctx, leagueID, viewerID)
	if err != nil {
		return nil, err
	}
	if !isModerator {
		for _, m := range members {
			m.Permissions = nil
		}
	}
	return members, nil
}

// ---------------------------------------------------------------------------
// Score verification
// ---------------------------------------------------------------------------

func (s *LeagueService) ConfirmScore(ctx context.Context, scoreCardID, userID string) error {
	// Resolve the league from the score card
	league, err := s.leagues.GetLeagueByScoreCardID(ctx, scoreCardID)
	if errors.Is(err, repository.ErrNotFound) {
		return ErrLeagueNotFound
	}
	if err != nil {
		return err
	}

	// Verify the user is a member of the league
	isMember, err := s.leagues.IsMember(ctx, league.ID, userID)
	if err != nil {
		return err
	}
	if !isMember {
		return ErrNotMember
	}

	// Peer confirmation is only meaningful where the league asked for it —
	// otherwise it records endorsements that can never verify anything.
	cfg, err := s.leagues.GetConfig(ctx, league.ID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrLeagueNotFound
		}
		return err
	}
	if !cfg.RequireScoreVerification {
		return ErrVerificationDisabled
	}

	ownerID, verification, err := s.leagues.GetScoreCardOwner(ctx, scoreCardID)
	if errors.Is(err, repository.ErrNotFound) {
		return ErrLeagueNotFound
	}
	if err != nil {
		return err
	}
	if ownerID == userID {
		return ErrCannotConfirmOwn
	}
	// An admin has already ruled on a rejected card. Confirmations must not
	// accumulate against it, or the threshold check below would quietly
	// overturn the rejection.
	if verification == "rejected" {
		return ErrScoreRejected
	}

	// Insert confirmation
	_, err = s.leagues.ConfirmScore(ctx, scoreCardID, userID)
	if errors.Is(err, repository.ErrConflict) {
		return ErrAlreadyConfirmed
	}
	if err != nil {
		return err
	}

	// Check if confirmation threshold is met. The confirmation row is already
	// persisted; surface lookup failures so the caller knows auto-verification
	// did not run (a retry is safe — the unique constraint dedupes).
	// A configured threshold of 0 counts as 1: verification is enabled, so a
	// single confirmation must be able to verify — otherwise confirmations
	// accumulate forever with no path to the standings.
	required := int(cfg.RequiredConfirmations)
	if required < 1 {
		required = 1
	}
	count, err := s.leagues.GetConfirmationCount(ctx, scoreCardID)
	if err != nil {
		return err
	}
	if count >= required {
		// Guarded so a rejection landing between the read above and this
		// write is not overwritten.
		verified, err := s.leagues.VerifyIfPending(ctx, scoreCardID)
		if err != nil {
			return err
		}
		if verified {
			s.notifyScoreOutcome(ctx, scoreCardID, userID, model.NotificationTypeScoreVerified, nil)
		}
	}

	return nil
}

// VerifyScore lets a league admin explicitly verify a pending card without
// having to route through an amend. Records a 'verify' audit action.
func (s *LeagueService) VerifyScore(ctx context.Context, scoreCardID, adminID string, input *model.VerifyScoreInput) error {
	if err := s.requireForScoreCard(ctx, scoreCardID, adminID, model.PermVerifyScores); err != nil {
		return err
	}
	var reason *string
	if input != nil {
		reason = input.Reason
	}
	err := s.leagues.VerifyScore(ctx, scoreCardID, adminID, reason)
	if errors.Is(err, repository.ErrNotFound) {
		return ErrScoreNotPending
	}
	if err != nil {
		return err
	}
	s.notifyScoreOutcome(ctx, scoreCardID, adminID, model.NotificationTypeScoreVerified, nil)
	return nil
}

// ReopenScore returns a rejected card to the pending queue. League admins only.
func (s *LeagueService) ReopenScore(ctx context.Context, scoreCardID, adminID string, input *model.ReopenScoreInput) error {
	if err := s.requireForScoreCard(ctx, scoreCardID, adminID, model.PermVerifyScores); err != nil {
		return err
	}
	err := s.leagues.ReopenScore(ctx, scoreCardID, adminID, input.Reason)
	if errors.Is(err, repository.ErrNotFound) {
		return ErrScoreNotRejected
	}
	return err
}

func (s *LeagueService) AmendScore(ctx context.Context, scoreCardID, adminID string, input *model.AmendScoreInput) error {
	if input.NewTotalScore < 0 || input.NewTotalScore > 250 {
		return fmt.Errorf("%w: new_total_score must be 0-250", ErrInvalidAmend)
	}
	if input.NewXCount < 0 || input.NewXCount > 25 {
		return fmt.Errorf("%w: new_x_count must be 0-25", ErrInvalidAmend)
	}

	if err := s.requireForScoreCard(ctx, scoreCardID, adminID, model.PermVerifyScores); err != nil {
		return err
	}
	err := s.leagues.AmendScore(ctx, scoreCardID, adminID, input)
	if errors.Is(err, repository.ErrCardRejected) {
		return ErrScoreRejected
	}
	if errors.Is(err, repository.ErrCardDraft) {
		return ErrScoreIsDraft
	}
	if err != nil {
		return err
	}
	s.notifyScoreOutcome(ctx, scoreCardID, adminID, model.NotificationTypeScoreAmended, map[string]any{
		"new_total_score": input.NewTotalScore,
		"new_x_count":     input.NewXCount,
	})
	return nil
}

func (s *LeagueService) RejectScore(ctx context.Context, scoreCardID, adminID string, input *model.RejectScoreInput) error {
	if err := s.requireForScoreCard(ctx, scoreCardID, adminID, model.PermVerifyScores); err != nil {
		return err
	}
	input.Reason = strings.TrimSpace(input.Reason)
	if input.Reason == "" {
		return ErrReasonRequired
	}
	err := s.leagues.RejectScore(ctx, scoreCardID, adminID, input)
	if errors.Is(err, repository.ErrCardRejected) {
		return ErrScoreRejected
	}
	if errors.Is(err, repository.ErrCardDraft) {
		return ErrScoreIsDraft
	}
	if err != nil {
		return err
	}
	s.notifyScoreOutcome(ctx, scoreCardID, adminID, model.NotificationTypeScoreRejected, map[string]any{
		"reason": input.Reason,
	})
	return nil
}

func (s *LeagueService) GetScoreAuditTrail(ctx context.Context, scoreCardID, userID string) ([]*model.ScoreConfirmation, []*model.ScoreCardAction, error) {
	league, err := s.leagues.GetLeagueByScoreCardID(ctx, scoreCardID)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, nil, ErrLeagueNotFound
	}
	if err != nil {
		return nil, nil, err
	}
	isMember, err := s.leagues.IsMember(ctx, league.ID, userID)
	if err != nil {
		return nil, nil, err
	}
	if !isMember {
		// The card's owner can always read why their own card was actioned,
		// even after leaving (or being removed from) the league.
		ownerID, _, ownerErr := s.leagues.GetScoreCardOwner(ctx, scoreCardID)
		if ownerErr != nil || ownerID != userID {
			return nil, nil, ErrNotMember
		}
	}

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

// AdminGetByID returns a league by ID without privacy checks (for admin use).
func (s *LeagueService) AdminGetByID(ctx context.Context, id string) (*model.League, error) {
	league, err := s.leagues.GetByID(ctx, id)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, ErrLeagueNotFound
	}
	return league, err
}

// AdminListLeagues returns all leagues regardless of type.
func (s *LeagueService) AdminListLeagues(ctx context.Context) ([]*model.League, error) {
	return s.leagues.ListAll(ctx)
}

// AdminUpdateLeague applies a partial update to any league without ownership checks.
func (s *LeagueService) AdminUpdateLeague(ctx context.Context, id string, in *model.UpdateLeagueInput) (*model.League, error) {
	if in.Name != nil && strings.TrimSpace(*in.Name) == "" {
		return nil, fmt.Errorf("%w: name cannot be blank", ErrInvalidLeague)
	}
	l, err := s.leagues.AdminUpdate(ctx, id, in)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, ErrLeagueNotFound
	}
	return l, err
}

// AdminDeleteLeague removes a league without ownership checks.
func (s *LeagueService) AdminDeleteLeague(ctx context.Context, id string) error {
	err := s.leagues.AdminDelete(ctx, id)
	if errors.Is(err, repository.ErrNotFound) {
		return ErrLeagueNotFound
	}
	return err
}

// AdminRemoveMember removes a league member without checking league admin status.
func (s *LeagueService) AdminRemoveMember(ctx context.Context, leagueID, userID string) error {
	return s.leagues.AdminRemoveMember(ctx, leagueID, userID)
}

// AdminAddMember adds a user to a league directly, bypassing the join policy.
// Used to enrol simulated accounts so they can interact with league content.
// Already-a-member is treated as success (idempotent).
func (s *LeagueService) AdminAddMember(ctx context.Context, leagueID, userID string) error {
	if err := s.leagues.Join(ctx, leagueID, userID); err != nil {
		if errors.Is(err, repository.ErrAlreadyMember) {
			return nil
		}
		if errors.Is(err, repository.ErrNotFound) {
			return ErrLeagueNotFound
		}
		return err
	}
	return nil
}

// SummaryByID returns a minimal public summary of a league regardless of
// visibility so the UI can render a members-only banner with a join CTA
// without leaking members, standings or posts.
func (s *LeagueService) SummaryByID(ctx context.Context, id string) (*model.LeagueSummary, error) {
	league, err := s.leagues.GetByID(ctx, id)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, ErrLeagueNotFound
	}
	if err != nil {
		return nil, err
	}
	summary := &model.LeagueSummary{
		ID:             league.ID,
		Name:           league.Name,
		Description:    league.Description,
		ImageURL:       league.ImageURL,
		Type:           league.Type,
		JoinPolicy:     "open",
		PostVisibility: league.PostVisibility,
		MemberCount:    league.MemberCount,
		ClubID:         league.ClubID,
	}
	if cfg, err := s.leagues.GetConfig(ctx, id); err == nil && cfg != nil {
		summary.JoinPolicy = cfg.JoinPolicy
	}
	return summary, nil
}
