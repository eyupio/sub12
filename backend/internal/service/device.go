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

// maxDeviceTokenLen caps stored push tokens. Real FCM tokens are ~163 chars,
// APNs tokens 64 hex chars, and Web Push endpoints usually <512 bytes; 4096
// leaves generous headroom while stopping an attacker from filling the
// device_tokens table with 1 MiB blobs (the JSON decoder's per-request cap).
const maxDeviceTokenLen = 4096

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
	if token == "" || len(token) > maxDeviceTokenLen {
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
	if token == "" || len(token) > maxDeviceTokenLen {
		return ErrInvalidDeviceToken
	}
	return s.repo.Delete(ctx, userID, token)
}
