package service

import (
	"context"
	"sort"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

// GalleryRepo is implemented by repository.GalleryRepository.
type GalleryRepo interface {
	ListScoreCards(ctx context.Context, userID string) ([]*model.GalleryItem, error)
	ListGear(ctx context.Context, userID string) ([]*model.GalleryItem, error)
	ListPelletTestImages(ctx context.Context, userID string) ([]*model.GalleryItem, error)
}

// GalleryService assembles a user's uploaded items across every kind that can
// carry a photo into one newest-first list.
type GalleryService struct {
	repo GalleryRepo
}

func NewGalleryService(repo GalleryRepo) *GalleryService {
	return &GalleryService{repo: repo}
}

// ListForUser returns the caller's gallery: score-card photos with their
// submission context, gear photos, and pellet-test photos, merged and sorted
// newest-first.
func (s *GalleryService) ListForUser(ctx context.Context, userID string) ([]*model.GalleryItem, error) {
	cards, err := s.repo.ListScoreCards(ctx, userID)
	if err != nil {
		return nil, err
	}
	gear, err := s.repo.ListGear(ctx, userID)
	if err != nil {
		return nil, err
	}
	tests, err := s.repo.ListPelletTestImages(ctx, userID)
	if err != nil {
		return nil, err
	}

	items := make([]*model.GalleryItem, 0, len(cards)+len(gear)+len(tests))
	items = append(items, cards...)
	items = append(items, gear...)
	items = append(items, tests...)
	sort.SliceStable(items, func(i, j int) bool {
		return items[i].CreatedAt.After(items[j].CreatedAt)
	})
	return items, nil
}
