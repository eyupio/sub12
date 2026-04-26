package service

import (
	"context"
	"fmt"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)

type LocationService struct {
	locations *repository.LocationRepository
}

func NewLocationService(locations *repository.LocationRepository) *LocationService {
	return &LocationService{locations: locations}
}

func (s *LocationService) Create(ctx context.Context, userID string, in *model.CreateLocationInput) (*model.Location, error) {
	if in.Name == "" {
		return nil, fmt.Errorf("%w: name is required", ErrInvalidGear)
	}
	return s.locations.Create(ctx, userID, in)
}

func (s *LocationService) List(ctx context.Context, userID string) ([]*model.Location, error) {
	return s.locations.ListByUser(ctx, userID)
}

func (s *LocationService) GetByID(ctx context.Context, id, userID string) (*model.Location, error) {
	return s.locations.GetByID(ctx, id, userID)
}

func (s *LocationService) Update(ctx context.Context, id, userID string, in *model.UpdateLocationInput) (*model.Location, error) {
	loc, err := s.locations.Update(ctx, id, userID, in)
	if err != nil {
		if err == repository.ErrNotFound {
			return nil, repository.ErrNotFound
		}
		return nil, err
	}
	return loc, nil
}

func (s *LocationService) Delete(ctx context.Context, id, userID string) error {
	return s.locations.Delete(ctx, id, userID)
}
