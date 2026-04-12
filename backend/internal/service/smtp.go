package service

import (
	"context"
	"errors"
	"fmt"
	"net/mail"
	"strings"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)

var ErrInvalidSMTPSettings = errors.New("invalid smtp settings")

type SMTPService struct {
	repo *repository.SMTPRepository
}

func NewSMTPService(repo *repository.SMTPRepository) *SMTPService {
	return &SMTPService{repo: repo}
}

func (s *SMTPService) GetSMTPSettings(ctx context.Context) (*model.SMTPSettingsResponse, error) {
	settings, err := s.repo.GetSMTPSettings(ctx)
	if err != nil {
		return nil, err
	}
	return settings.ToResponse(), nil
}

func (s *SMTPService) UpsertSMTPSettings(ctx context.Context, input *model.UpsertSMTPSettingsInput, updatedBy string) (*model.SMTPSettingsResponse, error) {
	if err := validateSMTPSettings(input); err != nil {
		return nil, err
	}
	settings, err := s.repo.UpsertSMTPSettings(ctx, input, updatedBy)
	if err != nil {
		return nil, err
	}
	return settings.ToResponse(), nil
}

func validateSMTPSettings(in *model.UpsertSMTPSettingsInput) error {
	if strings.TrimSpace(in.Host) == "" {
		return fmt.Errorf("%w: host is required", ErrInvalidSMTPSettings)
	}
	if in.Port < 1 || in.Port > 65535 {
		return fmt.Errorf("%w: port must be between 1 and 65535", ErrInvalidSMTPSettings)
	}
	if _, err := mail.ParseAddress(in.FromEmail); err != nil {
		return fmt.Errorf("%w: from_email must be a valid email", ErrInvalidSMTPSettings)
	}
	if in.UseTLS && in.UseSTARTTLS {
		return fmt.Errorf("%w: use_tls and use_starttls cannot both be true", ErrInvalidSMTPSettings)
	}
	return nil
}
