package service

import (
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

func s(v string) *string   { return &v }
func f(v float64) *float64 { return &v }
func i(v int) *int         { return &v }

func TestValidateClubUpdateTrimsAndNormalises(t *testing.T) {
	in := &model.UpdateClubInput{
		Name:        s("  Riverside Rifle Club  "),
		City:        s("  Huddersfield "),
		Disciplines: &[]string{" Air Rifle ", "BENCHREST", "air rifle", ""},
		Facilities:  &[]string{" Covered firing line ", "covered firing line", "Clubhouse"},
	}
	require.NoError(t, ValidateClubUpdate(in))

	assert.Equal(t, "Riverside Rifle Club", *in.Name)
	assert.Equal(t, "Huddersfield", *in.City)
	// Disciplines lower-case and de-duplicate so directory filters match.
	assert.Equal(t, []string{"air rifle", "benchrest"}, *in.Disciplines)
	// Free lists keep their casing but drop case-insensitive duplicates.
	assert.Equal(t, []string{"Covered firing line", "Clubhouse"}, *in.Facilities)
}

func TestValidateClubUpdateRejectsBadInput(t *testing.T) {
	tests := []struct {
		name string
		in   model.UpdateClubInput
		want error
	}{
		{"blank name", model.UpdateClubInput{Name: s("   ")}, ErrInvalidClub},
		{"bad type", model.UpdateClubInput{Type: s("secret")}, ErrClubInvalidType},
		{"bad join policy", model.UpdateClubInput{JoinPolicy: s("whenever")}, ErrClubInvalidPolicy},
		{"bad post visibility", model.UpdateClubInput{PostVisibility: s("everyone")}, ErrInvalidClub},
		{"website without scheme", model.UpdateClubInput{WebsiteURL: s("example.test")}, ErrClubValidation},
		{"malformed email", model.UpdateClubInput{ContactEmail: s("info@example")}, ErrClubValidation},
		{"latitude out of range", model.UpdateClubInput{Latitude: f(120), Longitude: f(0)}, ErrClubValidation},
		{"longitude out of range", model.UpdateClubInput{Latitude: f(0), Longitude: f(200)}, ErrClubValidation},
		{"lone latitude", model.UpdateClubInput{Latitude: f(53.6)}, ErrClubValidation},
		{"lone longitude", model.UpdateClubInput{Longitude: f(-1.8)}, ErrClubValidation},
		{"implausible year", model.UpdateClubInput{EstablishedYear: i(1500)}, ErrClubValidation},
		{"future year", model.UpdateClubInput{EstablishedYear: i(time.Now().Year() + 1)}, ErrClubValidation},
		{"unknown discipline", model.UpdateClubInput{Disciplines: &[]string{"archery"}}, ErrClubValidation},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateClubUpdate(&tt.in)
			require.Error(t, err)
			assert.True(t, errors.Is(err, tt.want), "got %v, want %v", err, tt.want)
		})
	}
}

func TestValidateClubUpdateAcceptsClears(t *testing.T) {
	// An empty string is the agreed "clear this field" signal, and 0 clears
	// the founding year — neither should trip validation.
	in := &model.UpdateClubInput{
		ContactEmail:    s(""),
		WebsiteURL:      s(""),
		EstablishedYear: i(0),
		Disciplines:     &[]string{},
	}
	require.NoError(t, ValidateClubUpdate(in))
	assert.Empty(t, *in.Disciplines)

	// Clearing coordinates doesn't require a lat/lng pair.
	require.NoError(t, ValidateClubUpdate(&model.UpdateClubInput{ClearCoordinates: true}))
}

func TestValidateClubUpdateBoundsTextLength(t *testing.T) {
	long := make([]rune, 121)
	for idx := range long {
		long[idx] = 'a'
	}
	err := ValidateClubUpdate(&model.UpdateClubInput{City: s(string(long))})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "city")
}

func TestValidateOpeningHours(t *testing.T) {
	t.Run("normalises times", func(t *testing.T) {
		slots := []model.ClubOpeningHoursInput{
			{DayOfWeek: 5, OpensAt: s(" 9:30 "), ClosesAt: s("15:00"), Note: s("  Walk-ins welcome  ")},
		}
		require.NoError(t, ValidateOpeningHours(slots))
		assert.Equal(t, "09:30", *slots[0].OpensAt)
		assert.Equal(t, "Walk-ins welcome", *slots[0].Note)
	})

	t.Run("closed day drops times", func(t *testing.T) {
		slots := []model.ClubOpeningHoursInput{
			{DayOfWeek: 0, IsClosed: true, OpensAt: s("10:00"), ClosesAt: s("12:00")},
		}
		require.NoError(t, ValidateOpeningHours(slots))
		assert.Nil(t, slots[0].OpensAt)
		assert.Nil(t, slots[0].ClosesAt)
	})

	t.Run("rejects bad slots", func(t *testing.T) {
		cases := map[string][]model.ClubOpeningHoursInput{
			"day out of range":  {{DayOfWeek: 7, OpensAt: s("10:00"), ClosesAt: s("12:00")}},
			"missing times":     {{DayOfWeek: 1}},
			"unparseable time":  {{DayOfWeek: 1, OpensAt: s("morning"), ClosesAt: s("12:00")}},
			"close before open": {{DayOfWeek: 1, OpensAt: s("15:00"), ClosesAt: s("10:00")}},
			"same open/close":   {{DayOfWeek: 1, OpensAt: s("10:00"), ClosesAt: s("10:00")}},
		}
		for name, slots := range cases {
			t.Run(name, func(t *testing.T) {
				err := ValidateOpeningHours(slots)
				require.Error(t, err)
				assert.True(t, errors.Is(err, ErrClubValidation))
			})
		}
	})

	t.Run("caps the week", func(t *testing.T) {
		slots := make([]model.ClubOpeningHoursInput, ClubOpeningHoursLimit+1)
		for idx := range slots {
			slots[idx] = model.ClubOpeningHoursInput{DayOfWeek: 1, OpensAt: s("10:00"), ClosesAt: s("12:00")}
		}
		require.Error(t, ValidateOpeningHours(slots))
	})
}

func TestLooksLikeEmail(t *testing.T) {
	valid := []string{"a@b.co", "info@club.example.test", "first.last@example.org"}
	for _, v := range valid {
		assert.True(t, looksLikeEmail(v), v)
	}
	invalid := []string{"", "nope", "@example.test", "a@", "a@b", "a b@example.test", "a@@example.test", "a@.test", "a@test."}
	for _, v := range invalid {
		assert.False(t, looksLikeEmail(v), v)
	}
}
