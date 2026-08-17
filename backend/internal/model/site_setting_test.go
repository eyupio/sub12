package model

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNormaliseAccent(t *testing.T) {
	cases := []struct {
		in   string
		want string
		ok   bool
	}{
		{"", "", true},
		{"  ", "", true},
		{"#A07B2C", "#a07b2c", true},
		{"a07b2c", "#a07b2c", true},
		{"#abc", "#aabbcc", true},
		{"#GGGGGG", "", false},
		{"#a07b2", "", false},
		{"red", "", false},
		// The value lands in a CSS custom property, so anything that could
		// close the declaration and open another must be refused outright.
		{"#fff;}html{display:none", "", false},
		{"var(--x)", "", false},
	}
	for _, c := range cases {
		got, ok := NormaliseAccent(c.in)
		assert.Equal(t, c.ok, ok, "accepted %q", c.in)
		assert.Equal(t, c.want, got, "normalised %q", c.in)
	}
}

func TestSetupInputValidateDefaults(t *testing.T) {
	in := &SetupInput{
		SiteName: "  Dale Head Rifle Club  ",
		Admin:    SetupAdminInput{Email: " Ops@example.com ", DisplayName: " Ops ", Password: "correct-horse"},
	}
	require.NoError(t, in.Validate())

	assert.Equal(t, "Dale Head Rifle Club", in.SiteName)
	assert.Equal(t, "Ops@example.com", in.Admin.Email)
	// An unspecified deployment is the community shape, booting dark, exactly
	// as sub12.io itself runs.
	assert.Equal(t, DeploymentModeCommunity, in.DeploymentMode)
	assert.Equal(t, SiteThemeDark, in.DefaultTheme)
}

func TestSetupInputValidateRejects(t *testing.T) {
	base := func() *SetupInput {
		return &SetupInput{
			SiteName: "Club",
			Admin:    SetupAdminInput{Email: "ops@example.com", DisplayName: "Ops", Password: "correct-horse"},
		}
	}

	t.Run("single club needs a club", func(t *testing.T) {
		in := base()
		in.DeploymentMode = DeploymentModeSingleClub
		err := in.Validate()
		require.ErrorIs(t, err, ErrInvalidSiteSettings)
		assert.Contains(t, err.Error(), "needs a club")
	})

	t.Run("short password", func(t *testing.T) {
		in := base()
		in.Admin.Password = "short"
		require.ErrorIs(t, in.Validate(), ErrInvalidSiteSettings)
	})

	t.Run("bad admin email", func(t *testing.T) {
		in := base()
		in.Admin.Email = "not-an-address"
		require.ErrorIs(t, in.Validate(), ErrInvalidSiteSettings)
	})

	t.Run("bad accent", func(t *testing.T) {
		in := base()
		in.AccentLight = "chartreuse"
		require.ErrorIs(t, in.Validate(), ErrInvalidSiteSettings)
	})

	t.Run("unknown theme", func(t *testing.T) {
		in := base()
		in.DefaultTheme = "sepia"
		require.ErrorIs(t, in.Validate(), ErrInvalidSiteSettings)
	})

	t.Run("over-long site name", func(t *testing.T) {
		in := base()
		in.SiteName = strings.Repeat("x", MaxSiteNameLength+1)
		require.ErrorIs(t, in.Validate(), ErrInvalidSiteSettings)
	})

	t.Run("named club with no name", func(t *testing.T) {
		in := base()
		in.Club = &SetupClubInput{Name: "   "}
		require.ErrorIs(t, in.Validate(), ErrInvalidSiteSettings)
	})
}

func TestUpdateSiteSettingsInputValidate(t *testing.T) {
	t.Run("normalises accents in place", func(t *testing.T) {
		light, dark := "#ABC", "112233"
		in := &UpdateSiteSettingsInput{AccentLight: &light, AccentDark: &dark}
		require.NoError(t, in.Validate())
		assert.Equal(t, "#aabbcc", light)
		assert.Equal(t, "#112233", dark)
	})

	t.Run("empty accent clears the override", func(t *testing.T) {
		empty := ""
		in := &UpdateSiteSettingsInput{AccentLight: &empty}
		require.NoError(t, in.Validate())
		assert.Equal(t, "", empty)
	})

	t.Run("mode and theme have no empty meaning", func(t *testing.T) {
		empty := ""
		require.ErrorIs(t, (&UpdateSiteSettingsInput{DeploymentMode: &empty}).Validate(), ErrInvalidSiteSettings)
		require.ErrorIs(t, (&UpdateSiteSettingsInput{DefaultTheme: &empty}).Validate(), ErrInvalidSiteSettings)
	})

	t.Run("single club cannot clear its club", func(t *testing.T) {
		mode, club := DeploymentModeSingleClub, ""
		in := &UpdateSiteSettingsInput{DeploymentMode: &mode, PrimaryClubID: &club}
		require.ErrorIs(t, in.Validate(), ErrInvalidSiteSettings)
	})

	t.Run("bad support email", func(t *testing.T) {
		email := "not an address"
		require.ErrorIs(t, (&UpdateSiteSettingsInput{SupportEmail: &email}).Validate(), ErrInvalidSiteSettings)
	})
}

// Branding renames the deployment; it does not detach it from the project it
// is running. Every branding payload therefore carries the upstream links,
// stamped by ToPublic rather than by whoever happens to be calling it.
func TestToPublicAlwaysCarriesUpstreamAttribution(t *testing.T) {
	rebranded := &SiteSettings{
		SiteName:       "Dale Head Rifle Club",
		DeploymentMode: DeploymentModeSingleClub,
		DefaultTheme:   SiteThemeLight,
	}
	pub := rebranded.ToPublic(&PrimaryClubSummary{ID: "abc", Name: "Dale Head"}, false)

	assert.Equal(t, "Dale Head Rifle Club", pub.SiteName)
	assert.Equal(t, UpstreamProjectName, pub.Upstream.ProjectName)
	assert.Equal(t, "https://sub12.io", pub.Upstream.ProjectURL)
	assert.Equal(t, "EyUp.io", pub.Upstream.VendorName)
	assert.Equal(t, "https://eyup.io", pub.Upstream.VendorURL)
}

func TestToPublicFallsBackToProjectName(t *testing.T) {
	pub := (&SiteSettings{}).ToPublic(nil, true)
	assert.Equal(t, DefaultSiteName, pub.SiteName)
	assert.True(t, pub.NeedsSetup)
	assert.Nil(t, pub.PrimaryClub)
}
