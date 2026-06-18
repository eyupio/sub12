package handler

import (
	"net/http/httptest"
	"testing"
)

// parsePagination is the bounds gate that ten list endpoints now share
// (notifications, user search, event invitees, feature requests, support
// tickets, reports, pellet test list, public leaderboard, …). It must clamp
// the caller-supplied ?limit= to [1, maxLimit] regardless of how absurd the
// request is — an unauthenticated attacker hitting the public-leaderboard
// endpoint with ?limit=999999999 would otherwise stream the whole table.
func TestParsePagination_LimitClampAndOffset(t *testing.T) {
	cases := []struct {
		name       string
		query      string
		defLimit   int
		maxLimit   int
		wantLimit  int
		wantOffset int
	}{
		{"no params -> defaults", "", 20, 100, 20, 0},
		{"limit above max -> clamped", "limit=999999999", 50, 100, 100, 0},
		{"limit zero -> default (helper rejects n<=0)", "limit=0", 50, 100, 50, 0},
		{"limit negative -> default", "limit=-10", 50, 100, 50, 0},
		{"limit non-numeric -> default", "limit=abc", 50, 100, 50, 0},
		{"limit in range -> echoed", "limit=37", 50, 100, 37, 0},
		{"limit exactly max -> echoed", "limit=100", 50, 100, 100, 0},
		{"offset honoured", "limit=10&offset=42", 20, 100, 10, 42},
		{"offset negative -> 0", "limit=10&offset=-5", 20, 100, 10, 0},
		{"offset non-numeric -> 0", "limit=10&offset=foo", 20, 100, 10, 0},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest("GET", "/x?"+tc.query, nil)
			l, o := parsePagination(r, tc.defLimit, tc.maxLimit)
			if l != tc.wantLimit {
				t.Errorf("limit = %d, want %d", l, tc.wantLimit)
			}
			if o != tc.wantOffset {
				t.Errorf("offset = %d, want %d", o, tc.wantOffset)
			}
		})
	}
}
