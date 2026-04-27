package service

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)

var (
	ErrCategoryNotFound = errors.New("category not found")
	ErrInvalidCategory  = errors.New("invalid category")
	ErrCategoryConflict = errors.New("category slug already in use")
)

var categorySlugPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9_.-]{0,40}$`)

type CategoryService struct {
	repo *repository.CategoryRepository
}

func NewCategoryService(repo *repository.CategoryRepository) *CategoryService {
	return &CategoryService{repo: repo}
}

// ListPublic returns active categories for clients (event-create form).
func (s *CategoryService) ListPublic(ctx context.Context) ([]*model.Category, error) {
	return s.repo.List(ctx, true)
}

// AdminList returns every category, including disabled rows.
func (s *CategoryService) AdminList(ctx context.Context) ([]*model.Category, error) {
	return s.repo.List(ctx, false)
}

func (s *CategoryService) Create(ctx context.Context, in *model.CreateCategoryInput) (*model.Category, error) {
	in.Slug = strings.TrimSpace(strings.ToLower(in.Slug))
	in.Label = strings.TrimSpace(in.Label)
	if !categorySlugPattern.MatchString(in.Slug) {
		return nil, fmt.Errorf("%w: slug must be lowercase alphanumerics, optionally separated by . _ -", ErrInvalidCategory)
	}
	if in.Label == "" {
		return nil, fmt.Errorf("%w: label is required", ErrInvalidCategory)
	}
	cat, err := s.repo.Create(ctx, in)
	if errors.Is(err, repository.ErrConflict) {
		return nil, ErrCategoryConflict
	}
	return cat, err
}

func (s *CategoryService) Update(ctx context.Context, id string, in *model.UpdateCategoryInput) (*model.Category, error) {
	if in.Slug != nil {
		s := strings.TrimSpace(strings.ToLower(*in.Slug))
		if !categorySlugPattern.MatchString(s) {
			return nil, fmt.Errorf("%w: slug must be lowercase alphanumerics, optionally separated by . _ -", ErrInvalidCategory)
		}
		in.Slug = &s
	}
	if in.Label != nil {
		l := strings.TrimSpace(*in.Label)
		if l == "" {
			return nil, fmt.Errorf("%w: label cannot be blank", ErrInvalidCategory)
		}
		in.Label = &l
	}
	cat, err := s.repo.Update(ctx, id, in)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, ErrCategoryNotFound
	}
	if errors.Is(err, repository.ErrConflict) {
		return nil, ErrCategoryConflict
	}
	return cat, err
}

func (s *CategoryService) Delete(ctx context.Context, id string) error {
	err := s.repo.Delete(ctx, id)
	if errors.Is(err, repository.ErrNotFound) {
		return ErrCategoryNotFound
	}
	return err
}
