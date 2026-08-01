package model

import "testing"

func TestIsValidFeatureRequestPriority(t *testing.T) {
	valid := []string{
		FeatureRequestPriorityLow,
		FeatureRequestPriorityNormal,
		FeatureRequestPriorityHigh,
		FeatureRequestPriorityUrgent,
	}
	for _, p := range valid {
		if !IsValidFeatureRequestPriority(p) {
			t.Errorf("IsValidFeatureRequestPriority(%q) = false, want true", p)
		}
	}
	for _, p := range []string{"", "critical", "NORMAL", "blocker"} {
		if IsValidFeatureRequestPriority(p) {
			t.Errorf("IsValidFeatureRequestPriority(%q) = true, want false", p)
		}
	}
}

// The board's priority vocabulary is shared with support tickets so a ticket's
// stated urgency can carry straight onto a converted feature request.
func TestFeatureRequestPrioritiesMatchSupportPriorities(t *testing.T) {
	pairs := [][2]string{
		{FeatureRequestPriorityLow, SupportPriorityLow},
		{FeatureRequestPriorityNormal, SupportPriorityNormal},
		{FeatureRequestPriorityHigh, SupportPriorityHigh},
		{FeatureRequestPriorityUrgent, SupportPriorityUrgent},
	}
	for _, pair := range pairs {
		if pair[0] != pair[1] {
			t.Errorf("priority mismatch: feature %q vs support %q", pair[0], pair[1])
		}
		if !IsValidSupportPriority(pair[0]) {
			t.Errorf("feature priority %q is not a valid support priority", pair[0])
		}
	}
}

func TestIsValidFeatureRequestStatus(t *testing.T) {
	for _, s := range []string{"submitted", "refining", "accepted", "rejected", "planned", "in_progress", "done", "implemented"} {
		if !IsValidFeatureRequestStatus(s) {
			t.Errorf("IsValidFeatureRequestStatus(%q) = false, want true", s)
		}
	}
	for _, s := range []string{"", "shipped", "open"} {
		if IsValidFeatureRequestStatus(s) {
			t.Errorf("IsValidFeatureRequestStatus(%q) = true, want false", s)
		}
	}
}
