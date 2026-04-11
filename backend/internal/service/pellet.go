package service

import (
	"context"
	"errors"
	"fmt"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)

type PelletService struct {
	pellets *repository.PelletRepository
}

func NewPelletService(pellets *repository.PelletRepository) *PelletService {
	return &PelletService{pellets: pellets}
}

func (s *PelletService) Create(ctx context.Context, userID string, in *model.CreatePelletInput) (*model.Pellet, error) {
	if in.Brand == "" || in.Model == "" {
		return nil, fmt.Errorf("%w: brand and model are required", ErrInvalidGear)
	}
	return s.pellets.Create(ctx, userID, in)
}

func (s *PelletService) List(ctx context.Context, userID string, activeOnly bool) ([]*model.Pellet, error) {
	return s.pellets.ListByUser(ctx, userID, activeOnly)
}

func (s *PelletService) GetByID(ctx context.Context, id, userID string) (*model.Pellet, error) {
	return s.pellets.GetByID(ctx, id, userID)
}

func (s *PelletService) Update(ctx context.Context, id, userID string, in *model.UpdatePelletInput) (*model.Pellet, error) {
	pellet, err := s.pellets.Update(ctx, id, userID, in)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, repository.ErrNotFound
		}
		return nil, err
	}
	return pellet, nil
}

func (s *PelletService) UpdateImageURL(ctx context.Context, id, userID, imageURL string) (*model.Pellet, error) {
	return s.pellets.UpdateImageURL(ctx, id, userID, imageURL)
}

func (s *PelletService) Delete(ctx context.Context, id, userID string) error {
	return s.pellets.Delete(ctx, id, userID)
}
