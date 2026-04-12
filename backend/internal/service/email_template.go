package service

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"

	"github.com/jnnngs/sub-12/backend/internal/email"
	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)

var (
	ErrInvalidEmailTemplate = errors.New("invalid email template")
	ErrTemplateRender       = errors.New("email template render error")
)

type EmailTemplateService struct {
	repo     *repository.EmailTemplateRepository
	renderer *email.Renderer
}

func NewEmailTemplateService(repo *repository.EmailTemplateRepository, renderer *email.Renderer) *EmailTemplateService {
	return &EmailTemplateService{repo: repo, renderer: renderer}
}

func (s *EmailTemplateService) List(ctx context.Context) ([]*model.EmailTemplate, error) {
	return s.repo.List(ctx)
}

func (s *EmailTemplateService) GetByKey(ctx context.Context, key string) (*model.EmailTemplate, error) {
	return s.repo.GetByKey(ctx, key)
}

func (s *EmailTemplateService) UpdateByKey(ctx context.Context, key string, input *model.UpdateEmailTemplateInput, updatedBy string) (*model.EmailTemplate, error) {
	current, err := s.repo.GetByKey(ctx, key)
	if err != nil {
		return nil, err
	}

	next := *current
	if input.SubjectTemplate != nil {
		next.SubjectTemplate = *input.SubjectTemplate
	}
	if input.HTMLTemplate != nil {
		next.HTMLTemplate = *input.HTMLTemplate
	}
	if input.TextTemplate != nil {
		next.TextTemplate = *input.TextTemplate
	}
	if input.IsEnabled != nil {
		next.IsEnabled = *input.IsEnabled
	}

	if err := validateTemplate(&next); err != nil {
		return nil, err
	}

	return s.repo.Update(ctx, &next, updatedBy)
}

func (s *EmailTemplateService) Preview(ctx context.Context, key string, payload map[string]any) (*model.RenderedEmailTemplate, error) {
	tpl, err := s.repo.GetByKey(ctx, key)
	if err != nil {
		return nil, err
	}
	subject, err := s.renderer.RenderSubject(tpl.SubjectTemplate, payload)
	if err != nil {
		return nil, fmt.Errorf("%w: subject: %v", ErrTemplateRender, err)
	}
	htmlBody, err := s.renderer.RenderHTML(tpl.HTMLTemplate, payload)
	if err != nil {
		return nil, fmt.Errorf("%w: html: %v", ErrTemplateRender, err)
	}
	textBody, err := s.renderer.RenderText(tpl.TextTemplate, payload)
	if err != nil {
		return nil, fmt.Errorf("%w: text: %v", ErrTemplateRender, err)
	}
	return &model.RenderedEmailTemplate{Subject: subject, HTML: htmlBody, Text: textBody}, nil
}

func validateTemplate(item *model.EmailTemplate) error {
	if item.IsEnabled {
		if strings.TrimSpace(item.SubjectTemplate) == "" {
			return fmt.Errorf("%w: subject_template is required when enabled", ErrInvalidEmailTemplate)
		}
		if strings.TrimSpace(item.HTMLTemplate) == "" {
			return fmt.Errorf("%w: html_template is required when enabled", ErrInvalidEmailTemplate)
		}
		if strings.TrimSpace(item.TextTemplate) == "" {
			return fmt.Errorf("%w: text_template is required when enabled", ErrInvalidEmailTemplate)
		}
	}

	for _, placeholder := range requiredPlaceholders(item.Key) {
		if !hasPlaceholder(item.SubjectTemplate, placeholder) && !hasPlaceholder(item.HTMLTemplate, placeholder) && !hasPlaceholder(item.TextTemplate, placeholder) {
			return fmt.Errorf("%w: placeholder {{%s}} is required for key %q", ErrInvalidEmailTemplate, placeholder, item.Key)
		}
	}

	return nil
}

func requiredPlaceholders(key string) []string {
	switch {
	case key == "forgot_password":
		return []string{"reset_link"}
	case key == "welcome":
		return []string{"display_name"}
	case strings.HasPrefix(key, "notification_"):
		return []string{"notification_body"}
	default:
		return nil
	}
}

func hasPlaceholder(body, name string) bool {
	re := regexp.MustCompile(`{{\s*\.?` + regexp.QuoteMeta(name) + `\s*}}`)
	return re.MatchString(body)
}
