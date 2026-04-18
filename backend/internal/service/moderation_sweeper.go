package service

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog"
)

// ModerationSweeper periodically promotes flagged-but-not-amended comments and
// posts to hidden_at once they exceed the grace window. The amendment check is
// `updated_at <= flagged_at` — if the author has edited the row since it was
// flagged, the sweeper leaves it alone (the flag itself is cleared by the
// service layer on edit).
type ModerationSweeper struct {
	db       *pgxpool.Pool
	log      zerolog.Logger
	grace    time.Duration
	interval time.Duration
}

func NewModerationSweeper(db *pgxpool.Pool, log zerolog.Logger, grace, interval time.Duration) *ModerationSweeper {
	return &ModerationSweeper{db: db, log: log, grace: grace, interval: interval}
}

// Run blocks until ctx is cancelled, sweeping on the configured interval. A
// sweep also runs once immediately so expired flags from a previous process
// crash are caught on boot.
func (s *ModerationSweeper) Run(ctx context.Context) {
	if s.interval <= 0 {
		s.interval = 15 * time.Minute
	}
	if s.grace <= 0 {
		s.grace = 48 * time.Hour
	}
	s.sweepOnce(ctx)
	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.sweepOnce(ctx)
		}
	}
}

func (s *ModerationSweeper) sweepOnce(ctx context.Context) {
	interval := fmt.Sprintf("%d seconds", int64(s.grace.Seconds()))

	c, err := s.db.Exec(ctx, `
		UPDATE comments
		SET hidden_at = NOW()
		WHERE flagged_at IS NOT NULL
		  AND hidden_at IS NULL
		  AND updated_at <= flagged_at
		  AND flagged_at < NOW() - $1::interval
	`, interval)
	if err != nil {
		s.log.Error().Err(err).Msg("moderation sweeper: comments")
	} else if c.RowsAffected() > 0 {
		s.log.Info().Int64("count", c.RowsAffected()).Msg("moderation sweeper: auto-hid comments")
	}

	p, err := s.db.Exec(ctx, `
		UPDATE posts
		SET hidden_at = NOW()
		WHERE flagged_at IS NOT NULL
		  AND hidden_at IS NULL
		  AND updated_at <= flagged_at
		  AND flagged_at < NOW() - $1::interval
	`, interval)
	if err != nil {
		s.log.Error().Err(err).Msg("moderation sweeper: posts")
	} else if p.RowsAffected() > 0 {
		s.log.Info().Int64("count", p.RowsAffected()).Msg("moderation sweeper: auto-hid posts")
	}
}
