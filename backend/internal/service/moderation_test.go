package service

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

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
