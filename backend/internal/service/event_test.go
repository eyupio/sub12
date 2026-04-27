package service

import (
	"testing"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/stretchr/testify/require"
)

func TestValidateEventInput(t *testing.T) {
	t.Run("happy path", func(t *testing.T) {
		err := validateEventInput(&model.CreateEventInput{
			Name:       "Spring HFT",
			Discipline: "HFT",
			Course:     model.EventCourse{Lanes: 25, ShotsPerTarget: 2},
		})
		require.NoError(t, err)
	})

	t.Run("missing name", func(t *testing.T) {
		err := validateEventInput(&model.CreateEventInput{
			Discipline: "FT",
			Course:     model.EventCourse{Lanes: 50, ShotsPerTarget: 1},
		})
		require.ErrorIs(t, err, ErrInvalidEvent)
	})

	t.Run("missing discipline", func(t *testing.T) {
		err := validateEventInput(&model.CreateEventInput{
			Name:   "Mystery shoot",
			Course: model.EventCourse{Lanes: 10, ShotsPerTarget: 1},
		})
		require.ErrorIs(t, err, ErrInvalidEvent)
	})

	t.Run("invalid course", func(t *testing.T) {
		err := validateEventInput(&model.CreateEventInput{
			Name:       "Big course",
			Discipline: "FT",
			Course:     model.EventCourse{Lanes: 0, ShotsPerTarget: 1},
		})
		require.ErrorIs(t, err, ErrInvalidEvent)
	})

	t.Run("invalid visibility", func(t *testing.T) {
		bad := "private"
		err := validateEventInput(&model.CreateEventInput{
			Name:       "Vis",
			Discipline: "HFT",
			Course:     model.EventCourse{Lanes: 25, ShotsPerTarget: 2},
			Visibility: &bad,
		})
		require.ErrorIs(t, err, ErrInvalidEvent)
	})
}

func TestAllowedTransitionsTopology(t *testing.T) {
	// Sanity check on the state machine: archived is unreachable from user
	// actions (only the archive sweep flips into it). complete now has exactly
	// one user-driven edge — back to live — so an owner can reopen an event
	// closed by mistake.
	_, ok := allowedTransitions[model.EventStateArchived]
	require.False(t, ok, "no user-driven transitions allowed from archived")
	require.Contains(t, allowedTransitions[model.EventStateDraft], model.EventStateOpenForEntries)
	require.Contains(t, allowedTransitions[model.EventStateOpenForEntries], model.EventStateLive)
	require.Contains(t, allowedTransitions[model.EventStateLive], model.EventStateComplete)
	require.Equal(t, map[string]struct{}{model.EventStateLive: {}}, allowedTransitions[model.EventStateComplete])
}

func TestBuildEventResultsMeta(t *testing.T) {
	uid1, uid2 := "user-1", "user-2"
	hunter, recoil := "cat-hunter", "cat-recoil"
	hunterLbl, recoilLbl := "Hunter", "Recoil"
	standings := []*model.EventStandingRow{
		{ParticipantID: "p1", UserID: &uid1, DisplayName: "Alice", CategoryID: &hunter, CategoryLabel: &hunterLbl, Position: 1, Points: 47, HitCount: 24, ShotsRecorded: 25},
		{ParticipantID: "p2", UserID: &uid2, DisplayName: "Bob", CategoryID: &recoil, CategoryLabel: &recoilLbl, Position: 2, Points: 42, HitCount: 22, ShotsRecorded: 25},
		{ParticipantID: "p3", UserID: nil, DisplayName: "Guest", CategoryID: &hunter, CategoryLabel: &hunterLbl, Position: 3, Points: 40, HitCount: 21, ShotsRecorded: 25},
		{ParticipantID: "p4", UserID: nil, DisplayName: "Uncategorised", Position: 4, Points: 30, HitCount: 18, ShotsRecorded: 25},
	}

	meta := buildEventResultsMeta("Spring HFT", "abc123", "Test Club", standings)

	require.Equal(t, "Spring HFT", meta.EventName)
	require.Equal(t, "abc123", meta.EventSlug)
	require.Equal(t, "Test Club", meta.ClubName)
	require.NotNil(t, meta.Winner)
	require.Equal(t, "Alice", meta.Winner.DisplayName)
	require.Equal(t, "Hunter", meta.Winner.CategoryLabel)
	require.Equal(t, "user-1", meta.Winner.UserID)
	require.Len(t, meta.Top3, 3)
	require.Equal(t, "Bob", meta.Top3[1].DisplayName)
	require.Empty(t, meta.Top3[2].UserID, "guests appear in top3 but have no UserID")
	// Per-band winners: only the first row per band, uncategorised rows skipped.
	require.Len(t, meta.PerBandWinners, 2)
	require.Equal(t, "Hunter", meta.PerBandWinners[0].CategoryLabel)
	require.Equal(t, "Alice", meta.PerBandWinners[0].DisplayName)
	require.Equal(t, "Recoil", meta.PerBandWinners[1].CategoryLabel)
	require.Equal(t, "Bob", meta.PerBandWinners[1].DisplayName)
}

func TestBuildEventResultsMetaEmpty(t *testing.T) {
	meta := buildEventResultsMeta("Quiet day", "xyz789", "", nil)
	require.Equal(t, "Quiet day", meta.EventName)
	require.Nil(t, meta.Winner)
	require.Empty(t, meta.Top3)
	require.Empty(t, meta.PerBandWinners)
}

