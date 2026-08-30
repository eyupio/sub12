package service

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

// `reports.reason` / `reports.notes` are TEXT columns re-served on every
// moderator queue view. Without per-field caps an authenticated reporter
// could ship the JSON decoder's whole 1 MiB per POST at the 5/min report
// rate. Validation runs before the repo call, so a nil repo is safe.
func TestModerationService_CreateReport_FreeTextLengthCaps(t *testing.T) {
	svc := &ModerationService{}
	ctx := context.Background()
	bigReason := strings.Repeat("r", maxReportReasonLen+1)
	bigNotes := strings.Repeat("n", maxReportNotesLen+1)

	reasonIn := &model.CreateReportInput{
		TargetType: model.ReportTargetPost,
		TargetID:   "target-1",
		Reason:     bigReason,
	}
	if _, err := svc.CreateReport(ctx, "reporter-1", "user", reasonIn); !errors.Is(err, ErrReportReasonTooLong) {
		t.Fatalf("reason cap: got %v", err)
	}

	notes := bigNotes
	notesIn := &model.CreateReportInput{
		TargetType: model.ReportTargetPost,
		TargetID:   "target-1",
		Reason:     "spam",
		Notes:      &notes,
	}
	if _, err := svc.CreateReport(ctx, "reporter-1", "user", notesIn); !errors.Is(err, ErrReportNotesTooLong) {
		t.Fatalf("notes cap: got %v", err)
	}
}

func TestIsValidReportTargetIncludesActivity(t *testing.T) {
	assert.True(t, model.IsValidReportTarget(model.ReportTargetActivity))
	assert.True(t, model.IsValidReportTarget(model.ReportTargetPost))
	assert.True(t, model.IsValidReportTarget(model.ReportTargetComment))
	assert.True(t, model.IsValidReportTarget(model.ReportTargetUser))
	assert.True(t, model.IsValidReportTarget(model.ReportTargetScoreCard))
	assert.False(t, model.IsValidReportTarget("nonsense"))
}

func TestAddReportRecipientsIncludesOwnerWhenNotAdmin(t *testing.T) {
	recipients := map[string]struct{}{}

	addReportRecipients(recipients, []string{"admin-1", "admin-2"}, "owner-1", "reporter-1")

	assert.Contains(t, recipients, "admin-1")
	assert.Contains(t, recipients, "admin-2")
	assert.Contains(t, recipients, "owner-1")
}

func TestAddReportRecipientsExcludesReporterAndDeduplicatesOwner(t *testing.T) {
	recipients := map[string]struct{}{}

	addReportRecipients(recipients, []string{"admin-1", "reporter-1", "owner-1"}, "owner-1", "reporter-1")

	assert.Len(t, recipients, 2)
	assert.Contains(t, recipients, "admin-1")
	assert.Contains(t, recipients, "owner-1")
	assert.NotContains(t, recipients, "reporter-1")
}

func TestTargetLabelFor(t *testing.T) {
	cases := map[string]string{
		"post":       "a post",
		"comment":    "a comment",
		"score_card": "a score card",
		"user":       "a user",
		"garbage":    "content",
	}
	for in, want := range cases {
		assert.Equal(t, want, targetLabelFor(in), "targetLabelFor(%q)", in)
	}
}
