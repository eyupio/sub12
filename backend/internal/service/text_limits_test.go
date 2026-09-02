package service

import (
	"context"
	"strings"
	"testing"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestOverLength(t *testing.T) {
	within := "abc"
	exact := strings.Repeat("a", 10)
	over := strings.Repeat("a", 11)
	// Runes, not bytes: a multi-byte string is measured by character count, so a
	// non-ASCII entry is not punished against an ASCII one.
	multibyte := strings.Repeat("é", 10)

	assert.False(t, overLength(nil, 10), "an absent field always passes")
	assert.False(t, overLength(&within, 10))
	assert.False(t, overLength(&exact, 10), "the cap itself is allowed")
	assert.True(t, overLength(&over, 10))
	assert.False(t, overLength(&multibyte, 10), "10 runes of 2 bytes each is 10, not 20")
}

// Every free-text field that reaches a TEXT column needs a service-layer cap:
// Postgres does not push back, and these rows are re-served on every read —
// a league's description on the unauthenticated directory, gear on the
// showcase. Validation refuses before any repository call, so zero-value
// services reach it with no database.
func TestServices_FreeTextLengthCaps(t *testing.T) {
	ctx := context.Background()
	long := strings.Repeat("a", 5001)
	name := strings.Repeat("n", maxEntityNameLen+1)

	t.Run("league name and description", func(t *testing.T) {
		svc := &LeagueService{}
		_, err := svc.Create(ctx, "user", &model.CreateLeagueInput{Name: name})
		require.Error(t, err)
		assert.ErrorIs(t, err, ErrInvalidLeague)

		_, err = svc.Create(ctx, "user", &model.CreateLeagueInput{Name: "ok", Description: &long})
		require.Error(t, err)
		assert.ErrorIs(t, err, ErrInvalidLeague)
	})

	t.Run("event name, description and location", func(t *testing.T) {
		require.ErrorIs(t, validateEventInput(&model.CreateEventInput{Name: name, Discipline: "ft"}), ErrInvalidEvent)
		require.ErrorIs(t, validateEventInput(&model.CreateEventInput{Name: "ok", Discipline: "ft", Description: &long}), ErrInvalidEvent)
		require.ErrorIs(t, validateEventInput(&model.CreateEventInput{Name: "ok", Discipline: "ft", Location: &long}), ErrInvalidEvent)
	})

	t.Run("score card notes and location", func(t *testing.T) {
		assert.ErrorIs(t, validateCardText(&long, nil), ErrInvalidCard)
		assert.ErrorIs(t, validateCardText(nil, &long), ErrInvalidCard)
		assert.NoError(t, validateCardText(nil, nil), "both absent is a valid card")
	})

	t.Run("rifle", func(t *testing.T) {
		assert.ErrorIs(t, validateRifleText(&long, nil, nil, nil), ErrInvalidGear)
		assert.ErrorIs(t, validateRifleText(nil, &long, nil, nil), ErrInvalidGear)
		assert.ErrorIs(t, validateRifleText(nil, nil, &long, nil), ErrInvalidGear)
		assert.ErrorIs(t, validateRifleText(nil, nil, nil, &long), ErrInvalidGear)
		assert.NoError(t, validateRifleText(nil, nil, nil, nil))
	})

	t.Run("pellet", func(t *testing.T) {
		assert.ErrorIs(t, validatePelletText(&long, nil, nil, nil), ErrInvalidGear)
		assert.ErrorIs(t, validatePelletText(nil, &long, nil, nil), ErrInvalidGear)
		assert.ErrorIs(t, validatePelletText(nil, nil, &long, nil), ErrInvalidGear)
		assert.ErrorIs(t, validatePelletText(nil, nil, nil, &long), ErrInvalidGear)
		assert.NoError(t, validatePelletText(nil, nil, nil, nil))
	})

	t.Run("location", func(t *testing.T) {
		assert.ErrorIs(t, validateLocationText(&long, nil, nil), ErrInvalidGear)
		assert.ErrorIs(t, validateLocationText(nil, &long, nil), ErrInvalidGear)
		assert.ErrorIs(t, validateLocationText(nil, nil, &long), ErrInvalidGear)
		assert.NoError(t, validateLocationText(nil, nil, nil))
	})
}
