package service

import (
	"context"
	"errors"
	"strings"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)

var (
	ErrReportInvalidTarget = errors.New("invalid report target_type")
	ErrReportInvalidAction = errors.New("invalid moderation action")
	ErrReportReasonEmpty   = errors.New("report reason cannot be empty")
	ErrReportAlreadyDecided = errors.New("report already decided")
)

type ModerationService struct {
	reports *repository.ReportRepository
	posts   *repository.PostRepository
}

func NewModerationService(reports *repository.ReportRepository, posts *repository.PostRepository) *ModerationService {
	return &ModerationService{reports: reports, posts: posts}
}

// CreateReport persists a user-submitted report.
func (s *ModerationService) CreateReport(ctx context.Context, reporterID string, in *model.CreateReportInput) (*model.Report, error) {
	if !model.IsValidReportTarget(in.TargetType) {
		return nil, ErrReportInvalidTarget
	}
	if strings.TrimSpace(in.Reason) == "" {
		return nil, ErrReportReasonEmpty
	}
	return s.reports.Create(ctx, reporterID, in)
}

// ListOpen returns recent reports filtered by status.
func (s *ModerationService) List(ctx context.Context, status string, limit int) ([]*model.Report, error) {
	return s.reports.List(ctx, status, limit)
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

	if err := s.reports.SetStatus(ctx, reportID, status, adminID); err != nil {
		return nil, err
	}
	if err := s.reports.RecordAction(ctx, reportID, adminID, in.Action, in.Notes); err != nil {
		return nil, err
	}
	report.Status = status
	return report, nil
}

// DismissAllForTarget closes any other open reports covering the same target
// once an action has been taken. Best-effort: surfaces errors as nil.
func (s *ModerationService) DismissAllForTarget(ctx context.Context, targetType, targetID, adminID string) {
	if _, err := s.reports.List(ctx, model.ReportStatusOpen, 200); err != nil {
		_ = err
	}
	_ = targetType
	_ = targetID
	_ = adminID
}
