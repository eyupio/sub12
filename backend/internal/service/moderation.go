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
	ErrReportReasonTooLong  = errors.New("report reason is too long")
	ErrReportNotesTooLong   = errors.New("report notes are too long")
	ErrReportAlreadyDecided = errors.New("report already decided")
	ErrReportSelfReport     = errors.New("cannot report yourself")
	ErrReportTargetMissing  = errors.New("report target not found")
	ErrReportNotInScope     = errors.New("report is not in the requested scope")
	ErrReporterNotMember    = errors.New("reporter must be a member of the community")
	ErrReportContextMissing = errors.New("flagging a user requires a league or club context")
)

// Rune-count caps on report free-text (storage-DoS + admin-queue amplification).
// `reports.reason` / `reports.notes` are TEXT columns re-served on every
// moderator queue view, and the 1 MiB JSON body cap alone lets a keen reporter
// keep pushing multi-KB rows at the report rate limit. Runes so multi-byte
// scripts get the same character allowance as ASCII.
const (
	maxReportReasonLen = 2000
	maxReportNotesLen  = 2000
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
	activities    *repository.ActivityRepository
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
	activities *repository.ActivityRepository,
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
		activities:    activities,
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
func (s *ModerationService) CreateReport(ctx context.Context, reporterID, reporterRole string, in *model.CreateReportInput) (*model.Report, error) {
	if !model.IsValidReportTarget(in.TargetType) {
		return nil, ErrReportInvalidTarget
	}
	if strings.TrimSpace(in.Reason) == "" {
		return nil, ErrReportReasonEmpty
	}
	if len([]rune(in.Reason)) > maxReportReasonLen {
		return nil, ErrReportReasonTooLong
	}
	if in.Notes != nil && len([]rune(*in.Notes)) > maxReportNotesLen {
		return nil, ErrReportNotesTooLong
	}
	if in.TargetType == model.ReportTargetUser && in.TargetID == reporterID {
		return nil, ErrReportSelfReport
	}

	leagueID, clubID, err := s.resolveScope(ctx, reporterID, reporterRole, in)
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

// leagueCan / clubCan gate the scoped moderation queues on the content
// moderation capability, which a league or club owner delegates.
func (s *ModerationService) leagueCan(ctx context.Context, leagueID, userID string) error {
	role, err := s.leagues.GetMemberRole(ctx, leagueID, userID)
	if err != nil {
		return err
	}
	if !role.IsModerator {
		return ErrNotAdmin
	}
	if !role.Can(model.PermModerateContent) {
		return ErrNotPermitted
	}
	return nil
}

func (s *ModerationService) clubCan(ctx context.Context, clubID, userID string) error {
	role, err := s.clubs.GetMemberRole(ctx, clubID, userID)
	if err != nil {
		return err
	}
	if !role.IsModerator {
		return ErrNotAdmin
	}
	if !role.Can(model.PermModerateContent) {
		return ErrNotPermitted
	}
	return nil
}

// ListForLeague returns reports scoped to a specific league, gated on the
// caller holding the league's content moderation capability.
func (s *ModerationService) ListForLeague(ctx context.Context, leagueID, adminID, status string, limit int) ([]*model.Report, error) {
	if err := s.leagueCan(ctx, leagueID, adminID); err != nil {
		return nil, err
	}
	return s.reports.List(ctx, status, "league", leagueID, limit)
}

// ListForClub returns reports scoped to a specific club, gated on the caller
// holding the club's content moderation capability.
func (s *ModerationService) ListForClub(ctx context.Context, clubID, adminID, status string, limit int) ([]*model.Report, error) {
	if err := s.clubCan(ctx, clubID, adminID); err != nil {
		return nil, err
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
	if err := s.leagueCan(ctx, leagueID, adminID); err != nil {
		return nil, err
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
	if err := s.clubCan(ctx, clubID, adminID); err != nil {
		return nil, err
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
// Site admins (reporterRole == "admin") bypass the membership requirement so
// they can moderate communities they are not part of.
func (s *ModerationService) resolveScope(ctx context.Context, reporterID, reporterRole string, in *model.CreateReportInput) (*string, *string, error) {
	var leagueID, clubID *string
	var err error

	switch in.TargetType {
	case model.ReportTargetPost:
		leagueID, clubID, err = s.scopeFromPost(ctx, in.TargetID)
	case model.ReportTargetComment:
		leagueID, clubID, err = s.scopeFromComment(ctx, in.TargetID)
	case model.ReportTargetScoreCard:
		leagueID, clubID, err = s.leagues.GetScopeByScoreCardID(ctx, in.TargetID)
	case model.ReportTargetActivity:
		leagueID, clubID, err = s.scopeFromActivity(ctx, in.TargetID)
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

	isAdmin := reporterRole == "admin"

	// Enforce reporter membership in the community they're flagging into.
	// Site admins are exempt — they can moderate any league or club.
	if leagueID != nil && !isAdmin {
		ok, err := s.leagues.IsMember(ctx, *leagueID, reporterID)
		if err != nil {
			return nil, nil, err
		}
		if !ok {
			return nil, nil, ErrReporterNotMember
		}
	}
	if clubID != nil && !isAdmin {
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

// scopeFromActivity resolves the league/club an activity belongs to so reports
// against feed entries notify the right community admins. Activities created
// outside any league/club resolve to platform scope (both nil).
func (s *ModerationService) scopeFromActivity(ctx context.Context, activityID string) (*string, *string, error) {
	if s.activities == nil {
		return nil, nil, nil
	}
	a, err := s.activities.GetByID(ctx, activityID)
	if err != nil {
		return nil, nil, err
	}
	return a.LeagueID, a.ClubID, nil
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
		communityName := "sub12.io"
		reportPath := fmt.Sprintf("/admin/reports#%s", rep.ID)

		if rep.LeagueID != nil {
			if ids, err := s.leagues.ListAdminIDs(ctx, *rep.LeagueID); err == nil {
				addReportRecipients(recipients, ids, "", rep.ReporterID)
			}
			if l, err := s.leagues.GetByID(ctx, *rep.LeagueID); err == nil {
				addReportRecipients(recipients, nil, l.CreatedBy, rep.ReporterID)
				communityName = l.Name
			}
			reportPath = fmt.Sprintf("/leagues/%s/reports#%s", *rep.LeagueID, rep.ID)
		}
		if rep.ClubID != nil {
			if ids, err := s.clubs.ListAdminIDs(ctx, *rep.ClubID); err == nil {
				addReportRecipients(recipients, ids, "", rep.ReporterID)
			}
			if c, err := s.clubs.GetByID(ctx, *rep.ClubID, ""); err == nil {
				addReportRecipients(recipients, nil, c.CreatedBy, rep.ReporterID)
				if rep.LeagueID == nil {
					communityName = c.Name
					reportPath = fmt.Sprintf("/clubs/%s/reports#%s", *rep.ClubID, rep.ID)
				}
			}
		}

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

func addReportRecipients(recipients map[string]struct{}, adminIDs []string, ownerID, excludedID string) {
	for _, id := range adminIDs {
		if id == "" || id == excludedID {
			continue
		}
		recipients[id] = struct{}{}
	}
	if ownerID == "" || ownerID == excludedID {
		return
	}
	recipients[ownerID] = struct{}{}
}

func strPtr(s string) *string { return &s }
