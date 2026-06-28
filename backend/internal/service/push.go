package service

import (
	"context"

	"github.com/rs/zerolog"
)

// PushMessage is a single push-notification payload destined for one or more
// device tokens.
type PushMessage struct {
	Title string
	Body  string
	// Data carries structured fields (e.g. notification type, target id) for the
	// client to deep-link on tap. Values are strings to match FCM/APNs data
	// payload constraints.
	Data map[string]string
}

// PushSender delivers push notifications to device tokens. Implementations are
// called best-effort from notification fan-out, so they must never block the
// caller for long and never panic. The transport (FCM / APNs) is pluggable;
// until one is configured the NoopPushSender is wired in.
type PushSender interface {
	Send(ctx context.Context, tokens []string, msg PushMessage)
}

// NoopPushSender is the default sender used until an FCM/APNs transport is
// configured. It records that a delivery would have happened without sending,
// so the rest of the pipeline (registration, fan-out, preferences) is fully
// exercised in development and tests.
type NoopPushSender struct {
	logger zerolog.Logger
}

func NewNoopPushSender(logger zerolog.Logger) *NoopPushSender {
	return &NoopPushSender{logger: logger}
}

func (s *NoopPushSender) Send(_ context.Context, tokens []string, msg PushMessage) {
	s.logger.Debug().
		Int("tokens", len(tokens)).
		Str("title", msg.Title).
		Msg("push transport not configured; skipping delivery")
}
