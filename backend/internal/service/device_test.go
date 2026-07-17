package service

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/rs/zerolog"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

func TestDeviceService_Register_Validation(t *testing.T) {
	// A nil repo is safe here: every case fails validation and returns before
	// the repository is touched.
	svc := NewDeviceService(nil)

	cases := []struct {
		name string
		in   *model.RegisterDeviceInput
		want error
	}{
		{"nil input", nil, ErrInvalidDeviceToken},
		{"empty token", &model.RegisterDeviceInput{Token: "  ", Platform: "ios"}, ErrInvalidDeviceToken},
		{"missing platform", &model.RegisterDeviceInput{Token: "abc", Platform: ""}, ErrInvalidDevicePlatform},
		{"bad platform", &model.RegisterDeviceInput{Token: "abc", Platform: "windows"}, ErrInvalidDevicePlatform},
		{"token too long", &model.RegisterDeviceInput{Token: strings.Repeat("a", maxDeviceTokenLen+1), Platform: "ios"}, ErrInvalidDeviceToken},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := svc.Register(context.Background(), "user-1", tc.in)
			if !errors.Is(err, tc.want) {
				t.Fatalf("Register: got %v, want %v", err, tc.want)
			}
		})
	}
}

func TestDeviceService_Unregister_Validation(t *testing.T) {
	svc := NewDeviceService(nil)
	if err := svc.Unregister(context.Background(), "user-1", "   "); !errors.Is(err, ErrInvalidDeviceToken) {
		t.Fatalf("Unregister empty token: got %v, want %v", err, ErrInvalidDeviceToken)
	}
	oversized := strings.Repeat("a", maxDeviceTokenLen+1)
	if err := svc.Unregister(context.Background(), "user-1", oversized); !errors.Is(err, ErrInvalidDeviceToken) {
		t.Fatalf("Unregister oversized token: got %v, want %v", err, ErrInvalidDeviceToken)
	}
}

func TestNoopPushSender_DoesNotPanic(t *testing.T) {
	s := NewNoopPushSender(zerolog.Nop())
	// Must be safe with any input — it's called best-effort from fan-out.
	s.Send(context.Background(), []string{"t1", "t2"}, PushMessage{Title: "Hi", Body: "There"})
	s.Send(context.Background(), nil, PushMessage{})
}
