package service

import (
	"math/rand"
	"testing"

	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

func validInput() *model.UpsertSimulationSettingsInput {
	return &model.UpsertSimulationSettingsInput{
		Enabled:            true,
		PersonaCount:       10,
		ActionsPerHour:     20,
		PostWeight:         2,
		LikeWeight:         5,
		CommentWeight:      2,
		FollowWeight:       1,
		ActiveStartHour:    0,
		ActiveEndHour:      24,
		MaxCardsPerPersona: 30,
	}
}

func TestValidateSimulationSettings(t *testing.T) {
	require.NoError(t, validateSimulationSettings(validInput()))

	cases := map[string]func(*model.UpsertSimulationSettingsInput){
		"negative persona": func(in *model.UpsertSimulationSettingsInput) { in.PersonaCount = -1 },
		"persona too high": func(in *model.UpsertSimulationSettingsInput) { in.PersonaCount = 5000 },
		"negative actions": func(in *model.UpsertSimulationSettingsInput) { in.ActionsPerHour = -1 },
		"negative weight":  func(in *model.UpsertSimulationSettingsInput) { in.LikeWeight = -2 },
		"all weights zero": func(in *model.UpsertSimulationSettingsInput) {
			in.PostWeight, in.LikeWeight, in.CommentWeight, in.FollowWeight = 0, 0, 0, 0
		},
		"start hour high":    func(in *model.UpsertSimulationSettingsInput) { in.ActiveStartHour = 24 },
		"end hour zero":      func(in *model.UpsertSimulationSettingsInput) { in.ActiveEndHour = 0 },
		"end hour too high":  func(in *model.UpsertSimulationSettingsInput) { in.ActiveEndHour = 25 },
		"negative max cards": func(in *model.UpsertSimulationSettingsInput) { in.MaxCardsPerPersona = -1 },
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			in := validInput()
			mutate(in)
			assert.ErrorIs(t, validateSimulationSettings(in), ErrInvalidSimulationSettings)
		})
	}
}

func TestWithinActiveHours(t *testing.T) {
	// Whole-day window (start == end).
	assert.True(t, withinActiveHours(0, 0, 24))
	assert.True(t, withinActiveHours(13, 9, 9))

	// Normal window [9, 17).
	assert.False(t, withinActiveHours(8, 9, 17))
	assert.True(t, withinActiveHours(9, 9, 17))
	assert.True(t, withinActiveHours(16, 9, 17))
	assert.False(t, withinActiveHours(17, 9, 17))

	// Wrap-around overnight window [20, 6).
	assert.True(t, withinActiveHours(22, 20, 6))
	assert.True(t, withinActiveHours(3, 20, 6))
	assert.False(t, withinActiveHours(12, 20, 6))
}

func newTestSimService() *SimulationService {
	return &SimulationService{
		log: zerolog.Nop(),
		rng: rand.New(rand.NewSource(1)),
	}
}

func TestRandomShotsAreValid(t *testing.T) {
	s := newTestSimService()
	for i := 0; i < 100; i++ {
		scores, xs := s.randomShots()
		require.Len(t, scores, 25)
		require.Len(t, xs, 25)
		for j := range scores {
			assert.GreaterOrEqual(t, scores[j], int16(0))
			assert.LessOrEqual(t, scores[j], int16(10))
			// X-ring hits only ever land on a perfect 10.
			if xs[j] {
				assert.Equal(t, int16(10), scores[j])
			}
		}
	}
}

func TestPickActionRespectsWeights(t *testing.T) {
	s := newTestSimService()

	// Only follow has weight: every pick must be follow.
	settings := &model.SimulationSettings{FollowWeight: 1}
	for i := 0; i < 50; i++ {
		assert.Equal(t, "follow", s.pickAction(settings))
	}

	// Zero total weight falls back to like (never panics).
	assert.Equal(t, "like", s.pickAction(&model.SimulationSettings{}))
}

func TestPickActionCoversAllWeightedActions(t *testing.T) {
	s := newTestSimService()
	settings := &model.SimulationSettings{PostWeight: 1, LikeWeight: 1, CommentWeight: 1, FollowWeight: 1}
	seen := map[string]bool{}
	for i := 0; i < 500; i++ {
		seen[s.pickAction(settings)] = true
	}
	for _, action := range []string{"post", "like", "comment", "follow"} {
		assert.True(t, seen[action], "expected to see action %q", action)
	}
}

func TestRandomHelpersNonEmpty(t *testing.T) {
	s := newTestSimService()
	assert.NotEmpty(t, s.randomDisplayName())
	assert.NotEmpty(t, s.randomBio())
	assert.NotEmpty(t, s.randomLocation())
	assert.NotEmpty(t, s.randomComment())
	// randomNote is allowed to be empty (some personas post without a note).
	_ = s.randomNote()
}
