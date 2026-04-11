package service

import (
	"context"
	"errors"
	"fmt"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)

var ErrInvalidGear = errors.New("invalid gear input")

type RifleService struct {
	rifles *repository.RifleRepository
}

func NewRifleService(rifles *repository.RifleRepository) *RifleService {
	return &RifleService{rifles: rifles}
}

func (s *RifleService) Create(ctx context.Context, userID string, in *model.CreateRifleInput) (*model.Rifle, error) {
	if in.Make == "" || in.Model == "" {
		return nil, fmt.Errorf("%w: make and model are required", ErrInvalidGear)
	}
	return s.rifles.Create(ctx, userID, in)
}

func (s *RifleService) List(ctx context.Context, userID string, activeOnly bool) ([]*model.Rifle, error) {
	return s.rifles.ListByUser(ctx, userID, activeOnly)
}

func (s *RifleService) Update(ctx context.Context, id, userID string, in *model.UpdateRifleInput) (*model.Rifle, error) {
	rifle, err := s.rifles.Update(ctx, id, userID, in)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, repository.ErrNotFound
		}
		return nil, err
	}
	return rifle, nil
}

func (s *RifleService) Delete(ctx context.Context, id, userID string) error {
	return s.rifles.Delete(ctx, id, userID)
}
