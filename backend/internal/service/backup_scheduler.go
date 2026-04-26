package service

import (
	"context"
	"time"

	"github.com/rs/zerolog"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)

// BackupScheduler ticks every minute and triggers a scheduled backup when the
// current wall-clock time matches the configured frequency + hour-of-day +
// day-of-week. It dedupes against backup_settings.last_run_at so the same
// hourly slot doesn't fire twice if the process restarts mid-window.
type BackupScheduler struct {
	repo *repository.BackupRepository
	svc  *BackupService
	log  zerolog.Logger
}

func NewBackupScheduler(repo *repository.BackupRepository, svc *BackupService, log zerolog.Logger) *BackupScheduler {
	return &BackupScheduler{repo: repo, svc: svc, log: log}
}

func (s *BackupScheduler) Run(ctx context.Context) {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.tick(ctx)
		}
	}
}

func (s *BackupScheduler) tick(ctx context.Context) {
	settings, err := s.repo.GetSettings(ctx)
	if err != nil {
		s.log.Warn().Err(err).Msg("backup scheduler: get settings")
		return
	}
	if !settings.Enabled || settings.Frequency == "disabled" {
		return
	}
	if !isDue(settings, time.Now().UTC()) {
		return
	}
	s.log.Info().Str("frequency", settings.Frequency).Msg("backup scheduler: running scheduled backup")
	if _, err := s.svc.RunBackup(ctx, "scheduled", nil); err != nil {
		s.log.Error().Err(err).Msg("backup scheduler: run failed")
	}
}

// isDue returns true when `now` is within the current scheduled window AND a
// previous successful run for that same window has not already been recorded
// in last_run_at. Windows are minute-resolution at the configured hour.
func isDue(settings *model.BackupSettings, now time.Time) bool {
	if now.Minute() != 0 {
		return false
	}
	switch settings.Frequency {
	case "hourly":
		// fire on every top-of-hour
	case "daily":
		if int(settings.HourOfDay) != now.Hour() {
			return false
		}
	case "weekly":
		if int(settings.HourOfDay) != now.Hour() || int(settings.DayOfWeek) != int(now.Weekday()) {
			return false
		}
	default:
		return false
	}
	if settings.LastRunAt != nil {
		// Skip if last run started within the same hour bucket.
		last := settings.LastRunAt.UTC()
		if last.Year() == now.Year() && last.YearDay() == now.YearDay() && last.Hour() == now.Hour() {
			return false
		}
	}
	return true
}
