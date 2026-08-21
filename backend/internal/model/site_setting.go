package model

import (
	"errors"
	"fmt"
	"net/mail"
	"regexp"
	"strings"
	"time"
)

// Deployment modes. A community deployment is the sub12.io shape — anyone
// signs up, discovers clubs and joins leagues. A single-club deployment is one
// club running the software as its own site: the club it was set up for is the
// point of the installation rather than one entry in a directory.
const (
	DeploymentModeCommunity  = "community"
	DeploymentModeSingleClub = "single_club"
)

// Themes a deployment can boot into. "system" follows the visitor's OS
// preference; the other two override it until the visitor chooses otherwise.
const (
	SiteThemeLight  = "light"
	SiteThemeDark   = "dark"
	SiteThemeSystem = "system"
)

// Upstream attribution. sub12 is AGPL-3.0 and a self-hoster is free to rename
// and recolour their deployment — but the software is still sub12, still built
// by EyUp.io, and the people using a rebranded copy are entitled to know what
// they are running and where it comes from. These values are served with every
// branding payload and are deliberately not configurable: branding changes the
// name over the door, not who built the building.
const (
	UpstreamProjectName = "SUB12"
	UpstreamProjectURL  = "https://sub12.io"
	UpstreamVendorName  = "EyUp.io"
	UpstreamVendorURL   = "https://eyup.io"
)

// DefaultSiteName is what an unbranded deployment calls itself.
const DefaultSiteName = "SUB12"

// Field ceilings. Long enough for a real club's name and a paragraph of
// welcome copy, short enough that the login screen still lays out.
const (
	MaxSiteNameLength       = 60
	MaxTaglineLength        = 120
	MaxWelcomeHeadingLength = 120
	MaxWelcomeMessageLength = 600
	// RFC 5321 caps an email address at 254 characters; anything longer is not
	// a real address and would otherwise ride the whole /site/settings payload
	// to every visitor on every page load — the same storage/bandwidth DoS
	// shape as the profile bio and device-token caps.
	MaxSupportEmailLength = 254
)

// ErrInvalidSiteSettings is returned for any rejected branding input; handlers
// map it to 422 and show the wrapped message, which names the offending field.
var ErrInvalidSiteSettings = errors.New("invalid site settings")

// UpstreamAttribution travels with every branding payload so the footer can
// name the project and its author even on a deployment that has renamed
// itself. See the constants above.
type UpstreamAttribution struct {
	ProjectName string `json:"project_name"`
	ProjectURL  string `json:"project_url"`
	VendorName  string `json:"vendor_name"`
	VendorURL   string `json:"vendor_url"`
}

// Upstream returns the fixed attribution block.
func Upstream() UpstreamAttribution {
	return UpstreamAttribution{
		ProjectName: UpstreamProjectName,
		ProjectURL:  UpstreamProjectURL,
		VendorName:  UpstreamVendorName,
		VendorURL:   UpstreamVendorURL,
	}
}

// SiteSettings is the stored singleton row.
type SiteSettings struct {
	ID                 int16      `json:"id"`
	SiteName           string     `json:"site_name"`
	Tagline            string     `json:"tagline"`
	DeploymentMode     string     `json:"deployment_mode"`
	PrimaryClubID      *string    `json:"primary_club_id,omitempty"`
	LogoURL            string     `json:"logo_url"`
	AccentLight        string     `json:"accent_light"`
	AccentDark         string     `json:"accent_dark"`
	DefaultTheme       string     `json:"default_theme"`
	AllowThemeToggle   bool       `json:"allow_theme_toggle"`
	WelcomeHeading     string     `json:"welcome_heading"`
	WelcomeMessage     string     `json:"welcome_message"`
	SupportEmail       string     `json:"support_email"`
	PublicRegistration bool       `json:"public_registration"`
	SetupCompletedAt   *time.Time `json:"setup_completed_at,omitempty"`
	UpdatedBy          *string    `json:"updated_by,omitempty"`
	UpdatedAt          time.Time  `json:"updated_at"`
}

// PrimaryClubSummary is the little the shell needs to link to the club a
// single-club deployment was set up for.
type PrimaryClubSummary struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Slug     string `json:"slug,omitempty"`
	ImageURL string `json:"image_url,omitempty"`
}

// PublicSiteSettings is the unauthenticated branding payload. Every visitor
// fetches it before the shell paints, so it carries only what the shell needs:
// no updated_by, no setup timestamp, no operator detail.
type PublicSiteSettings struct {
	SiteName           string              `json:"site_name"`
	Tagline            string              `json:"tagline"`
	DeploymentMode     string              `json:"deployment_mode"`
	LogoURL            string              `json:"logo_url"`
	AccentLight        string              `json:"accent_light"`
	AccentDark         string              `json:"accent_dark"`
	DefaultTheme       string              `json:"default_theme"`
	AllowThemeToggle   bool                `json:"allow_theme_toggle"`
	WelcomeHeading     string              `json:"welcome_heading"`
	WelcomeMessage     string              `json:"welcome_message"`
	SupportEmail       string              `json:"support_email"`
	PublicRegistration bool                `json:"public_registration"`
	PrimaryClub        *PrimaryClubSummary `json:"primary_club,omitempty"`
	NeedsSetup         bool                `json:"needs_setup"`
	Upstream           UpstreamAttribution `json:"upstream"`
}

// ToPublic projects the stored row onto the branding payload. The upstream
// attribution is stamped here rather than at the call site so no future
// caller can serve a branding payload without it.
func (s *SiteSettings) ToPublic(club *PrimaryClubSummary, needsSetup bool) *PublicSiteSettings {
	name := strings.TrimSpace(s.SiteName)
	if name == "" {
		name = DefaultSiteName
	}
	return &PublicSiteSettings{
		SiteName:           name,
		Tagline:            s.Tagline,
		DeploymentMode:     s.DeploymentMode,
		LogoURL:            s.LogoURL,
		AccentLight:        s.AccentLight,
		AccentDark:         s.AccentDark,
		DefaultTheme:       s.DefaultTheme,
		AllowThemeToggle:   s.AllowThemeToggle,
		WelcomeHeading:     s.WelcomeHeading,
		WelcomeMessage:     s.WelcomeMessage,
		SupportEmail:       s.SupportEmail,
		PublicRegistration: s.PublicRegistration,
		PrimaryClub:        club,
		NeedsSetup:         needsSetup,
		Upstream:           Upstream(),
	}
}

// UpdateSiteSettingsInput patches the singleton. Every field is a pointer on
// the usual convention: omit to keep, empty string to clear. DeploymentMode,
// DefaultTheme and the booleans have no meaningful empty value, so an empty
// string there is refused rather than treated as a clear.
type UpdateSiteSettingsInput struct {
	SiteName           *string `json:"site_name"`
	Tagline            *string `json:"tagline"`
	DeploymentMode     *string `json:"deployment_mode"`
	PrimaryClubID      *string `json:"primary_club_id"`
	AccentLight        *string `json:"accent_light"`
	AccentDark         *string `json:"accent_dark"`
	DefaultTheme       *string `json:"default_theme"`
	AllowThemeToggle   *bool   `json:"allow_theme_toggle"`
	WelcomeHeading     *string `json:"welcome_heading"`
	WelcomeMessage     *string `json:"welcome_message"`
	SupportEmail       *string `json:"support_email"`
	PublicRegistration *bool   `json:"public_registration"`
}

// SetupClubInput is the club a single-club deployment is being stood up for.
// It mirrors CreateClubInput: the wizard creates an ordinary club, owned by
// the administrator it just created, and nothing about it is special except
// that site_settings points at it.
type SetupClubInput struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Type        string `json:"type"`
	JoinPolicy  string `json:"join_policy"`
}

// SetupAdminInput is the first administrator. There is exactly one chance to
// create it — see SiteSettingsService.CompleteSetup.
type SetupAdminInput struct {
	Email       string `json:"email"`
	DisplayName string `json:"display_name"`
	Password    string `json:"password"`
}

// SetupInput is the whole wizard in one request. It is submitted once, by an
// unauthenticated caller, and only while the deployment has no administrator.
type SetupInput struct {
	SiteName           string          `json:"site_name"`
	Tagline            string          `json:"tagline"`
	DeploymentMode     string          `json:"deployment_mode"`
	AccentLight        string          `json:"accent_light"`
	AccentDark         string          `json:"accent_dark"`
	DefaultTheme       string          `json:"default_theme"`
	AllowThemeToggle   *bool           `json:"allow_theme_toggle"`
	WelcomeHeading     string          `json:"welcome_heading"`
	WelcomeMessage     string          `json:"welcome_message"`
	SupportEmail       string          `json:"support_email"`
	PublicRegistration *bool           `json:"public_registration"`
	Admin              SetupAdminInput `json:"admin"`
	Club               *SetupClubInput `json:"club"`
}

// SetupStatus is the public answer to "does this deployment still need setting
// up?". It carries nothing else: an unauthenticated caller learns whether the
// wizard is open, not what the deployment is called or who runs it.
type SetupStatus struct {
	NeedsSetup bool `json:"needs_setup"`
}

var hexColorRe = regexp.MustCompile(`^#([0-9a-f]{3}|[0-9a-f]{6})$`)

// NormaliseAccent accepts "#abc" or "#aabbcc" in any case and returns the
// six-digit lowercase form. An empty string is valid and means "no override" —
// the deployment keeps sub12's own olive-gold. Anything else is rejected: the
// value is interpolated into a CSS custom property, so accepting arbitrary
// text would let an administrator inject a declaration into every page.
func NormaliseAccent(v string) (string, bool) {
	v = strings.ToLower(strings.TrimSpace(v))
	if v == "" {
		return "", true
	}
	if !strings.HasPrefix(v, "#") {
		v = "#" + v
	}
	if !hexColorRe.MatchString(v) {
		return "", false
	}
	if len(v) == 4 {
		v = fmt.Sprintf("#%c%c%c%c%c%c", v[1], v[1], v[2], v[2], v[3], v[3])
	}
	return v, true
}

// ValidDeploymentMode reports whether m names a deployment shape.
func ValidDeploymentMode(m string) bool {
	return m == DeploymentModeCommunity || m == DeploymentModeSingleClub
}

// ValidSiteTheme reports whether t names a boot theme.
func ValidSiteTheme(t string) bool {
	return t == SiteThemeLight || t == SiteThemeDark || t == SiteThemeSystem
}

// ValidateBranding checks the fields the wizard and the admin page share. It
// normalises in place so a caller never has to remember to do it: the stored
// accents are always the canonical six-digit form.
func ValidateBranding(siteName, tagline, welcomeHeading, welcomeMessage, supportEmail string, deploymentMode, defaultTheme string, accentLight, accentDark *string) error {
	if len(siteName) > MaxSiteNameLength {
		return fmt.Errorf("%w: site name must be %d characters or fewer", ErrInvalidSiteSettings, MaxSiteNameLength)
	}
	if len(tagline) > MaxTaglineLength {
		return fmt.Errorf("%w: tagline must be %d characters or fewer", ErrInvalidSiteSettings, MaxTaglineLength)
	}
	if len(welcomeHeading) > MaxWelcomeHeadingLength {
		return fmt.Errorf("%w: welcome heading must be %d characters or fewer", ErrInvalidSiteSettings, MaxWelcomeHeadingLength)
	}
	if len(welcomeMessage) > MaxWelcomeMessageLength {
		return fmt.Errorf("%w: welcome message must be %d characters or fewer", ErrInvalidSiteSettings, MaxWelcomeMessageLength)
	}
	if s := strings.TrimSpace(supportEmail); s != "" {
		if len(s) > MaxSupportEmailLength {
			return fmt.Errorf("%w: support email must be %d characters or fewer", ErrInvalidSiteSettings, MaxSupportEmailLength)
		}
		if _, err := mail.ParseAddress(s); err != nil {
			return fmt.Errorf("%w: support email must be a valid email address", ErrInvalidSiteSettings)
		}
	}
	if deploymentMode != "" && !ValidDeploymentMode(deploymentMode) {
		return fmt.Errorf("%w: deployment mode must be %q or %q", ErrInvalidSiteSettings, DeploymentModeCommunity, DeploymentModeSingleClub)
	}
	if defaultTheme != "" && !ValidSiteTheme(defaultTheme) {
		return fmt.Errorf("%w: default theme must be light, dark or system", ErrInvalidSiteSettings)
	}
	accents := []struct {
		label string
		ptr   *string
	}{{"light", accentLight}, {"dark", accentDark}}
	for _, a := range accents {
		if a.ptr == nil {
			continue
		}
		normalised, ok := NormaliseAccent(*a.ptr)
		if !ok {
			return fmt.Errorf("%w: %s accent must be a hex colour like #a07b2c", ErrInvalidSiteSettings, a.label)
		}
		*a.ptr = normalised
	}
	return nil
}

// Validate checks an admin patch, normalising the accents in place.
func (in *UpdateSiteSettingsInput) Validate() error {
	deref := func(p *string) string {
		if p == nil {
			return ""
		}
		return *p
	}
	if err := ValidateBranding(
		deref(in.SiteName), deref(in.Tagline), deref(in.WelcomeHeading), deref(in.WelcomeMessage), deref(in.SupportEmail),
		deref(in.DeploymentMode), deref(in.DefaultTheme), in.AccentLight, in.AccentDark,
	); err != nil {
		return err
	}
	// These two carry no "clear" meaning, so an explicit empty string is a
	// mistake rather than an intent — ValidateBranding skips empties.
	if in.DeploymentMode != nil && *in.DeploymentMode == "" {
		return fmt.Errorf("%w: deployment mode cannot be empty", ErrInvalidSiteSettings)
	}
	if in.DefaultTheme != nil && *in.DefaultTheme == "" {
		return fmt.Errorf("%w: default theme cannot be empty", ErrInvalidSiteSettings)
	}
	if in.DeploymentMode != nil && *in.DeploymentMode == DeploymentModeSingleClub {
		// Nothing to point the shell at is the one combination that would
		// leave the club nav item dangling, so it is refused here rather
		// than rendered as a broken link.
		if in.PrimaryClubID != nil && strings.TrimSpace(*in.PrimaryClubID) == "" {
			return fmt.Errorf("%w: a single-club deployment needs a club", ErrInvalidSiteSettings)
		}
	}
	return nil
}

// Validate checks the wizard submission and normalises it in place, so the
// service can hand straight-through values to the repository.
func (in *SetupInput) Validate() error {
	in.SiteName = strings.TrimSpace(in.SiteName)
	in.Tagline = strings.TrimSpace(in.Tagline)
	in.SupportEmail = strings.TrimSpace(in.SupportEmail)
	in.Admin.Email = strings.TrimSpace(in.Admin.Email)
	in.Admin.DisplayName = strings.TrimSpace(in.Admin.DisplayName)

	if in.DeploymentMode == "" {
		in.DeploymentMode = DeploymentModeCommunity
	}
	if in.DefaultTheme == "" {
		in.DefaultTheme = SiteThemeDark
	}
	if err := ValidateBranding(
		in.SiteName, in.Tagline, in.WelcomeHeading, in.WelcomeMessage, in.SupportEmail,
		in.DeploymentMode, in.DefaultTheme, &in.AccentLight, &in.AccentDark,
	); err != nil {
		return err
	}

	if in.Admin.Email == "" || in.Admin.DisplayName == "" || in.Admin.Password == "" {
		return fmt.Errorf("%w: administrator email, display name and password are required", ErrInvalidSiteSettings)
	}
	if _, err := mail.ParseAddress(in.Admin.Email); err != nil {
		return fmt.Errorf("%w: administrator email is not a valid address", ErrInvalidSiteSettings)
	}
	if len(in.Admin.Email) > 254 {
		return fmt.Errorf("%w: administrator email is too long", ErrInvalidSiteSettings)
	}
	if len(in.Admin.DisplayName) > 64 {
		return fmt.Errorf("%w: administrator display name must be 64 characters or fewer", ErrInvalidSiteSettings)
	}
	// Matches POST /auth/register: the wizard must not be a way to create an
	// account with a password the login form would have refused.
	if len(in.Admin.Password) < 8 {
		return fmt.Errorf("%w: administrator password must be at least 8 characters", ErrInvalidSiteSettings)
	}
	if len(in.Admin.Password) > 128 {
		return fmt.Errorf("%w: administrator password is too long", ErrInvalidSiteSettings)
	}

	if in.Club != nil {
		in.Club.Name = strings.TrimSpace(in.Club.Name)
		if in.Club.Name == "" {
			return fmt.Errorf("%w: the club needs a name", ErrInvalidSiteSettings)
		}
		if in.Club.Type != "" && in.Club.Type != "public" && in.Club.Type != "private" {
			return fmt.Errorf("%w: club type must be public or private", ErrInvalidSiteSettings)
		}
		if in.Club.JoinPolicy != "" && in.Club.JoinPolicy != "open" && in.Club.JoinPolicy != "invite_code" && in.Club.JoinPolicy != "approval" {
			return fmt.Errorf("%w: club join policy must be open, invite_code or approval", ErrInvalidSiteSettings)
		}
	} else if in.DeploymentMode == DeploymentModeSingleClub {
		return fmt.Errorf("%w: a single-club deployment needs a club", ErrInvalidSiteSettings)
	}
	return nil
}
