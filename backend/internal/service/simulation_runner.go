package service

import (
	"context"
	"time"

	"github.com/rs/zerolog"

	"github.com/jnnngs/sub-12/backend/internal/repository"
)

// simulationTickInterval is how often the runner wakes to perform a slice of
// the configured hourly action budget.
const simulationTickInterval = time.Minute

// maxActionsPerTick caps how much work a single tick performs, bounding load
// even if actions_per_hour is set very high.
const maxActionsPerTick = 250

// SimulationRunner is the background goroutine that paces the activity
// simulation engine. Each tick it converts actions_per_hour into a per-tick
// budget (carrying the fractional remainder forward) and asks the service to
// perform that many actions, but only inside the configured active hours.
type SimulationRunner struct {
	svc      *SimulationService
	log      zerolog.Logger
	interval time.Duration
	leftover float64
}

func NewSimulationRunner(svc *SimulationService, log zerolog.Logger) *SimulationRunner {
	return &SimulationRunner{svc: svc, log: log, interval: simulationTickInterval}
}

func (r *SimulationRunner) Run(ctx context.Context) {
	ticker := time.NewTicker(r.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			r.tick(ctx)
		}
	}
}

func (r *SimulationRunner) tick(ctx context.Context) {
	settings, err := r.svc.GetSettings(ctx)
	if err != nil {
		if err != repository.ErrNotFound {
			r.log.Warn().Err(err).Msg("simulation: load settings failed")
		}
		return
	}
	if !settings.Enabled || settings.ActionsPerHour <= 0 {
		r.leftover = 0
		return
	}
	if !withinActiveHours(time.Now().UTC().Hour(), settings.ActiveStartHour, settings.ActiveEndHour) {
		r.leftover = 0
		return
	}

	budget := float64(settings.ActionsPerHour)*r.interval.Hours() + r.leftover
	n := int(budget)
	r.leftover = budget - float64(n)
	if n <= 0 {
		return
	}
	if n > maxActionsPerTick {
		n = maxActionsPerTick
	}

	performed, err := r.svc.RunOnce(ctx, n)
	if err != nil {
		r.log.Warn().Err(err).Msg("simulation: run failed")
		return
	}
	if performed > 0 {
		r.log.Info().Int("performed", performed).Msg("simulation tick")
	}
}

// withinActiveHours reports whether hour (0-23) falls in [start, end). end is
// exclusive and may be 24 (whole day). Supports wrap-around windows where
// start > end (e.g. 20–6 spans overnight).
func withinActiveHours(hour, start, end int) bool {
	if start == end {
		return true
	}
	if start < end {
		return hour >= start && hour < end
	}
	// Wrap-around window.
	return hour >= start || hour < end
}
