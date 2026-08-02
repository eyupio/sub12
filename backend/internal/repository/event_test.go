package repository

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

func TestSortStandingsCaseInsensitiveTieBreak(t *testing.T) {
	rows := []*model.EventStandingRow{
		{ParticipantID: "p1", DisplayName: "zoe", Points: 10, HitCount: 5},
		{ParticipantID: "p2", DisplayName: "Adam", Points: 10, HitCount: 5},
	}
	sortStandings(rows)
	require.Equal(t, "Adam", rows[0].DisplayName, "lowercase names must not sort after uppercase ones")
	require.Equal(t, "zoe", rows[1].DisplayName)
}

func TestAssignPositionsSharesTies(t *testing.T) {
	rows := []*model.EventStandingRow{
		{ParticipantID: "p1", DisplayName: "A", Points: 47, HitCount: 24},
		{ParticipantID: "p2", DisplayName: "B", Points: 42, HitCount: 22},
		{ParticipantID: "p3", DisplayName: "C", Points: 42, HitCount: 22},
		{ParticipantID: "p4", DisplayName: "D", Points: 40, HitCount: 21},
	}
	assignPositions(rows)
	require.Equal(t, 1, rows[0].Position)
	require.Equal(t, 2, rows[1].Position)
	require.Equal(t, 2, rows[2].Position, "equal points and hits share a position")
	require.Equal(t, 4, rows[3].Position, "next distinct result skips the tied slot")
}

func TestAssignPositionsHitCountBreaksTie(t *testing.T) {
	rows := []*model.EventStandingRow{
		{ParticipantID: "p1", DisplayName: "A", Points: 42, HitCount: 23},
		{ParticipantID: "p2", DisplayName: "B", Points: 42, HitCount: 22},
	}
	assignPositions(rows)
	require.Equal(t, 1, rows[0].Position)
	require.Equal(t, 2, rows[1].Position, "same points but different hit counts are not a tie")
}
