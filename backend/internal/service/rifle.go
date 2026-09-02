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
	if err := validateRifleText(&in.Make, &in.Model, &in.Calibre, in.TuneNotes); err != nil {
		return nil, err
	}
	return s.rifles.Create(ctx, userID, in)
}

// validateRifleText caps the free-text fields a rifle carries. They are
// re-served on the gear showcase and the admin gear leaderboard, so an
// unbounded value is paid for on every read, not just on the write.
func validateRifleText(make, model, calibre, tuneNotes *string) error {
	if overLength(make, maxShortDetailLen) {
		return fmt.Errorf("%w: make must be %d characters or fewer", ErrInvalidGear, maxShortDetailLen)
	}
	if overLength(model, maxShortDetailLen) {
		return fmt.Errorf("%w: model must be %d characters or fewer", ErrInvalidGear, maxShortDetailLen)
	}
	if overLength(calibre, maxShortDetailLen) {
		return fmt.Errorf("%w: calibre must be %d characters or fewer", ErrInvalidGear, maxShortDetailLen)
	}
	if overLength(tuneNotes, maxFreeNotesLen) {
		return fmt.Errorf("%w: tune_notes must be %d characters or fewer", ErrInvalidGear, maxFreeNotesLen)
	}
	return nil
}

func (s *RifleService) List(ctx context.Context, userID string, activeOnly bool) ([]*model.Rifle, error) {
	return s.rifles.ListByUser(ctx, userID, activeOnly)
}

func (s *RifleService) GetByID(ctx context.Context, id, userID string) (*model.Rifle, error) {
	return s.rifles.GetByID(ctx, id, userID)
}

func (s *RifleService) Update(ctx context.Context, id, userID string, in *model.UpdateRifleInput) (*model.Rifle, error) {
	if err := validateRifleText(in.Make, in.Model, in.Calibre, in.TuneNotes); err != nil {
		return nil, err
	}
	rifle, err := s.rifles.Update(ctx, id, userID, in)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, repository.ErrNotFound
		}
		return nil, err
	}
	return rifle, nil
}

func (s *RifleService) UpdateImageURL(ctx context.Context, id, userID, imageURL string) (*model.Rifle, error) {
	return s.rifles.UpdateImageURL(ctx, id, userID, imageURL)
}

func (s *RifleService) Delete(ctx context.Context, id, userID string) error {
	return s.rifles.Delete(ctx, id, userID)
}
