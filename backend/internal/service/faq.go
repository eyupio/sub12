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

var ErrInvalidFAQ = errors.New("invalid faq")

var faqSlugRe = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

type FAQService struct {
	repo *repository.FAQRepository
}

func NewFAQService(repo *repository.FAQRepository) *FAQService {
	return &FAQService{repo: repo}
}

func (s *FAQService) List(ctx context.Context, onlyPublished bool) ([]*model.FAQ, error) {
	return s.repo.List(ctx, onlyPublished)
}

func (s *FAQService) GetByID(ctx context.Context, id string) (*model.FAQ, error) {
	return s.repo.GetByID(ctx, id)
}

func (s *FAQService) GetBySlug(ctx context.Context, slug string) (*model.FAQ, error) {
	return s.repo.GetBySlug(ctx, slug)
}

func (s *FAQService) Create(ctx context.Context, input *model.CreateFAQInput, updatedBy string) (*model.FAQ, error) {
	item := &model.FAQ{
		Slug:        strings.TrimSpace(input.Slug),
		Category:    strings.TrimSpace(input.Category),
		Question:    strings.TrimSpace(input.Question),
		AnswerMD:    input.AnswerMD,
		SortOrder:   input.SortOrder,
		IsPublished: true,
	}
	if input.IsPublished != nil {
		item.IsPublished = *input.IsPublished
	}

	if err := validateFAQ(item); err != nil {
		return nil, err
	}
	return s.repo.Create(ctx, item, updatedBy)
}

func (s *FAQService) Update(ctx context.Context, id string, input *model.UpdateFAQInput, updatedBy string) (*model.FAQ, error) {
	current, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	next := *current
	if input.Slug != nil {
		next.Slug = strings.TrimSpace(*input.Slug)
	}
	if input.Category != nil {
		next.Category = strings.TrimSpace(*input.Category)
	}
	if input.Question != nil {
		next.Question = strings.TrimSpace(*input.Question)
	}
	if input.AnswerMD != nil {
		next.AnswerMD = *input.AnswerMD
	}
	if input.SortOrder != nil {
		next.SortOrder = *input.SortOrder
	}
	if input.IsPublished != nil {
		next.IsPublished = *input.IsPublished
	}

	if err := validateFAQ(&next); err != nil {
		return nil, err
	}
	return s.repo.Update(ctx, id, &next, updatedBy)
}

func (s *FAQService) Delete(ctx context.Context, id string) error {
	return s.repo.Delete(ctx, id)
}

func validateFAQ(item *model.FAQ) error {
	if !faqSlugRe.MatchString(item.Slug) {
		return fmt.Errorf("%w: slug must be lowercase kebab-case (a-z, 0-9, hyphens)", ErrInvalidFAQ)
	}
	if item.Category == "" {
		return fmt.Errorf("%w: category is required", ErrInvalidFAQ)
	}
	if item.Question == "" {
		return fmt.Errorf("%w: question is required", ErrInvalidFAQ)
	}
	if strings.TrimSpace(item.AnswerMD) == "" {
		return fmt.Errorf("%w: answer_md is required", ErrInvalidFAQ)
	}
	return nil
}
