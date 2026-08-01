package repository

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

// gearColumn is the only place a non-parameterised value reaches a showcase
// query. Anything outside the two-item whitelist must not be echoed back, or a
// caller-supplied string could widen the WHERE clause.
func TestGearColumnWhitelist(t *testing.T) {
	assert.Equal(t, "rifle_id", gearColumn("rifle_id"))
	assert.Equal(t, "pellet_id", gearColumn("pellet_id"))

	for _, bad := range []string{"", "user_id", "rifle_id = rifle_id OR 1=1", "1=1--", "RIFLE_ID"} {
		assert.Equal(t, "invalid_gear_column", gearColumn(bad), "must not echo %q", bad)
	}
}

// adminGearSort is interpolated straight into ORDER BY, so every unrecognised
// key has to collapse to the default rather than pass through.
func TestAdminGearSortWhitelist(t *testing.T) {
	assert.Equal(t, "card_count DESC", adminGearSort("cards"))
	assert.Equal(t, "avg_group_mm ASC NULLS LAST", adminGearSort("avg_group"))

	for _, bad := range []string{"", "owner_count; DROP TABLE rifles", "(SELECT 1)", "cards DESC"} {
		assert.Equal(t, "owner_count DESC", adminGearSort(bad), "must not echo %q", bad)
	}
}

func TestSimExclusionOnlyWhenAsked(t *testing.T) {
	assert.Equal(t, "", simExclusion("sc", false))

	frag := simExclusion("sc", true)
	assert.Contains(t, frag, "su.id = sc.user_id")
	assert.Contains(t, frag, "su.is_simulated")
	assert.True(t, strings.HasPrefix(frag, " AND "), "fragment must chain onto an existing WHERE")
}

func TestAddToBinsPlacesValuesInTheRightBucket(t *testing.T) {
	bins := newScoreBins()
	addToBins(bins, 250, 2) // top bucket
	addToBins(bins, 245, 1) // top bucket, lower edge
	addToBins(bins, 244, 3) // bucket below
	addToBins(bins, 0, 1)   // bottom bucket

	byLabel := map[string]int{}
	for _, b := range bins {
		byLabel[b.Label] = b.Count
	}
	assert.Equal(t, 3, byLabel["245-250"])
	assert.Equal(t, 3, byLabel["235-244"])
	assert.Equal(t, 1, byLabel["<180"])
	assert.Equal(t, 0, byLabel["200-214"])
}

// A value past every bucket must be dropped rather than silently landing in
// the last bin and skewing a chart.
func TestAddToBinsIgnoresOutOfRangeValues(t *testing.T) {
	bins := newScoreBins()
	addToBins(bins, 999, 5)
	addToBins(bins, -1, 5)

	for _, b := range bins {
		assert.Zero(t, b.Count, "bin %s should be empty", b.Label)
	}
}

func TestGroupBinsCoverLargeGroups(t *testing.T) {
	bins := newGroupBins()
	addToBins(bins, 95, 1)   // 9.5mm
	addToBins(bins, 4000, 1) // 400mm — still lands in the open-ended top bin

	byLabel := map[string]int{}
	for _, b := range bins {
		byLabel[b.Label] = b.Count
	}
	assert.Equal(t, 1, byLabel["<10mm"])
	assert.Equal(t, 1, byLabel["30mm+"])
}

func TestSortGroupLeadersSmallestGroupFirst(t *testing.T) {
	leaders := []model.GearGroupLeader{
		{DisplayName: "c", BestGroupMM: 18.2},
		{DisplayName: "a", BestGroupMM: 7.4},
		{DisplayName: "b", BestGroupMM: 12.9},
	}
	sortGroupLeaders(leaders)
	assert.Equal(t, []string{"a", "b", "c"}, []string{leaders[0].DisplayName, leaders[1].DisplayName, leaders[2].DisplayName})
}

// Below the k-anonymity floor every figure has to be stripped — an average
// drawn from one or two owners is not anonymous.
func TestBlankCommunityStripsEveryFigure(t *testing.T) {
	avg := 231.5
	best := 248
	full := &model.GearCommunity{
		OptedIn:     true,
		Eligible:    true,
		MinOwners:   model.GearMinComparisonOwners,
		OwnerCount:  2,
		CardCount:   17,
		AvgScore:    &avg,
		MedianScore: &avg,
		BestScore:   &best,
		Leaders:     []model.GearLeader{{DisplayName: "someone"}},
	}

	blank := blankCommunity(full)

	assert.False(t, blank.Eligible)
	assert.True(t, blank.OptedIn, "opt-in state is the user's own and stays visible")
	assert.Equal(t, 2, blank.OwnerCount, "the owner count drives the 'not enough data yet' message")
	assert.Zero(t, blank.CardCount)
	assert.Nil(t, blank.AvgScore)
	assert.Nil(t, blank.MedianScore)
	assert.Nil(t, blank.BestScore)
	assert.Empty(t, blank.Leaders)
	assert.NotNil(t, blank.Trend, "collections stay non-nil so the client never sees null")
	assert.NotNil(t, blank.TopPairings)
	assert.NotNil(t, blank.GroupLeaders)
}

func TestXPercentage(t *testing.T) {
	assert.Nil(t, xPercentage(nil))

	avg := 5.0
	assert.Equal(t, 20.0, *xPercentage(&avg), "5 Xs on a 25-shot card is 20%%")

	avg = 0
	assert.Equal(t, 0.0, *xPercentage(&avg))
}

func TestRound2(t *testing.T) {
	assert.Equal(t, 33.33, round2(100.0/3))
	assert.Equal(t, 66.67, round2(200.0/3))
	assert.Equal(t, 0.0, round2(0))
}
