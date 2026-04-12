package service

import (
	"context"
	"encoding/json"
	"time"

	"github.com/rs/zerolog"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)

type ActivityService struct {
	repo *repository.ActivityRepository
	log  zerolog.Logger
}

func NewActivityService(repo *repository.ActivityRepository, log zerolog.Logger) *ActivityService {
	return &ActivityService{repo: repo, log: log}
}

// Ingest writes an activity event. It is intended to be called as a goroutine
// (fire-and-forget). Always use context.Background() as the context when calling
// from a goroutine to avoid cancellation when the HTTP handler returns.
func (s *ActivityService) Ingest(ctx context.Context, userID string, actType model.ActivityType, targetID, targetType *string, meta any) {
	b, err := json.Marshal(meta)
	if err != nil {
		s.log.Warn().Err(err).Str("type", actType).Msg("activity: failed to marshal metadata")
		return
	}
	if err := s.repo.Ingest(ctx, userID, actType, targetID, targetType, b); err != nil {
		s.log.Warn().Err(err).Str("type", actType).Msg("activity: failed to ingest")
	}
}

// GetFeed returns a paginated activity feed for viewerID.
// limit defaults to 20 if 0 or out of range; max is 50.
// cursor is an ISO8601 timestamp; pass "" for the first page.
func (s *ActivityService) GetFeed(ctx context.Context, viewerID string, limit int, cursor string) (*model.FeedResponse, error) {
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	items, err := s.repo.GetFeed(ctx, viewerID, limit, cursor)
	if err != nil {
		return nil, err
	}
	var nextCursor string
	if len(items) == limit {
		nextCursor = items[len(items)-1].CreatedAt.UTC().Format(time.RFC3339Nano)
	}
	return &model.FeedResponse{Items: items, Cursor: nextCursor}, nil
}
