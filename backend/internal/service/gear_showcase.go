package service

import (
	"context"
	"fmt"
	"strings"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)

// gearPairingLimit and gearRecentCardLimit bound the two list sections of a
// showcase payload so one response stays a fixed size regardless of how much
// gear or history an account has accumulated.
const (
	gearPairingLimit    = 8
	gearRecentCardLimit = 8
)

// GearShowcaseService assembles the gear detail read models. Ownership is
// enforced up front — a showcase is only ever built for gear the caller owns —
// and the community block is only populated when that item is opted in.
type GearShowcaseService struct {
	showcase  *repository.GearShowcaseRepository
	rifles    *repository.RifleRepository
	pellets   *repository.PelletRepository
	simFilter SimulatedContentFilter
}

func NewGearShowcaseService(
	showcase *repository.GearShowcaseRepository,
	rifles *repository.RifleRepository,
	pellets *repository.PelletRepository,
	simFilter SimulatedContentFilter,
) *GearShowcaseService {
	return &GearShowcaseService{showcase: showcase, rifles: rifles, pellets: pellets, simFilter: simFilter}
}

func (s *GearShowcaseService) excludeSimulated() bool {
	return s.simFilter != nil && s.simFilter.ExcludeSimulatedFromPublic()
}

// GetRifleShowcase builds the rifle detail payload for its owner.
func (s *GearShowcaseService) GetRifleShowcase(ctx context.Context, rifleID, userID string) (*model.RifleShowcase, error) {
	rifle, err := s.rifles.GetByID(ctx, rifleID, userID)
	if err != nil {
		return nil, err
	}

	out := &model.RifleShowcase{
		Rifle:    rifle,
		ModelKey: gearModelKey(rifle.Make, rifle.Model),
	}

	personal, err := s.showcase.GetRiflePersonal(ctx, rifleID, userID)
	if err != nil {
		return nil, err
	}
	out.Personal = *personal

	if out.ScoreTrend, err = s.showcase.GetScoreTrend(ctx, "rifle_id", rifleID, userID); err != nil {
		return nil, err
	}
	if out.ScoreDistribution, err = s.showcase.GetScoreDistribution(ctx, "rifle_id", rifleID, userID); err != nil {
		return nil, err
	}
	if out.ShotBreakdown, err = s.showcase.GetShotBreakdown(ctx, "rifle_id", rifleID, userID); err != nil {
		return nil, err
	}
	if out.GroupTrend, err = s.showcase.GetGroupTrend(ctx, "rifle_id", rifleID, userID); err != nil {
		return nil, err
	}
	if out.Pairings, err = s.showcase.GetRiflePairings(ctx, rifleID, userID, gearPairingLimit); err != nil {
		return nil, err
	}
	if out.RecentCards, err = s.showcase.GetRecentCards(ctx, "rifle_id", rifleID, userID, gearRecentCardLimit); err != nil {
		return nil, err
	}

	if !rifle.ComparisonOptIn {
		out.Community = optedOutCommunity()
		return out, nil
	}

	community, err := s.showcase.GetRifleCommunity(ctx, rifle.Make, rifle.Model, userID, s.excludeSimulated())
	if err != nil {
		return nil, err
	}
	out.Community = *community
	return out, nil
}

// GetPelletShowcase builds the pellet detail payload for its owner.
func (s *GearShowcaseService) GetPelletShowcase(ctx context.Context, pelletID, userID string) (*model.PelletShowcase, error) {
	pellet, err := s.pellets.GetByID(ctx, pelletID, userID)
	if err != nil {
		return nil, err
	}

	out := &model.PelletShowcase{
		Pellet:   pellet,
		ModelKey: gearModelKey(pellet.Brand, pellet.Model),
	}

	personal, err := s.showcase.GetPelletPersonal(ctx, pelletID, userID)
	if err != nil {
		return nil, err
	}
	out.Personal = *personal

	if out.ScoreTrend, err = s.showcase.GetScoreTrend(ctx, "pellet_id", pelletID, userID); err != nil {
		return nil, err
	}
	if out.ScoreDistribution, err = s.showcase.GetScoreDistribution(ctx, "pellet_id", pelletID, userID); err != nil {
		return nil, err
	}
	if out.GroupTrend, err = s.showcase.GetGroupTrend(ctx, "pellet_id", pelletID, userID); err != nil {
		return nil, err
	}
	if out.GroupDistribution, err = s.showcase.GetGroupDistribution(ctx, "pellet_id", pelletID, userID); err != nil {
		return nil, err
	}
	if out.Pairings, err = s.showcase.GetPelletPairings(ctx, pelletID, userID, gearPairingLimit); err != nil {
		return nil, err
	}
	if out.RecentCards, err = s.showcase.GetRecentCards(ctx, "pellet_id", pelletID, userID, gearRecentCardLimit); err != nil {
		return nil, err
	}

	if !pellet.ComparisonOptIn {
		out.Community = optedOutCommunity()
		return out, nil
	}

	community, err := s.showcase.GetPelletCommunity(ctx, pellet.Brand, pellet.Model, userID, s.excludeSimulated())
	if err != nil {
		return nil, err
	}
	out.Community = *community
	return out, nil
}

// SetComparisonOptInAll flips every rifle and pellet the user owns in or out of
// public comparison in one call, and reports how many rows changed.
func (s *GearShowcaseService) SetComparisonOptInAll(ctx context.Context, userID string, optIn bool) (rifles, pellets int, err error) {
	rifles, err = s.rifles.SetComparisonOptInAll(ctx, userID, optIn)
	if err != nil {
		return 0, 0, err
	}
	pellets, err = s.pellets.SetComparisonOptInAll(ctx, userID, optIn)
	if err != nil {
		return 0, 0, err
	}
	return rifles, pellets, nil
}

// optedOutCommunity is the community block returned for gear whose owner has
// opted out: no figures, and the flag the UI keys its explanation off.
func optedOutCommunity() model.GearCommunity {
	return model.GearCommunity{
		OptedIn:      false,
		Eligible:     false,
		MinOwners:    model.GearMinComparisonOwners,
		Distribution: []model.GearHistogramBin{},
		Trend:        []model.GearTrendPoint{},
		TopPairings:  []model.GearPairing{},
		Leaders:      []model.GearLeader{},
		GroupLeaders: []model.GearGroupLeader{},
	}
}

// gearModelKey is the normalised cross-user identity of a gear model, matching
// the key the comparison queries group on. Surfaced so the UI can show which
// model a comparison is drawn from.
func gearModelKey(makeOrBrand, modelName string) string {
	return fmt.Sprintf("%s|%s",
		strings.ToLower(strings.TrimSpace(makeOrBrand)),
		strings.ToLower(strings.TrimSpace(modelName)))
}
