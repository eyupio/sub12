package service

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/rs/zerolog"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)

// ErrSetupComplete is returned when the wizard is submitted against a
// deployment that already has an administrator. It is the only outcome of a
// second submission — there is no "re-run setup", because re-running it would
// mean minting a fresh administrator on a live site from an unauthenticated
// request.
var ErrSetupComplete = errors.New("setup has already been completed")

// SiteSettingsService owns the deployment's own identity: what it is called,
// how it is coloured, whether it runs as a community platform or one club's
// site, and the once-only first-run wizard that decides all of that.
type SiteSettingsService struct {
	repo  *repository.SiteSettingsRepository
	users *repository.UserRepository
	auth  *AuthService
	clubs *ClubService
	log   zerolog.Logger
}

func NewSiteSettingsService(
	repo *repository.SiteSettingsRepository,
	users *repository.UserRepository,
	auth *AuthService,
	clubs *ClubService,
	log zerolog.Logger,
) *SiteSettingsService {
	return &SiteSettingsService{repo: repo, users: users, auth: auth, clubs: clubs, log: log}
}

// Get returns the full stored row, for the admin branding page.
func (s *SiteSettingsService) Get(ctx context.Context) (*model.SiteSettings, error) {
	return s.repo.Get(ctx)
}

// Public returns the branding payload every visitor fetches before the shell
// paints. A database that cannot answer must not take the app down with it:
// the caller gets sub12's own defaults and the site loads unbranded.
func (s *SiteSettingsService) Public(ctx context.Context) *model.PublicSiteSettings {
	settings, err := s.repo.Get(ctx)
	if err != nil {
		s.log.Warn().Err(err).Msg("site settings unavailable — serving defaults")
		fallback := &model.SiteSettings{
			DeploymentMode:     model.DeploymentModeCommunity,
			DefaultTheme:       model.SiteThemeDark,
			AllowThemeToggle:   true,
			PublicRegistration: true,
		}
		return fallback.ToPublic(nil, false)
	}

	var club *model.PrimaryClubSummary
	if settings.PrimaryClubID != nil && *settings.PrimaryClubID != "" {
		club, err = s.repo.PrimaryClub(ctx, *settings.PrimaryClubID)
		if err != nil {
			// A deleted club nulls the column via ON DELETE SET NULL, so this
			// is only reachable mid-delete. Serve the rest of the branding.
			s.log.Warn().Err(err).Msg("primary club unavailable for branding")
			club = nil
		}
	}
	return settings.ToPublic(club, s.needsSetup(ctx, settings))
}

// Status answers "is the wizard still open?" for an unauthenticated caller.
func (s *SiteSettingsService) Status(ctx context.Context) *model.SetupStatus {
	settings, err := s.repo.Get(ctx)
	if err != nil {
		// Unknown is reported as "no setup needed": a deployment whose
		// database is unreachable must not offer a stranger the first-run
		// wizard on the strength of a failed query.
		s.log.Warn().Err(err).Msg("setup status unavailable — reporting complete")
		return &model.SetupStatus{NeedsSetup: false}
	}
	return &model.SetupStatus{NeedsSetup: s.needsSetup(ctx, settings)}
}

// needsSetup is true only when the deployment has never been stamped *and* has
// no administrator. Both halves matter: the stamp catches a fresh install, and
// the administrator check catches a database restored or migrated from
// somewhere the stamp never existed.
func (s *SiteSettingsService) needsSetup(ctx context.Context, settings *model.SiteSettings) bool {
	if settings.SetupCompletedAt != nil {
		return false
	}
	exists, err := s.users.AdminExists(ctx)
	if err != nil {
		s.log.Warn().Err(err).Msg("admin existence check failed — treating setup as complete")
		return false
	}
	return !exists
}

// RegistrationOpen reports whether strangers may create their own accounts. A
// deployment whose settings cannot be read is treated as open: the alternative
// is a transient database fault locking out sign-ups site-wide, and the
// registration path immediately behind this needs the same database anyway.
func (s *SiteSettingsService) RegistrationOpen(ctx context.Context) bool {
	settings, err := s.repo.Get(ctx)
	if err != nil {
		s.log.Warn().Err(err).Msg("registration policy unavailable — allowing sign-up")
		return true
	}
	return settings.PublicRegistration
}

// Update applies an admin patch to the branding.
func (s *SiteSettingsService) Update(ctx context.Context, in *model.UpdateSiteSettingsInput, updatedBy string) (*model.SiteSettings, error) {
	if err := in.Validate(); err != nil {
		return nil, err
	}
	// Switching to single-club mode without a club — either already stored or
	// named in this same patch — would leave the shell pointing nowhere.
	if in.DeploymentMode != nil && *in.DeploymentMode == model.DeploymentModeSingleClub && in.PrimaryClubID == nil {
		current, err := s.repo.Get(ctx)
		if err != nil {
			return nil, err
		}
		if current.PrimaryClubID == nil || *current.PrimaryClubID == "" {
			return nil, fmt.Errorf("%w: choose the club this deployment is for", model.ErrInvalidSiteSettings)
		}
	}
	var by *string
	if updatedBy != "" {
		by = &updatedBy
	}
	return s.repo.Update(ctx, in, by)
}

// SetLogo points the branding at an already-stored image; an empty URL clears
// it and the deployment falls back to its site name.
func (s *SiteSettingsService) SetLogo(ctx context.Context, logoURL, updatedBy string) (*model.SiteSettings, error) {
	var by *string
	if updatedBy != "" {
		by = &updatedBy
	}
	return s.repo.SetLogoURL(ctx, logoURL, by)
}

// SetupResult is what a completed wizard reports back. It deliberately carries
// no tokens: the wizard signs in through the ordinary login endpoint with the
// credentials it just set, so the refresh cookie, the rate limiter and the 2FA
// path are all the same ones every other session goes through.
type SetupResult struct {
	Settings *model.SiteSettings `json:"settings"`
	AdminID  string              `json:"admin_id"`
	ClubID   string              `json:"club_id,omitempty"`
}

// CompleteSetup runs the first-run wizard: it creates the first administrator,
// optionally the club the deployment is for, and stores the branding.
//
// The ordering is the security-relevant part. The deployment is *claimed*
// first, with a conditional UPDATE that exactly one concurrent caller can win.
// Only the winner goes on to create an account. If the winner then fails —
// most likely a duplicate email — the claim is released so the operator can
// try again; if it succeeds, no later submission can ever reach the account
// creation, because both the stamp and the administrator now exist.
func (s *SiteSettingsService) CompleteSetup(ctx context.Context, in *model.SetupInput) (*SetupResult, error) {
	if err := in.Validate(); err != nil {
		return nil, err
	}

	// Pre-flight: an existing administrator closes the wizard regardless of
	// the stamp, and reports the honest reason rather than a lost race.
	adminExists, err := s.users.AdminExists(ctx)
	if err != nil {
		return nil, err
	}
	if adminExists {
		return nil, ErrSetupComplete
	}

	claimed, err := s.repo.ClaimSetup(ctx)
	if err != nil {
		return nil, err
	}
	if !claimed {
		return nil, ErrSetupComplete
	}

	result, err := s.completeClaimed(ctx, in)
	if err != nil {
		// The claim only stands if it produced an administrator. Releasing it
		// on failure is what keeps a mistyped email from bricking the wizard.
		if releaseErr := s.repo.ReleaseSetup(ctx); releaseErr != nil {
			s.log.Error().Err(releaseErr).Msg("failed to release setup claim — the wizard may be stuck")
		}
		return nil, err
	}
	return result, nil
}

// completeClaimed does the work once this caller owns the wizard.
func (s *SiteSettingsService) completeClaimed(ctx context.Context, in *model.SetupInput) (*SetupResult, error) {
	user, _, err := s.auth.Register(ctx, in.Admin.Email, in.Admin.DisplayName, in.Admin.Password)
	if err != nil {
		if errors.Is(err, repository.ErrConflict) {
			return nil, fmt.Errorf("%w: that email address is already registered", model.ErrInvalidSiteSettings)
		}
		return nil, fmt.Errorf("create administrator: %w", err)
	}
	if _, err := s.users.UpdateRole(ctx, user.ID, "admin"); err != nil {
		return nil, fmt.Errorf("promote administrator: %w", err)
	}

	result := &SetupResult{AdminID: user.ID}

	if in.Club != nil {
		clubInput := &model.CreateClubInput{Name: in.Club.Name}
		if d := strings.TrimSpace(in.Club.Description); d != "" {
			clubInput.Description = &d
		}
		if in.Club.Type != "" {
			t := in.Club.Type
			clubInput.Type = &t
		}
		if in.Club.JoinPolicy != "" {
			p := in.Club.JoinPolicy
			clubInput.JoinPolicy = &p
		}
		club, err := s.clubs.Create(ctx, user.ID, clubInput)
		if err != nil {
			return nil, fmt.Errorf("create club: %w", err)
		}
		result.ClubID = club.ID
	}

	var primaryClubID *string
	if result.ClubID != "" {
		primaryClubID = &result.ClubID
	}

	// The claim already stamped setup_completed_at, so this write stores the
	// answers against a row it no longer owns the "IS NULL" condition on —
	// hence a plain Update rather than CompleteSetup.
	settings, err := s.repo.Update(ctx, &model.UpdateSiteSettingsInput{
		SiteName:           &in.SiteName,
		Tagline:            &in.Tagline,
		DeploymentMode:     &in.DeploymentMode,
		PrimaryClubID:      primaryClubID,
		AccentLight:        &in.AccentLight,
		AccentDark:         &in.AccentDark,
		DefaultTheme:       &in.DefaultTheme,
		AllowThemeToggle:   in.AllowThemeToggle,
		WelcomeHeading:     &in.WelcomeHeading,
		WelcomeMessage:     &in.WelcomeMessage,
		SupportEmail:       &in.SupportEmail,
		PublicRegistration: in.PublicRegistration,
	}, &user.ID)
	if err != nil {
		return nil, fmt.Errorf("store branding: %w", err)
	}
	result.Settings = settings

	s.log.Info().
		Str("admin_id", user.ID).
		Str("deployment_mode", in.DeploymentMode).
		Bool("club", result.ClubID != "").
		Msg("first-run setup completed")

	return result, nil
}
