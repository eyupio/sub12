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
	// actions (only the archive sweep flips into it), and complete is terminal
	// from the user's perspective.
	for _, src := range []string{model.EventStateComplete, model.EventStateArchived} {
		_, ok := allowedTransitions[src]
		require.False(t, ok, "no user-driven transitions allowed from %s", src)
	}
	require.Contains(t, allowedTransitions[model.EventStateDraft], model.EventStateOpenForEntries)
	require.Contains(t, allowedTransitions[model.EventStateOpenForEntries], model.EventStateLive)
	require.Contains(t, allowedTransitions[model.EventStateLive], model.EventStateComplete)
}

