package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

type ReportRepository struct {
	db *pgxpool.Pool
}

func NewReportRepository(db *pgxpool.Pool) *ReportRepository {
	return &ReportRepository{db: db}
}

// Create persists a new report in status=open. leagueID and clubID are
// optional scope values resolved by the service layer before calling this.
func (r *ReportRepository) Create(ctx context.Context, reporterID string, in *model.CreateReportInput, leagueID, clubID *string) (*model.Report, error) {
	report := &model.Report{}
	err := r.db.QueryRow(ctx, `
		INSERT INTO reports (reporter_id, target_type, target_id, reason, notes, status, league_id, club_id)
		VALUES ($1, $2, $3, $4, $5, 'open', $6, $7)
		RETURNING id, reporter_id, target_type, target_id, reason, notes, status, league_id, club_id, decided_by, decided_at, created_at
	`, reporterID, in.TargetType, in.TargetID, in.Reason, in.Notes, leagueID, clubID).Scan(
		&report.ID, &report.ReporterID, &report.TargetType, &report.TargetID,
		&report.Reason, &report.Notes, &report.Status,
		&report.LeagueID, &report.ClubID,
		&report.DecidedBy, &report.DecidedAt, &report.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("insert report: %w", err)
	}
	return report, nil
}

// GetByID returns a single report.
func (r *ReportRepository) GetByID(ctx context.Context, id string) (*model.Report, error) {
	report := &model.Report{}
	err := r.db.QueryRow(ctx, `
		SELECT id, reporter_id, target_type, target_id, reason, notes, status, league_id, club_id, decided_by, decided_at, created_at
		FROM reports WHERE id = $1
	`, id).Scan(
		&report.ID, &report.ReporterID, &report.TargetType, &report.TargetID,
		&report.Reason, &report.Notes, &report.Status,
		&report.LeagueID, &report.ClubID,
		&report.DecidedBy, &report.DecidedAt, &report.CreatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get report: %w", err)
	}
	return report, nil
}

// List returns reports filtered by status, newest first.
// scope selects which slice of reports to return:
//   - "platform"  → reports with no league_id and no club_id
//   - "league"    → reports scoped to the given scopeID (league_id)
//   - "club"      → reports scoped to the given scopeID (club_id)
//   - ""          → no scope filter (admin-wide view)
func (r *ReportRepository) List(ctx context.Context, status, scope, scopeID string, limit int) ([]*model.Report, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	query := `
		SELECT id, reporter_id, target_type, target_id, reason, notes, status, league_id, club_id, decided_by, decided_at, created_at
		FROM reports
	`
	args := []any{}
	where := []string{}
	if status != "" {
		args = append(args, status)
		where = append(where, fmt.Sprintf("status = $%d", len(args)))
	}
	switch scope {
	case "platform":
		where = append(where, "league_id IS NULL AND club_id IS NULL")
	case "league":
		args = append(args, scopeID)
		where = append(where, fmt.Sprintf("league_id = $%d", len(args)))
	case "club":
		args = append(args, scopeID)
		where = append(where, fmt.Sprintf("club_id = $%d", len(args)))
	}
	if len(where) > 0 {
		query += " WHERE " + joinAnd(where)
	}
	args = append(args, limit)
	query += fmt.Sprintf(" ORDER BY created_at DESC LIMIT $%d", len(args))

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list reports: %w", err)
	}
	defer rows.Close()

	var items []*model.Report
	for rows.Next() {
		report := &model.Report{}
		if err := rows.Scan(
			&report.ID, &report.ReporterID, &report.TargetType, &report.TargetID,
			&report.Reason, &report.Notes, &report.Status,
			&report.LeagueID, &report.ClubID,
			&report.DecidedBy, &report.DecidedAt, &report.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan report: %w", err)
		}
		items = append(items, report)
	}
	if items == nil {
		items = []*model.Report{}
	}
	return items, nil
}

func joinAnd(parts []string) string {
	out := ""
	for i, p := range parts {
		if i > 0 {
			out += " AND "
		}
		out += p
	}
	return out
}

// SetStatus flips a report's status and records the deciding admin.
func (r *ReportRepository) SetStatus(ctx context.Context, id, status, adminID string) error {
	tag, err := r.db.Exec(ctx, `
		UPDATE reports SET status = $2, decided_by = $3, decided_at = NOW()
		WHERE id = $1
	`, id, status, adminID)
	if err != nil {
		return fmt.Errorf("set report status: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// RecordAction appends a row to content_moderation_actions for the audit trail.
func (r *ReportRepository) RecordAction(ctx context.Context, reportID, adminID, action string, notes *string) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO content_moderation_actions (report_id, admin_id, action, notes)
		VALUES ($1, $2, $3, $4)
	`, reportID, adminID, action, notes)
	if err != nil {
		return fmt.Errorf("record moderation action: %w", err)
	}
	return nil
}

// SetCommentHidden toggles the hidden_at flag on a comment.
func (r *ReportRepository) SetCommentHidden(ctx context.Context, commentID string, hidden bool) error {
	var query string
	if hidden {
		query = `UPDATE comments SET hidden_at = NOW() WHERE id = $1`
	} else {
		query = `UPDATE comments SET hidden_at = NULL WHERE id = $1`
	}
	tag, err := r.db.Exec(ctx, query, commentID)
	if err != nil {
		return fmt.Errorf("set comment hidden: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
