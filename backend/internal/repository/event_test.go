package repository

import (
	"fmt"
	"strings"
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

// standingsFixture builds n rows with many ties so the name tie-break is hit.
func standingsFixture(n int) []*model.EventStandingRow {
	rows := make([]*model.EventStandingRow, n)
	for i := range rows {
		rows[i] = &model.EventStandingRow{
			ParticipantID: fmt.Sprintf("p%d", i),
			DisplayName:   fmt.Sprintf("Shooter %04d", (i*7919)%n),
			Points:        (i * 31) % 40,
			HitCount:      (i * 17) % 5,
		}
	}
	return rows
}

func TestSortStandingsOrdersByPointsHitsThenName(t *testing.T) {
	rows := standingsFixture(300)
	sortStandings(rows)
	for i := 1; i < len(rows); i++ {
		a, b := rows[i-1], rows[i]
		require.False(t, a.Points < b.Points ||
			(a.Points == b.Points && a.HitCount < b.HitCount) ||
			(a.Points == b.Points && a.HitCount == b.HitCount &&
				strings.ToLower(a.DisplayName) > strings.ToLower(b.DisplayName)), "rows %d and %d out of order", i-1, i)
	}
}

func BenchmarkSortStandings(b *testing.B) {
	src := standingsFixture(500)
	rows := make([]*model.EventStandingRow, len(src))
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		copy(rows, src)
		sortStandings(rows)
	}
}
