package service

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/rs/zerolog"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)

var (
	ErrReportInvalidTarget  = errors.New("invalid report target_type")
	ErrReportInvalidAction  = errors.New("invalid moderation action")
	ErrReportReasonEmpty    = errors.New("report reason cannot be empty")
	ErrReportAlreadyDecided = errors.New("report already decided")
	ErrReportSelfReport     = errors.New("cannot report yourself")
	ErrReportTargetMissing  = errors.New("report target not found")
	ErrReportNotInScope     = errors.New("report is not in the requested scope")
	ErrReporterNotMember    = errors.New("reporter must be a member of the community")
	ErrReportContextMissing = errors.New("flagging a user requires a league or club context")
)

// ModerationService coordinates user-submitted reports and admin decisions.
//
// Reports can be scoped to a league or a club by resolving the target (post,
// comment, score_card, user) to its parent community. Fan-out then sends an
// in-app notification (and an optional email) to that community's admins so
// they can triage. When the target has no scope, the report surfaces only on
// the platform-admin queue.
type ModerationService struct {
	reports       *repository.ReportRepository
	posts         *repository.PostRepository
	comments      *repository.CommentRepository
	leagues       *repository.LeagueRepository
	clubs         *repository.ClubRepository
	users         *repository.UserRepository
	notifications *NotificationService
	emailSender   *EmailSenderService
	webOrigin     string
	log           zerolog.Logger
}

func NewModerationService(
	reports *repository.ReportRepository,
	posts *repository.PostRepository,
	comments *repository.CommentRepository,
	leagues *repository.LeagueRepository,
	clubs *repository.ClubRepository,
	users *repository.UserRepository,
	notifications *NotificationService,
	emailSender *EmailSenderService,
	webOrigin string,
	log zerolog.Logger,
) *ModerationService {
	return &ModerationService{
		reports:       reports,
		posts:         posts,
		comments:      comments,
		leagues:       leagues,
		clubs:         clubs,
		users:         users,
		notifications: notifications,
		emailSender:   emailSender,
		webOrigin:     strings.TrimRight(webOrigin, "/"),
		log:           log,
	}
}

// CreateReport persists a user-submitted report, resolves its community
// scope, and fans out notifications to the relevant admins.
func (s *ModerationService) CreateReport(ctx context.Context, reporterID string, in *model.CreateReportInput) (*model.Report, error) {
	if !model.IsValidReportTarget(in.TargetType) {
		return nil, ErrReportInvalidTarget
	}
	if strings.TrimSpace(in.Reason) == "" {
		return nil, ErrReportReasonEmpty
	}
	if in.TargetType == model.ReportTargetUser && in.TargetID == reporterID {
		return nil, ErrReportSelfReport
	}

	leagueID, clubID, err := s.resolveScope(ctx, reporterID, in)
	if err != nil {
		return nil, err
	}

	report, err := s.reports.Create(ctx, reporterID, in, leagueID, clubID)
	if err != nil {
		return nil, err
	}

	s.fanout(report)
	return report, nil
}

// ListPlatform returns reports with no community scope (the existing platform
// moderation queue).
func (s *ModerationService) ListPlatform(ctx context.Context, status string, limit int) ([]*model.Report, error) {
	return s.reports.List(ctx, status, "platform", "", limit)
}

// ListAll returns reports with no scope filter (platform admin wide view).
func (s *ModerationService) ListAll(ctx context.Context, status string, limit int) ([]*model.Report, error) {
	return s.reports.List(ctx, status, "", "", limit)
}

// ListForLeague returns reports scoped to a specific league, gated on the
// caller being an admin of that league.
func (s *ModerationService) ListForLeague(ctx context.Context, leagueID, adminID, status string, limit int) ([]*model.Report, error) {
	admin, err := s.leagues.IsAdmin(ctx, leagueID, adminID)
	if err != nil {
		return nil, err
	}
	if !admin {
		return nil, ErrNotAdmin
	}
	return s.reports.List(ctx, status, "league", leagueID, limit)
}

// ListForClub returns reports scoped to a specific club, gated on the caller
// being an admin of that club.
func (s *ModerationService) ListForClub(ctx context.Context, clubID, adminID, status string, limit int) ([]*model.Report, error) {
	admin, err := s.clubs.IsAdmin(ctx, clubID, adminID)
	if err != nil {
		return nil, err
	}
	if !admin {
		return nil, ErrNotAdmin
	}
	return s.reports.List(ctx, status, "club", clubID, limit)
}

// Decide applies a moderator decision, updating the report row, writing the
// audit trail, and optionally hiding the target post/comment.
func (s *ModerationService) Decide(ctx context.Context, reportID, adminID string, in *model.DecideReportInput) (*model.Report, error) {
	if !model.IsValidModerationAction(in.Action) {
		return nil, ErrReportInvalidAction
	}
	report, err := s.reports.GetByID(ctx, reportID)
	if err != nil {
		return nil, err
	}
	if report.Status != model.ReportStatusOpen {
		return nil, ErrReportAlreadyDecided
	}
	return s.applyDecision(ctx, report, adminID, in)
}

// DecideForLeague is Decide with an additional check that the report is
// scoped to the given league.
func (s *ModerationService) DecideForLeague(ctx context.Context, leagueID, reportID, adminID string, in *model.DecideReportInput) (*model.Report, error) {
	admin, err := s.leagues.IsAdmin(ctx, leagueID, adminID)
	if err != nil {
		return nil, err
	}
	if !admin {
		return nil, ErrNotAdmin
	}
	if !model.IsValidModerationAction(in.Action) {
		return nil, ErrReportInvalidAction
	}
	report, err := s.reports.GetByID(ctx, reportID)
	if err != nil {
		return nil, err
	}
	if report.LeagueID == nil || *report.LeagueID != leagueID {
		return nil, ErrReportNotInScope
	}
	if report.Status != model.ReportStatusOpen {
		return nil, ErrReportAlreadyDecided
	}
	return s.applyDecision(ctx, report, adminID, in)
}

// DecideForClub is Decide with an additional check that the report is scoped
// to the given club.
func (s *ModerationService) DecideForClub(ctx context.Context, clubID, reportID, adminID string, in *model.DecideReportInput) (*model.Report, error) {
	admin, err := s.clubs.IsAdmin(ctx, clubID, adminID)
	if err != nil {
		return nil, err
	}
	if !admin {
		return nil, ErrNotAdmin
	}
	if !model.IsValidModerationAction(in.Action) {
		return nil, ErrReportInvalidAction
	}
	report, err := s.reports.GetByID(ctx, reportID)
	if err != nil {
		return nil, err
	}
	if report.ClubID == nil || *report.ClubID != clubID {
		return nil, ErrReportNotInScope
	}
	if report.Status != model.ReportStatusOpen {
		return nil, ErrReportAlreadyDecided
	}
	return s.applyDecision(ctx, report, adminID, in)
}

func (s *ModerationService) applyDecision(ctx context.Context, report *model.Report, adminID string, in *model.DecideReportInput) (*model.Report, error) {
	status := model.ReportStatusActioned
	if in.Action == model.ModerationActionNoAction {
		status = model.ReportStatusDismissed
	}

	if in.Action == model.ModerationActionHide {
		switch report.TargetType {
		case model.ReportTargetPost:
			if err := s.posts.SetHidden(ctx, report.TargetID, true); err != nil {
				return nil, err
			}
		case model.ReportTargetComment:
			if err := s.reports.SetCommentHidden(ctx, report.TargetID, true); err != nil {
				return nil, err
			}
		}
	}

	if err := s.reports.SetStatus(ctx, report.ID, status, adminID); err != nil {
		return nil, err
	}
	if err := s.reports.RecordAction(ctx, report.ID, adminID, in.Action, in.Notes); err != nil {
		return nil, err
	}
	report.Status = status
	return report, nil
}

// resolveScope derives the league/club the report belongs to based on the
// target, and (for leagues/clubs) enforces that the reporter is a member.
func (s *ModerationService) resolveScope(ctx context.Context, reporterID string, in *model.CreateReportInput) (*string, *string, error) {
	var leagueID, clubID *string
	var err error

	switch in.TargetType {
	case model.ReportTargetPost:
		leagueID, clubID, err = s.scopeFromPost(ctx, in.TargetID)
	case model.ReportTargetComment:
		leagueID, clubID, err = s.scopeFromComment(ctx, in.TargetID)
	case model.ReportTargetScoreCard:
		leagueID, clubID, err = s.leagues.GetScopeByScoreCardID(ctx, in.TargetID)
	case model.ReportTargetUser:
		leagueID, clubID = in.ContextLeagueID, in.ContextClubID
		if leagueID == nil && clubID == nil {
			return nil, nil, ErrReportContextMissing
		}
	}
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, nil, ErrReportTargetMissing
		}
		return nil, nil, err
	}

	// If the league has a club parent, attach it too so club admins are
	// notified even if the target only resolved a league.
	if leagueID != nil && clubID == nil {
		if parent, err := s.leagues.GetClubIDByLeagueID(ctx, *leagueID); err == nil {
			clubID = parent
		}
	}

	// Enforce reporter membership in the community they're flagging into.
	if leagueID != nil {
		ok, err := s.leagues.IsMember(ctx, *leagueID, reporterID)
		if err != nil {
			return nil, nil, err
		}
		if !ok {
			return nil, nil, ErrReporterNotMember
		}
	}
	if clubID != nil {
		ok, err := s.clubs.IsMember(ctx, *clubID, reporterID)
		if err != nil {
			return nil, nil, err
		}
		if !ok && leagueID == nil {
			// For club-only scope, the reporter must be a club member.
			return nil, nil, ErrReporterNotMember
		}
		// When the league membership check passed but the reporter is not a
		// club member, we keep leagueID but drop clubID so we don't leak
		// reports to admins of a club the reporter cannot actually see.
		if !ok {
			clubID = nil
		}
	}

	return leagueID, clubID, nil
}

func (s *ModerationService) scopeFromPost(ctx context.Context, postID string) (*string, *string, error) {
	p, err := s.posts.GetByID(ctx, postID, nil)
	if err != nil {
		return nil, nil, err
	}
	return p.LeagueID, p.ClubID, nil
}

func (s *ModerationService) scopeFromComment(ctx context.Context, commentID string) (*string, *string, error) {
	c, err := s.comments.GetByID(ctx, commentID)
	if err != nil {
		return nil, nil, err
	}
	switch c.TargetType {
	case "post":
		return s.scopeFromPost(ctx, c.TargetID)
	case "score_card":
		return s.leagues.GetScopeByScoreCardID(ctx, c.TargetID)
	}
	return nil, nil, nil
}

// fanout dispatches notifications (and optional emails) to the admins of the
// community the report is scoped to. Fire-and-forget so any failure does not
// block the user-facing report submission.
func (s *ModerationService) fanout(report *model.Report) {
	if s.notifications == nil {
		return
	}
	go func(rep model.Report) {
		ctx := context.Background()
		recipients := map[string]struct{}{}
		communityName := "Sub-12"
		reportPath := fmt.Sprintf("/admin/reports#%s", rep.ID)

		if rep.LeagueID != nil {
			if ids, err := s.leagues.ListAdminIDs(ctx, *rep.LeagueID); err == nil {
				for _, id := range ids {
					recipients[id] = struct{}{}
				}
			}
			if l, err := s.leagues.GetByID(ctx, *rep.LeagueID); err == nil {
				communityName = l.Name
			}
			reportPath = fmt.Sprintf("/leagues/%s/reports#%s", *rep.LeagueID, rep.ID)
		}
		if rep.ClubID != nil {
			if ids, err := s.clubs.ListAdminIDs(ctx, *rep.ClubID); err == nil {
				for _, id := range ids {
					recipients[id] = struct{}{}
				}
			}
			if c, err := s.clubs.GetByID(ctx, *rep.ClubID, ""); err == nil && rep.LeagueID == nil {
				communityName = c.Name
				reportPath = fmt.Sprintf("/clubs/%s/reports#%s", *rep.ClubID, rep.ID)
			}
		}
		// Drop the reporter themselves.
		delete(recipients, rep.ReporterID)

		if len(recipients) == 0 {
			return
		}

		targetLabel := targetLabelFor(rep.TargetType)
		reportLink := s.webOrigin + reportPath

		for rid := range recipients {
			s.notifications.Fanout(ctx, NotifEvent{
				RecipientID: rid,
				ActorID:     rep.ReporterID,
				Type:        model.NotificationTypeReportFiled,
				TargetID:    strPtr(rep.ID),
				TargetType:  strPtr("report"),
				LeagueID:    rep.LeagueID,
				ClubID:      rep.ClubID,
				Metadata: map[string]any{
					"reason":         rep.Reason,
					"target_type":    rep.TargetType,
					"target_label":   targetLabel,
					"community_name": communityName,
				},
			})

			if s.emailSender == nil || s.users == nil {
				continue
			}
			u, err := s.users.GetByID(ctx, rid)
			if err != nil {
				continue
			}
			prefs, err := s.notifications.GetPreferences(ctx, rid)
			if err != nil || prefs == nil || !prefs.DigestEmail {
				continue
			}
			if err := s.emailSender.SendReportFiledNotification(ctx, u.Email, u.DisplayName, communityName, targetLabel, rep.Reason, reportLink); err != nil {
				s.log.Warn().Err(err).Str("report_id", rep.ID).Str("recipient_id", rid).Msg("send report_filed email failed")
			}
		}
	}(*report)
}

func targetLabelFor(t string) string {
	switch t {
	case model.ReportTargetPost:
		return "a post"
	case model.ReportTargetComment:
		return "a comment"
	case model.ReportTargetScoreCard:
		return "a score card"
	case model.ReportTargetUser:
		return "a user"
	}
	return "content"
}

func strPtr(s string) *string { return &s }
