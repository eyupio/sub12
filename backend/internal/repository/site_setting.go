package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

type SiteSettingsRepository struct {
	db *pgxpool.Pool
}

func NewSiteSettingsRepository(db *pgxpool.Pool) *SiteSettingsRepository {
	return &SiteSettingsRepository{db: db}
}

const siteSettingsColumns = `
	id, site_name, tagline, deployment_mode, primary_club_id::text, logo_url,
	accent_light, accent_dark, default_theme, allow_theme_toggle,
	welcome_heading, welcome_message, support_email, public_registration,
	setup_completed_at, updated_by::text, updated_at`

func scanSiteSettings(row pgx.Row) (*model.SiteSettings, error) {
	var s model.SiteSettings
	if err := row.Scan(
		&s.ID, &s.SiteName, &s.Tagline, &s.DeploymentMode, &s.PrimaryClubID, &s.LogoURL,
		&s.AccentLight, &s.AccentDark, &s.DefaultTheme, &s.AllowThemeToggle,
		&s.WelcomeHeading, &s.WelcomeMessage, &s.SupportEmail, &s.PublicRegistration,
		&s.SetupCompletedAt, &s.UpdatedBy, &s.UpdatedAt,
	); err != nil {
		return nil, err
	}
	return &s, nil
}

// Get returns the singleton. The row is created by the migration, so a missing
// one is a genuinely broken database rather than a first-run condition.
func (r *SiteSettingsRepository) Get(ctx context.Context) (*model.SiteSettings, error) {
	s, err := scanSiteSettings(r.db.QueryRow(ctx, `SELECT `+siteSettingsColumns+` FROM site_settings WHERE id = 1`))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get site settings: %w", err)
	}
	return s, nil
}

// Update applies a patch. Every column uses COALESCE against the supplied
// pointer, so an omitted field keeps its stored value in one statement rather
// than needing a read-modify-write.
func (r *SiteSettingsRepository) Update(ctx context.Context, in *model.UpdateSiteSettingsInput, updatedBy *string) (*model.SiteSettings, error) {
	// primary_club_id is the one nullable column, so it cannot ride on
	// COALESCE: an empty string clears it and a NULL keeps it.
	s, err := scanSiteSettings(r.db.QueryRow(ctx, `
		UPDATE site_settings SET
			site_name           = COALESCE($1, site_name),
			tagline             = COALESCE($2, tagline),
			deployment_mode     = COALESCE($3, deployment_mode),
			primary_club_id     = CASE
			                        WHEN $4::text IS NULL THEN primary_club_id
			                        WHEN $4::text = ''    THEN NULL
			                        ELSE $4::uuid
			                      END,
			accent_light        = COALESCE($5, accent_light),
			accent_dark         = COALESCE($6, accent_dark),
			default_theme       = COALESCE($7, default_theme),
			allow_theme_toggle  = COALESCE($8, allow_theme_toggle),
			welcome_heading     = COALESCE($9, welcome_heading),
			welcome_message     = COALESCE($10, welcome_message),
			support_email       = COALESCE($11, support_email),
			public_registration = COALESCE($12, public_registration),
			updated_by          = COALESCE($13::uuid, updated_by),
			updated_at          = NOW()
		WHERE id = 1
		RETURNING `+siteSettingsColumns,
		in.SiteName, in.Tagline, in.DeploymentMode, in.PrimaryClubID,
		in.AccentLight, in.AccentDark, in.DefaultTheme, in.AllowThemeToggle,
		in.WelcomeHeading, in.WelcomeMessage, in.SupportEmail, in.PublicRegistration,
		updatedBy,
	))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("update site settings: %w", err)
	}
	return s, nil
}

// SetLogoURL stores (or, with an empty string, clears) the branding logo.
func (r *SiteSettingsRepository) SetLogoURL(ctx context.Context, logoURL string, updatedBy *string) (*model.SiteSettings, error) {
	s, err := scanSiteSettings(r.db.QueryRow(ctx, `
		UPDATE site_settings
		SET logo_url = $1, updated_by = COALESCE($2::uuid, updated_by), updated_at = NOW()
		WHERE id = 1
		RETURNING `+siteSettingsColumns, logoURL, updatedBy))
	if err != nil {
		return nil, fmt.Errorf("set site logo: %w", err)
	}
	return s, nil
}

// ClaimSetup stamps the deployment as set up before anything else happens, and
// reports whether this caller is the one that got there first. Claiming up
// front means a submission that then fails part-way (a duplicate email, say)
// cannot be retried into a second administrator — see the service.
func (r *SiteSettingsRepository) ClaimSetup(ctx context.Context) (bool, error) {
	tag, err := r.db.Exec(ctx, `
		UPDATE site_settings
		SET setup_completed_at = NOW(), updated_at = NOW()
		WHERE id = 1 AND setup_completed_at IS NULL`)
	if err != nil {
		return false, fmt.Errorf("claim setup: %w", err)
	}
	return tag.RowsAffected() == 1, nil
}

// ReleaseSetup undoes a claim. Used only when the claiming request fails
// before it creates an administrator: leaving the deployment stamped would
// lock the operator out of the wizard with no account to log in with.
func (r *SiteSettingsRepository) ReleaseSetup(ctx context.Context) error {
	if _, err := r.db.Exec(ctx, `
		UPDATE site_settings
		SET setup_completed_at = NULL, updated_at = NOW()
		WHERE id = 1`); err != nil {
		return fmt.Errorf("release setup: %w", err)
	}
	return nil
}

// PrimaryClub reads the summary the shell needs to link to the club a
// single-club deployment was set up for.
func (r *SiteSettingsRepository) PrimaryClub(ctx context.Context, clubID string) (*model.PrimaryClubSummary, error) {
	var c model.PrimaryClubSummary
	var slug, imageURL *string
	err := r.db.QueryRow(ctx, `
		SELECT id::text, name, slug, image_url FROM clubs WHERE id = $1::uuid
	`, clubID).Scan(&c.ID, &c.Name, &slug, &imageURL)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get primary club: %w", err)
	}
	if slug != nil {
		c.Slug = *slug
	}
	if imageURL != nil {
		c.ImageURL = *imageURL
	}
	return &c, nil
}
