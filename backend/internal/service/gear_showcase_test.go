package service

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

// The comparison key is what makes two users' gear "the same rifle". It has to
// ignore the casing and stray whitespace people type into the gear form.
func TestGearModelKeyNormalisation(t *testing.T) {
	assert.Equal(t, "weihrauch|hw100", gearModelKey("Weihrauch", "HW100"))
	assert.Equal(t, gearModelKey("Weihrauch", "HW100"), gearModelKey("  weihrauch ", "hw100  "))
	assert.NotEqual(t, gearModelKey("Weihrauch", "HW100"), gearModelKey("Weihrauch", "HW110"))
}

// Opting out must yield an empty comparison block, not a partially populated
// one — the whole point is that the user contributes and receives nothing.
func TestOptedOutCommunityIsEmpty(t *testing.T) {
	c := optedOutCommunity()

	assert.False(t, c.OptedIn)
	assert.False(t, c.Eligible)
	assert.Equal(t, model.GearMinComparisonOwners, c.MinOwners)
	assert.Zero(t, c.OwnerCount)
	assert.Zero(t, c.CardCount)
	assert.Nil(t, c.AvgScore)
	assert.Nil(t, c.YourPercentile)
	assert.Nil(t, c.YourRank)

	// Non-nil so the payload serialises as [] rather than null.
	assert.NotNil(t, c.Distribution)
	assert.NotNil(t, c.Trend)
	assert.NotNil(t, c.TopPairings)
	assert.NotNil(t, c.Leaders)
	assert.NotNil(t, c.GroupLeaders)
}

func TestNormaliseGearKindDefaultsToRifle(t *testing.T) {
	assert.Equal(t, "pellet", normaliseGearKind("pellet"))
	for _, in := range []string{"rifle", "", "Pellet", "PELLET", "nonsense"} {
		assert.Equal(t, "rifle", normaliseGearKind(in), "%q should fall back to rifle", in)
	}
}

type fakeSimFilter struct{ exclude bool }

func (f fakeSimFilter) ExcludeSimulatedFromPublic() bool { return f.exclude }

func TestExcludeSimulatedFollowsTheAdminSetting(t *testing.T) {
	assert.False(t, (&GearShowcaseService{}).excludeSimulated(), "no filter wired means include everything")
	assert.False(t, (&GearShowcaseService{simFilter: fakeSimFilter{exclude: false}}).excludeSimulated())
	assert.True(t, (&GearShowcaseService{simFilter: fakeSimFilter{exclude: true}}).excludeSimulated())
}
