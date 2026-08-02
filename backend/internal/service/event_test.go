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

	t.Run("club_only without club_id", func(t *testing.T) {
		v := model.EventVisibilityClubOnly
		err := validateEventInput(&model.CreateEventInput{
			Name:       "Orphan club event",
			Discipline: "HFT",
			Course:     model.EventCourse{Lanes: 25, ShotsPerTarget: 2},
			Visibility: &v,
		})
		require.ErrorIs(t, err, ErrInvalidEvent)

		empty := ""
		err = validateEventInput(&model.CreateEventInput{
			Name:       "Orphan club event",
			Discipline: "HFT",
			Course:     model.EventCourse{Lanes: 25, ShotsPerTarget: 2},
			Visibility: &v,
			ClubID:     &empty,
		})
		require.ErrorIs(t, err, ErrInvalidEvent)
	})

	t.Run("club_only with club_id", func(t *testing.T) {
		v := model.EventVisibilityClubOnly
		club := "11111111-1111-1111-1111-111111111111"
		err := validateEventInput(&model.CreateEventInput{
			Name:       "Club event",
			Discipline: "HFT",
			Course:     model.EventCourse{Lanes: 25, ShotsPerTarget: 2},
			Visibility: &v,
			ClubID:     &club,
		})
		require.NoError(t, err)
	})
}

func TestValidateEventInputMaxParticipants(t *testing.T) {
	base := func(maxParticipants *int) *model.CreateEventInput {
		return &model.CreateEventInput{
			Name:            "Spring HFT",
			Discipline:      "HFT",
			Course:          model.EventCourse{Lanes: 25, ShotsPerTarget: 2},
			MaxParticipants: maxParticipants,
		}
	}
	valid := 30
	require.NoError(t, validateEventInput(base(&valid)))

	zero := 0
	require.ErrorIs(t, validateEventInput(base(&zero)), ErrInvalidEvent)

	tooBig := EventMaxCapacity + 1
	require.ErrorIs(t, validateEventInput(base(&tooBig)), ErrInvalidEvent)
}

func TestValidateEventUpdate(t *testing.T) {
	ev := func(state string) *model.Event {
		return &model.Event{
			State:            state,
			Format:           model.EventFormatShotGrid,
			Course:           model.EventCourse{Lanes: 25, ShotsPerTarget: 2},
			ParticipantCount: 5,
		}
	}
	strPtr := func(s string) *string { return &s }
	intPtr := func(n int) *int { return &n }

	t.Run("empty name rejected", func(t *testing.T) {
		err := validateEventUpdate(ev(model.EventStateDraft), &model.UpdateEventInput{Name: strPtr("  ")})
		require.ErrorIs(t, err, ErrInvalidEvent)
	})

	t.Run("course bounds enforced", func(t *testing.T) {
		err := validateEventUpdate(ev(model.EventStateDraft), &model.UpdateEventInput{
			Course: &model.EventCourse{Lanes: 0, ShotsPerTarget: 2},
		})
		require.ErrorIs(t, err, ErrInvalidEvent)

		err = validateEventUpdate(ev(model.EventStateDraft), &model.UpdateEventInput{
			Course: &model.EventCourse{Lanes: 30, ShotsPerTarget: 2},
		})
		require.NoError(t, err)
	})

	t.Run("course frozen once live", func(t *testing.T) {
		err := validateEventUpdate(ev(model.EventStateLive), &model.UpdateEventInput{
			Course: &model.EventCourse{Lanes: 30, ShotsPerTarget: 2},
		})
		require.ErrorIs(t, err, ErrInvalidEvent)
	})

	t.Run("format change only in draft", func(t *testing.T) {
		card := model.EventFormatCardSubmission
		err := validateEventUpdate(ev(model.EventStateOpenForEntries), &model.UpdateEventInput{Format: &card})
		require.ErrorIs(t, err, ErrInvalidEvent)
		require.NoError(t, validateEventUpdate(ev(model.EventStateDraft), &model.UpdateEventInput{Format: &card}))
	})

	t.Run("invalid format rejected", func(t *testing.T) {
		bad := "banana"
		err := validateEventUpdate(ev(model.EventStateDraft), &model.UpdateEventInput{Format: &bad})
		require.ErrorIs(t, err, ErrInvalidEvent)
	})

	t.Run("required confirmations bounds", func(t *testing.T) {
		bad := int16(11)
		err := validateEventUpdate(ev(model.EventStateDraft), &model.UpdateEventInput{RequiredConfirmations: &bad})
		require.ErrorIs(t, err, ErrInvalidEvent)
	})

	t.Run("max participants below current count rejected", func(t *testing.T) {
		err := validateEventUpdate(ev(model.EventStateOpenForEntries), &model.UpdateEventInput{MaxParticipants: intPtr(3)})
		require.ErrorIs(t, err, ErrInvalidEvent)
		require.NoError(t, validateEventUpdate(ev(model.EventStateOpenForEntries), &model.UpdateEventInput{MaxParticipants: intPtr(5)}))
	})

	t.Run("zero clears the cap", func(t *testing.T) {
		require.NoError(t, validateEventUpdate(ev(model.EventStateOpenForEntries), &model.UpdateEventInput{MaxParticipants: intPtr(0)}))
	})

	t.Run("club_only requires a club", func(t *testing.T) {
		v := model.EventVisibilityClubOnly
		err := validateEventUpdate(ev(model.EventStateDraft), &model.UpdateEventInput{Visibility: &v})
		require.ErrorIs(t, err, ErrInvalidEvent)

		withClub := ev(model.EventStateDraft)
		club := "11111111-1111-1111-1111-111111111111"
		withClub.ClubID = &club
		require.NoError(t, validateEventUpdate(withClub, &model.UpdateEventInput{Visibility: &v}))
	})
}

func TestValidateLaneAssignment(t *testing.T) {
	ev := &model.Event{Course: model.EventCourse{Lanes: 25, ShotsPerTarget: 2}}
	lane := func(n int) *int { return &n }

	require.NoError(t, validateLaneAssignment(ev, nil))
	require.NoError(t, validateLaneAssignment(ev, lane(1)))
	require.NoError(t, validateLaneAssignment(ev, lane(25)))
	require.ErrorIs(t, validateLaneAssignment(ev, lane(0)), ErrInvalidEvent)
	require.ErrorIs(t, validateLaneAssignment(ev, lane(26)), ErrInvalidEvent)
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

