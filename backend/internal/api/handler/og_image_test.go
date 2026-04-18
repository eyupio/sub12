package handler

import (
	"bytes"
	"image/png"
	"testing"

	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

func TestOGImage_RendersValidPNG(t *testing.T) {
	h, err := NewOGImage(nil, nil, nil, nil, nil, nil, nil, zerolog.Nop())
	require.NoError(t, err)

	got, err := h.render("SCORE CARD", "245", "12X", []string{
		"John Shooter · 2026-04-18 · Birmingham Club",
		"Air Arms S510 + JSB Exact 4.52mm",
	})
	require.NoError(t, err)
	require.NotEmpty(t, got)

	img, err := png.Decode(bytes.NewReader(got))
	require.NoError(t, err, "output should be valid PNG")
	assert.Equal(t, ogWidth, img.Bounds().Dx())
	assert.Equal(t, ogHeight, img.Bounds().Dy())
}

func TestOGImage_PrimaryFontSizeShrinksForLongText(t *testing.T) {
	// Short score card number gets the biggest headline.
	assert.Greater(t, primaryFontSize("245"), primaryFontSize("The Rotary Shooting League of Birmingham"))
	// Two-level bucket check so minor tweaks to thresholds are still caught.
	assert.GreaterOrEqual(t, primaryFontSize("245"), 200.0)
	assert.LessOrEqual(t, primaryFontSize("The Rotary Shooting League of Birmingham"), 78.0)
}

func TestOGCache_EvictsOldestWhenFull(t *testing.T) {
	c := newOGCache(2)
	c.Set("a", []byte{1})
	c.Set("b", []byte{2})
	c.Set("c", []byte{3})

	_, okA := c.Get("a")
	_, okB := c.Get("b")
	_, okC := c.Get("c")
	assert.False(t, okA, "oldest entry should have been evicted")
	assert.True(t, okB)
	assert.True(t, okC)
}

func TestOGCache_GetRefreshesRecency(t *testing.T) {
	c := newOGCache(2)
	c.Set("a", []byte{1})
	c.Set("b", []byte{2})
	// Touch a so it becomes the most-recent; adding c should evict b, not a.
	_, _ = c.Get("a")
	c.Set("c", []byte{3})

	_, okA := c.Get("a")
	_, okB := c.Get("b")
	_, okC := c.Get("c")
	assert.True(t, okA, "recently accessed entry should survive eviction")
	assert.False(t, okB)
	assert.True(t, okC)
}

func TestScoreCardMetaLines_OmitsEmptyFields(t *testing.T) {
	card := &model.ScoreCard{ShotAt: "2026-04-18"}
	lines := scoreCardMetaLines(card, "", nil, nil)
	require.Len(t, lines, 2)
	assert.Equal(t, "2026-04-18", lines[0], "line 1 should just be the date when everything else is blank")
	assert.Empty(t, lines[1], "gear line should be empty when no rifle/pellet")
}

func TestPelletTestPrimary_PrefersPelletLabel(t *testing.T) {
	sess := &model.PelletTestSession{Pellet: &model.Pellet{Brand: "JSB", Model: "Hades"}}
	assert.Equal(t, "JSB Hades", pelletTestPrimary(sess))
}

func TestPelletTestPrimary_FallsBackWhenNoPellet(t *testing.T) {
	sess := &model.PelletTestSession{}
	assert.Equal(t, "Pellet test", pelletTestPrimary(sess))
}

func TestLeagueMetaLines_PluralisesMembersCorrectly(t *testing.T) {
	one := &model.League{MemberCount: 1}
	many := &model.League{MemberCount: 8}
	assert.Equal(t, "1 member", leagueMetaLines(one)[0])
	assert.Equal(t, "8 members", leagueMetaLines(many)[0])
}
