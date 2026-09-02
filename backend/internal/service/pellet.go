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
	if err := validatePelletText(&in.Brand, &in.Model, in.BatchCode, in.Notes); err != nil {
		return nil, err
	}
	return s.pellets.Create(ctx, userID, in)
}

// validatePelletText caps the free-text fields a pellet carries. They are
// re-served on the gear showcase, the public pellet leaderboard and the admin
// gear leaderboard, so an unbounded value is paid for on every read.
func validatePelletText(brand, model, batchCode, notes *string) error {
	if overLength(brand, maxShortDetailLen) {
		return fmt.Errorf("%w: brand must be %d characters or fewer", ErrInvalidGear, maxShortDetailLen)
	}
	if overLength(model, maxShortDetailLen) {
		return fmt.Errorf("%w: model must be %d characters or fewer", ErrInvalidGear, maxShortDetailLen)
	}
	if overLength(batchCode, maxShortDetailLen) {
		return fmt.Errorf("%w: batch_code must be %d characters or fewer", ErrInvalidGear, maxShortDetailLen)
	}
	if overLength(notes, maxFreeNotesLen) {
		return fmt.Errorf("%w: notes must be %d characters or fewer", ErrInvalidGear, maxFreeNotesLen)
	}
	return nil
}

func (s *PelletService) List(ctx context.Context, userID string, activeOnly bool) ([]*model.Pellet, error) {
	return s.pellets.ListByUser(ctx, userID, activeOnly)
}

func (s *PelletService) GetByID(ctx context.Context, id, userID string) (*model.Pellet, error) {
	return s.pellets.GetByID(ctx, id, userID)
}

func (s *PelletService) Update(ctx context.Context, id, userID string, in *model.UpdatePelletInput) (*model.Pellet, error) {
	if err := validatePelletText(in.Brand, in.Model, in.BatchCode, in.Notes); err != nil {
		return nil, err
	}
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
