package service

import (
	"context"
	"errors"
	"strings"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)

var (
	ErrInvalidDeviceToken    = errors.New("device token is required")
	ErrInvalidDevicePlatform = errors.New("platform must be one of ios, android, web")
)

type DeviceService struct {
	repo *repository.DeviceRepository
}

func NewDeviceService(repo *repository.DeviceRepository) *DeviceService {
	return &DeviceService{repo: repo}
}

func validPlatform(p string) bool {
	switch p {
	case "ios", "android", "web":
		return true
	default:
		return false
	}
}

// Register stores (or refreshes) a push token for the user's device.
func (s *DeviceService) Register(ctx context.Context, userID string, in *model.RegisterDeviceInput) error {
	if in == nil {
		return ErrInvalidDeviceToken
	}
	token := strings.TrimSpace(in.Token)
	if token == "" {
		return ErrInvalidDeviceToken
	}
	platform := strings.ToLower(strings.TrimSpace(in.Platform))
	if !validPlatform(platform) {
		return ErrInvalidDevicePlatform
	}
	return s.repo.Upsert(ctx, userID, token, platform)
}

// Unregister removes a push token for the user (e.g. on logout). Returns
// repository.ErrNotFound when the token wasn't registered to this user.
func (s *DeviceService) Unregister(ctx context.Context, userID, token string) error {
	token = strings.TrimSpace(token)
	if token == "" {
		return ErrInvalidDeviceToken
	}
	return s.repo.Delete(ctx, userID, token)
}
