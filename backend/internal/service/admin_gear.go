package service

import (
	"context"
	"strings"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)

// adminGearComboLimit and adminGearTopLimit bound the dashboard's leaderboard
// sections; adminGearAdoptionMonths is the trailing window of the adoption chart.
const (
	adminGearComboLimit     = 12
	adminGearTopLimit       = 10
	adminGearAdoptionMonths = 12
	adminGearOwnerLimit     = 50
)

// AdminGearService assembles the site-wide gear analytics dashboard.
type AdminGearService struct {
	repo *repository.AdminGearRepository
}

func NewAdminGearService(repo *repository.AdminGearRepository) *AdminGearService {
	return &AdminGearService{repo: repo}
}

// GetStats builds the whole admin gear dashboard in one payload.
func (s *AdminGearService) GetStats(ctx context.Context) (*model.AdminGearStats, error) {
	totals, err := s.repo.GetTotals(ctx)
	if err != nil {
		return nil, err
	}

	topRifles, _, err := s.repo.ListModels(ctx, "rifle", "", "owners", adminGearTopLimit, 0)
	if err != nil {
		return nil, err
	}
	topPellets, _, err := s.repo.ListModels(ctx, "pellet", "", "owners", adminGearTopLimit, 0)
	if err != nil {
		return nil, err
	}
	combos, err := s.repo.GetTopCombos(ctx, adminGearComboLimit)
	if err != nil {
		return nil, err
	}
	calibre, makes, brands, weights, power, err := s.repo.GetSlices(ctx)
	if err != nil {
		return nil, err
	}
	adoption, err := s.repo.GetAdoption(ctx, adminGearAdoptionMonths)
	if err != nil {
		return nil, err
	}

	stats := &model.AdminGearStats{
		Totals:            *totals,
		TopRifles:         make([]model.AdminGearModel, 0, len(topRifles)),
		TopPellets:        make([]model.AdminGearModel, 0, len(topPellets)),
		TopCombos:         make([]model.AdminGearCombo, 0, len(combos)),
		CalibreSplit:      calibre,
		RifleMakeSplit:    makes,
		PelletBrandSplit:  brands,
		PelletWeightSplit: weights,
		PowerSplit:        power,
		Adoption:          adoption,
	}
	for _, m := range topRifles {
		stats.TopRifles = append(stats.TopRifles, *m)
	}
	for _, m := range topPellets {
		stats.TopPellets = append(stats.TopPellets, *m)
	}
	for _, c := range combos {
		stats.TopCombos = append(stats.TopCombos, *c)
	}
	return stats, nil
}

// ListModels returns one page of the gear model leaderboard. kind is coerced
// to "rifle" unless the caller explicitly asked for pellets.
func (s *AdminGearService) ListModels(ctx context.Context, kind, q, sort string, limit, offset int) ([]*model.AdminGearModel, int, error) {
	return s.repo.ListModels(ctx, normaliseGearKind(kind), q, sort, limit, offset)
}

// GetModelDetail is the admin drill-down for one gear model: its aggregate row,
// every owner running it, and the site-wide score trend for that model.
func (s *AdminGearService) GetModelDetail(ctx context.Context, kind, make, modelName string) (*model.AdminGearModelDetail, error) {
	kind = normaliseGearKind(kind)

	rows, _, err := s.repo.ListModels(ctx, kind, make, "owners", 200, 0)
	if err != nil {
		return nil, err
	}
	detail := &model.AdminGearModelDetail{
		Model: model.AdminGearModel{Kind: kind, Make: make, Model: modelName},
	}
	for _, row := range rows {
		if strings.EqualFold(row.Make, make) && strings.EqualFold(row.Model, modelName) {
			detail.Model = *row
			break
		}
	}

	if detail.Owners, err = s.repo.GetModelOwners(ctx, kind, make, modelName, adminGearOwnerLimit); err != nil {
		return nil, err
	}
	if detail.Trend, err = s.repo.GetModelTrend(ctx, kind, make, modelName); err != nil {
		return nil, err
	}
	return detail, nil
}

func normaliseGearKind(kind string) string {
	if kind == "pellet" {
		return "pellet"
	}
	return "rifle"
}
