package service

import (
	"context"
	"errors"
	"testing"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

// newTestLeagueService returns a LeagueService with nil repositories.
// Only safe to call for code paths that return before any repository access.
func newTestLeagueService() *LeagueService {
	return &LeagueService{}
}

// --- Create: input validation ---

func TestCreate_RejectsEmptyName(t *testing.T) {
	svc := newTestLeagueService()
	_, err := svc.Create(context.Background(), "user-1", &model.CreateLeagueInput{Name: ""})
	if !errors.Is(err, ErrInvalidLeague) {
		t.Fatalf("expected ErrInvalidLeague for empty name, got %v", err)
	}
}

// League type must be "public", "private", or omitted — anything else is rejected.
func TestCreate_RejectsInvalidType(t *testing.T) {
	for _, bad := range []string{"secret", "PUBLIC", "Private", "members-only"} {
		svc := newTestLeagueService()
		_, err := svc.Create(context.Background(), "user-1", &model.CreateLeagueInput{
			Name: "League",
			Type: bad,
		})
		if !errors.Is(err, ErrInvalidLeague) {
			t.Errorf("type %q: expected ErrInvalidLeague, got %v", bad, err)
		}
	}
}

// scoring_rule must be "highest" or "average" — case-sensitive; other values are rejected.
func TestCreate_RejectsInvalidScoringRule(t *testing.T) {
	for _, bad := range []string{"median", "max", "Highest", "AVERAGE", "sum"} {
		rule := bad
		svc := newTestLeagueService()
		_, err := svc.Create(context.Background(), "user-1", &model.CreateLeagueInput{
			Name:        "League",
			ScoringRule: &rule,
		})
		if !errors.Is(err, ErrInvalidLeague) {
			t.Errorf("scoring_rule %q: expected ErrInvalidLeague, got %v", bad, err)
		}
	}
}

// join_policy must be "open", "invite_code", or "approval" — no other values accepted.
func TestCreate_RejectsInvalidJoinPolicy(t *testing.T) {
	for _, bad := range []string{"closed", "public", "Open", "invite", "REQUEST"} {
		policy := bad
		svc := newTestLeagueService()
		_, err := svc.Create(context.Background(), "user-1", &model.CreateLeagueInput{
			Name:       "League",
			JoinPolicy: &policy,
		})
		if !errors.Is(err, ErrInvalidLeague) {
			t.Errorf("join_policy %q: expected ErrInvalidLeague, got %v", bad, err)
		}
	}
}

// --- AmendScore: score-range validation ---
//
// A 25-shot air-rifle card scores 0–10 per shot, giving a total range of 0–250
// and an X-count range of 0–25 (one X per shot). AmendScore enforces these
// bounds before touching the database; the tests below pin that contract.

func TestAmendScore_RejectsTotalScoreAboveMax(t *testing.T) {
	for _, score := range []int16{251, 300, 32767} {
		svc := newTestLeagueService()
		err := svc.AmendScore(context.Background(), "card-1", "admin-1", &model.AmendScoreInput{
			NewTotalScore: score,
			NewXCount:     0,
		})
		if !errors.Is(err, ErrInvalidAmend) {
			t.Errorf("total_score=%d: expected ErrInvalidAmend, got %v", score, err)
		}
	}
}

func TestAmendScore_RejectsNegativeTotalScore(t *testing.T) {
	for _, score := range []int16{-1, -100} {
		svc := newTestLeagueService()
		err := svc.AmendScore(context.Background(), "card-1", "admin-1", &model.AmendScoreInput{
			NewTotalScore: score,
			NewXCount:     0,
		})
		if !errors.Is(err, ErrInvalidAmend) {
			t.Errorf("total_score=%d: expected ErrInvalidAmend, got %v", score, err)
		}
	}
}

func TestAmendScore_RejectsXCountAboveMax(t *testing.T) {
	for _, xCount := range []int16{26, 100, 32767} {
		svc := newTestLeagueService()
		err := svc.AmendScore(context.Background(), "card-1", "admin-1", &model.AmendScoreInput{
			NewTotalScore: 200,
			NewXCount:     xCount,
		})
		if !errors.Is(err, ErrInvalidAmend) {
			t.Errorf("x_count=%d: expected ErrInvalidAmend, got %v", xCount, err)
		}
	}
}

func TestAmendScore_RejectsNegativeXCount(t *testing.T) {
	for _, xCount := range []int16{-1, -25} {
		svc := newTestLeagueService()
		err := svc.AmendScore(context.Background(), "card-1", "admin-1", &model.AmendScoreInput{
			NewTotalScore: 200,
			NewXCount:     xCount,
		})
		if !errors.Is(err, ErrInvalidAmend) {
			t.Errorf("x_count=%d: expected ErrInvalidAmend, got %v", xCount, err)
		}
	}
}
